'use strict';

/**
 * Build the static version of Daha for GitHub Pages.
 *
 * GitHub Pages serves files, not processes — there is no Node and no Express.
 * That is survivable here only because of how the project is already split:
 *
 *   matching.js  is pure. No I/O, no clock, the caller passes the date.
 *   catalog.js   is data.
 *
 * So the engine moves into the browser untouched. What this script does is
 * bundle those two files with the presentation helpers lifted out of
 * server.js, then swap the client's one `json()` call for a router that
 * dispatches to the same handlers locally instead of over HTTP.
 *
 * WHAT IS LOST: the Claude parsing path, which needs a key and therefore a
 * server. The rule parser runs instead — and since that is a real parser
 * rather than a stub, the static build is fully usable. The interface already
 * labels which one read your post, so the page stays honest about it.
 *
 * The board is per-visitor and resets on reload, which is the right behaviour
 * for a public demo nobody is moderating.
 *
 * Output goes to docs/, which is what GitHub Pages is pointed at. The Express
 * app in the repo root is untouched and stays the thing you run locally.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Strip CommonJS wrapping so a file can be concatenated into one script. */
function deModule(src) {
  return src
    .replace(/^'use strict';\n/m, '')
    .replace(/^const \{[\s\S]*?\} = require\([^)]*\);\n/m, '')
    .replace(/^const [A-Za-z_$][\w$]* = require\([^)]*\);\n/gm, '')
    .replace(/\nmodule\.exports\s*=\s*\{[\s\S]*?\};\s*$/m, '\n')
    .trim();
}

// --- 1. The engine, verbatim apart from the module wrapper -----------------
const catalog = deModule(read('catalog.js'));
const matching = deModule(read('matching.js'));

// --- 2. Presentation helpers lifted out of server.js -----------------------
// Lines 23..94: decorate, decorateMatch, describePickup.
const serverLines = read('server.js').split('\n');
const presentation = serverLines.slice(22, 94).join('\n').trim();

// --- 3. The four route handlers, rewritten as plain functions --------------
const api = `
/* ===========================================================================
   The four endpoints, called directly instead of over HTTP.

   Same inputs, same validation, same shapes. The only thing missing is the
   Claude parsing path, which needs a key and therefore a server — so this
   build always goes through matching.parsePost(), the rule parser.
   =========================================================================== */

const CATEGORIES = CATEGORIES_LIST;
const catalog = cloneCatalog();
const board = catalog.posts.slice();

const matching = {
  findMatches, parsePost, canonicalItem, categoryFor, addDays, daysBetween, bestPickup
};

function apiBoard(from, kind) {
  const validFrom = catalog.residences.some((r) => r.id === from) ? from : null;
  const validKind = kind === 'daha' || kind === 'dawa' ? kind : null;

  let posts = board.map((p) => decorate(p, validFrom));
  if (validKind) posts = posts.filter((p) => p.kind === validKind);

  posts.sort((a, b) =>
    b.matchCount - a.matchCount ||
    (a.walkMinutes ?? 999) - (b.walkMinutes ?? 999) ||
    (a.postedOn < b.postedOn ? 1 : -1));

  return {
    today: catalog.today,
    campus: catalog.campus,
    residences: catalog.residences,
    categories: CATEGORIES,
    landmarks: LANDMARKS,
    pickupSpots: PICKUP_SPOTS,
    from: validFrom,
    posts,
    counts: {
      total: board.length,
      daha: board.filter((p) => p.kind === 'daha').length,
      dawa: board.filter((p) => p.kind === 'dawa').length,
      matched: board.map((p) => findMatches(p, board, 1).length).filter(Boolean).length
    },
    aiParsing: false
  };
}

function apiParse(body) {
  const raw = String((body && body.raw) || '').trim().slice(0, 300);
  const residenceId = catalog.residences.some((r) => r.id === body.residenceId)
    ? body.residenceId : catalog.residences[0].id;
  if (!raw) throw new Error('Type something first.');

  const draft = parsePost(raw, catalog.today);
  const probe = { ...draft, id: '__preview__', poster: '__you__', residenceId, raw };
  const matches = findMatches(probe, board, 5);

  return {
    draft,
    matches: matches.map((m) => decorateMatch(m, residenceId, residenceId)),
    residenceId
  };
}

function apiCreatePost(b) {
  const raw = String(b.raw || '').trim().slice(0, 300);
  const item = String(b.item || '').trim().slice(0, 60);
  const residenceId = catalog.residences.some((r) => r.id === b.residenceId) ? b.residenceId : null;
  const kind = b.kind === 'dawa' ? 'dawa' : 'daha';
  const validModes = kind === 'daha' ? ['borrow', 'keep'] : ['lend', 'give'];

  if (!item) throw new Error('What is the thing?');
  if (!residenceId) throw new Error('Where are you?');

  const iso = /^\\d{4}-\\d{2}-\\d{2}$/;
  const from = iso.test(b.from) ? b.from : catalog.today;
  const until = iso.test(b.until) && b.until >= from ? b.until : addDays(from, 14);

  const post = {
    id: 'p_' + Date.now().toString(36),
    kind,
    mode: validModes.includes(b.mode) ? b.mode : validModes[0],
    raw: raw || item,
    item,
    category: CATEGORIES.some((c) => c.id === b.category) ? b.category : categoryFor(item),
    poster: String(b.poster || 'You').trim().slice(0, 40) || 'You',
    residenceId,
    postedOn: catalog.today,
    from, until,
    isMine: true
  };

  board.unshift(post);
  return {
    post: decorate(post, residenceId),
    matches: findMatches(post, board, 5).map((m) => decorateMatch(m, residenceId, residenceId))
  };
}

function apiPostMatches(id, from) {
  const post = board.find((p) => p.id === id);
  if (!post) throw new Error('No such post.');
  const validFrom = catalog.residences.some((r) => r.id === from) ? from : post.residenceId;
  return {
    post: decorate(post, validFrom),
    matches: findMatches(post, board, 5)
      .map((m) => decorateMatch(m, validFrom, post.residenceId))
  };
}
`.trim();

