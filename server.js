'use strict';

const path = require('path');
const express = require('express');
const {
  cloneCatalog, walkMinutes, CATEGORIES, ITEM_ALIASES,
  LANDMARKS, PICKUP_SPOTS, residenceById
} = require('./catalog.js');
const matching = require('./matching.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/** In-memory board. Seeded, appended to during a demo, clean on every restart. */
const catalog = cloneCatalog();
const board = catalog.posts.slice();

const CANONICAL_ITEMS = Array.from(new Set(Object.values(ITEM_ALIASES))).sort();

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function decorate(post, fromResidenceId) {
  const residence = catalog.residences.find((r) => r.id === post.residenceId);
  const minutes = fromResidenceId ? walkMinutes(fromResidenceId, post.residenceId) : null;
  const matches = matching.findMatches(post, board, 5);

  return {
    ...post,
    residence,
    categoryName: (CATEGORIES.find((c) => c.id === post.category) || {}).name || 'Everything else',
    walkMinutes: minutes,
    walkLabel: minutes === null ? null
      : minutes === 0 ? 'Your building'
      : minutes + ' min walk',
    matchCount: matches.length,
    topMatch: matches[0]
      ? { poster: matches[0].post.poster,
          residence: matches[0].post.residence ? matches[0].post.residence.name : null,
          walkMinutes: matches[0].walkMinutes,
          reason: matches[0].reason }
      : null
  };
}

/** A match, with enough of the other post attached for the UI to render it. */
function decorateMatch(match, fromResidenceId, mineResidenceId) {
  const mine = mineResidenceId || fromResidenceId;
  return {
    score: match.score,
    reason: match.reason,
    exactItem: match.exactItem,
    walkMinutes: match.walkMinutes,
    overlap: match.overlap,
    pickup: describePickup(match.pickup, mine, match.post.residenceId),
    post: decorate(match.post, fromResidenceId)
  };
}

/**
 * Turn a pickup into something the interface can draw and read aloud: who
 * walks how far, and the two endpoints, so the map can plot the handover.
 */
function describePickup(pickup, mineResidenceId, theirResidenceId) {
  if (!pickup) return null;
  const mine = residenceById(mineResidenceId);
  const theirs = residenceById(theirResidenceId);

  if (pickup.sameBuilding) {
    return {
      sameBuilding: true,
      label: 'Same building — just knock',
      from: mine, to: theirs, spot: null,
      yourWalk: 0, theirWalk: 0
    };
  }

  return {
    sameBuilding: false,
    spot: pickup.spot,
    label: 'Meet at ' + pickup.spot.name,
    detail: pickup.walkA + ' min for you, ' + pickup.walkB + ' min for them',
    yourWalk: pickup.walkA,
    theirWalk: pickup.walkB,
    longest: pickup.longest,
    from: mine,
    to: theirs
  };
}

// ---------------------------------------------------------------------------
// Parsing what someone typed
// ---------------------------------------------------------------------------

/**
 * Claude reads a messy one-line post and returns structure.
 *
 * The division of labour is the same one that makes the rest of this project
 * defensible: the model handles LANGUAGE — that "iron thing for wrinkly
 * clothes" is a garment steamer, that "formal thursday" is a date — and the
 * matching engine handles every decision about who gets matched to whom.
 *
 * matching.parsePost() is not a stub for when this is unavailable. It is a
 * real rule-based parser doing the same job on tidier input, and it is what
 * runs when there is no API key. Anything this returns is validated against
 * the same shape before it is used.
 */
async function parseWithClaude(raw, todayIso) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        temperature: 0,
        messages: [{
          role: 'user',
          content:
            'On this campus, students post "daha" (does anyone have a — a REQUEST to borrow or ' +
            'receive something) and "dawa" (does anyone want a — an OFFER to lend or give ' +
            'something away).\n\n' +
            'Today is ' + todayIso + ', a Sunday.\n\n' +
            'Parse this post:\n"""\n' + raw + '\n"""\n\n' +
            'Reply with ONLY a JSON object, no prose, no code fence:\n' +
            '{\n' +
            '  "kind": "daha" or "dawa",\n' +
            '  "mode": for a daha "borrow" (giving it back) or "keep" (keeping it); ' +
            'for a dawa "lend" (wants it back) or "give" (does not),\n' +
            '  "item": the thing itself, singular, plain and generic — "garment steamer", not ' +
            '"Amara\'s steamer for formal". If it matches one of these known items use that exact ' +
            'string: ' + CANONICAL_ITEMS.map((i) => i.replace(/-/g, ' ')).join(', ') + '\n' +
            '  "category": one of ' + CATEGORIES.map((c) => c.id).join(', ') + ',\n' +
            '  "from": ISO date the need or offer starts (YYYY-MM-DD),\n' +
            '  "until": ISO date it ends (YYYY-MM-DD)\n' +
            '}\n\n' +
            'Resolve relative dates against today. "Thursday" means the next Thursday. ' +
            'If no timing is mentioned, use today through two weeks out.'
        }]
      })
    });

    if (!response.ok) return null;
    const body = await response.json();
    const text = (body.content || []).filter((b) => b.type === 'text')
      .map((b) => b.text).join('').trim();
    const draft = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim());

    // Validate everything. A model that returns nonsense must not reach the board.
    const kind = draft.kind === 'dawa' ? 'dawa' : draft.kind === 'daha' ? 'daha' : null;
    if (!kind) return null;

    const validModes = kind === 'daha' ? ['borrow', 'keep'] : ['lend', 'give'];
    const mode = validModes.includes(draft.mode) ? draft.mode : validModes[0];

    const item = String(draft.item || '').trim().slice(0, 60);
    if (!item) return null;

    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const from = iso.test(draft.from) ? draft.from : todayIso;
    const until = iso.test(draft.until) && draft.until >= from
      ? draft.until
      : matching.addDays(from, 14);

    return {
      kind, mode, item,
      canonicalItem: matching.canonicalItem(item),
      category: CATEGORIES.some((c) => c.id === draft.category)
        ? draft.category
        : matching.categoryFor(item),
      from, until,
      kindConfident: true,
      source: 'claude'
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Claude when it is available and works; the rule parser otherwise. Always returns something. */
async function parse(raw, todayIso) {
  const rules = matching.parsePost(raw, todayIso);
  try {
    const claude = await parseWithClaude(raw, todayIso);
    return claude || rules;
  } catch {
    return rules;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/board', (req, res) => {
  const from = catalog.residences.some((r) => r.id === req.query.from) ? req.query.from : null;
  const kind = req.query.kind === 'daha' || req.query.kind === 'dawa' ? req.query.kind : null;

  let posts = board.map((p) => decorate(p, from));
  if (kind) posts = posts.filter((p) => p.kind === kind);

  // Posts with a waiting match first — that is the whole reason to open this.
  posts.sort((a, b) =>
    b.matchCount - a.matchCount ||
    (a.walkMinutes ?? 999) - (b.walkMinutes ?? 999) ||
    (a.postedOn < b.postedOn ? 1 : -1));

  res.json({
    today: catalog.today,
    campus: catalog.campus,
    residences: catalog.residences,
    categories: CATEGORIES,
    landmarks: LANDMARKS,
    pickupSpots: PICKUP_SPOTS,
    from,
    posts,
    counts: {
      total: board.length,
      daha: board.filter((p) => p.kind === 'daha').length,
      dawa: board.filter((p) => p.kind === 'dawa').length,
      matched: board.map((p) => matching.findMatches(p, board, 1).length).filter(Boolean).length
    },
    aiParsing: Boolean(process.env.ANTHROPIC_API_KEY)
  });
});

/** Type a sentence, see what it means and who already has one. Nothing is posted. */
app.post('/api/parse', async (req, res) => {
  const raw = String((req.body && req.body.raw) || '').trim().slice(0, 300);
  const residenceId = catalog.residences.some((r) => r.id === req.body.residenceId)
    ? req.body.residenceId : catalog.residences[0].id;

  if (!raw) return res.status(400).json({ error: 'Type something first.' });

  const draft = await parse(raw, catalog.today);
  const probe = { ...draft, id: '__preview__', poster: '__you__', residenceId, raw };
  const matches = matching.findMatches(probe, board, 5);

  res.json({
    draft,
    matches: matches.map((m) => decorateMatch(m, residenceId, residenceId)),
    residenceId
  });
});

app.post('/api/posts', (req, res) => {
  const b = req.body || {};
  const raw = String(b.raw || '').trim().slice(0, 300);
  const item = String(b.item || '').trim().slice(0, 60);
  const residenceId = catalog.residences.some((r) => r.id === b.residenceId) ? b.residenceId : null;
  const kind = b.kind === 'dawa' ? 'dawa' : 'daha';
  const validModes = kind === 'daha' ? ['borrow', 'keep'] : ['lend', 'give'];

  if (!item) return res.status(400).json({ error: 'What is the thing?' });
  if (!residenceId) return res.status(400).json({ error: 'Where are you?' });

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(b.from) ? b.from : catalog.today;
  const until = iso.test(b.until) && b.until >= from ? b.until : matching.addDays(from, 14);

  const post = {
    id: 'p_' + Date.now().toString(36),
    kind,
    mode: validModes.includes(b.mode) ? b.mode : validModes[0],
    raw: raw || item,
    item,
    category: CATEGORIES.some((c) => c.id === b.category) ? b.category : matching.categoryFor(item),
    poster: String(b.poster || 'You').trim().slice(0, 40) || 'You',
    residenceId,
    postedOn: catalog.today,
    from, until,
    isMine: true
  };

  board.unshift(post);
  res.json({
    post: decorate(post, residenceId),
    matches: matching.findMatches(post, board, 5).map((m) => decorateMatch(m, residenceId, residenceId))
  });
});

app.get('/api/posts/:id/matches', (req, res) => {
  const post = board.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'No such post.' });
  const from = catalog.residences.some((r) => r.id === req.query.from)
    ? req.query.from : post.residenceId;
  res.json({
    post: decorate(post, from),
    matches: matching.findMatches(post, board, 5).map((m) => decorateMatch(m, from, post.residenceId))
  });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n  Daha is up.  http://localhost:${PORT}\n`);
    console.log(`  Parsing: ${process.env.ANTHROPIC_API_KEY
      ? 'Claude, with the rule parser underneath'
      : 'rule parser (set ANTHROPIC_API_KEY for messier input)'}\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is busy — Daha may already be running.`);
      console.error(`  Open http://localhost:${PORT}, or: PORT=3001 npm start\n`);
      process.exit(1);
    }
    throw err;
  });
}

module.exports = { app, decorate, decorateMatch, describePickup, parse };