// --- 4. The client, with its one network call routed locally ---------------
let app = read('public/app.js');

const OLD_JSON = `  function json(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body && body.error ? body.error : 'Request failed');
        return body;
      });
    });
  }`;

const NEW_JSON = `  // Static build: the same promise shape the Express version had, so every
  // call site below is untouched — the work happens in this tab instead.
  function json(url, options) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var body = options && options.body ? JSON.parse(options.body) : {};
          var q = {};
          var qs = url.indexOf('?');
          if (qs > -1) {
            url.slice(qs + 1).split('&').forEach(function (pair) {
              var kv = pair.split('=');
              q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
            });
          }
          var route = qs > -1 ? url.slice(0, qs) : url;

          if (route === '/api/board') return resolve(apiBoard(q.from, q.kind));
          if (route === '/api/parse') return resolve(apiParse(body));
          if (route === '/api/posts') return resolve(apiCreatePost(body));

          var m = /^\\/api\\/posts\\/([^/]+)\\/matches$/.exec(route);
          if (m) return resolve(apiPostMatches(decodeURIComponent(m[1]), q.from));

          reject(new Error('No such endpoint: ' + route));
        } catch (err) { reject(err); }
      }, 0);
    });
  }`;

if (!app.includes(OLD_JSON)) throw new Error('json() not found in public/app.js — did it change?');
app = app.replace(OLD_JSON, NEW_JSON);

// --- 5. Write it out -------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Pages would otherwise run the output through Jekyll, which ignores files
// and folders beginning with an underscore. Nothing here starts with one, but
// this removes the whole class of surprise.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const html = read('public/index.html')
  .replace('<script src="app.js"></script>',
           '<script src="daha.js"></script>\n<script src="app.js"></script>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'style.css'), read('public/style.css'));

const bundle = [
  '/* Daha — static build for GitHub Pages. Generated by build-pages.js.',
  ' * Do not edit by hand; edit the sources and run `npm run build:pages`.',
  ' *',
  ' * catalog.js and matching.js are included verbatim apart from their module',
  ' * wrappers. The engine that runs here is the same engine the tests cover.',
  ' */',
  '',
  catalog,
  '',
  matching,
  '',
  '/* ---- presentation, lifted from server.js ---- */',
  presentation,
  '',
  api.replace('CATEGORIES_LIST', 'CATEGORIES_SOURCE')
     .replace('const CATEGORIES = CATEGORIES_SOURCE;', ''),
  ''
].join('\n');

fs.writeFileSync(path.join(OUT, 'daha.js'), bundle);
fs.writeFileSync(path.join(OUT, 'app.js'), app);

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + 'KB';
console.log('docs/ built:');
['index.html', 'style.css', 'daha.js', 'app.js'].forEach((f) =>
  console.log('  ' + f.padEnd(12) + kb(f)));
