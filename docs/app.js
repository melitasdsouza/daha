/* Daha — client. Vanilla, no build step, no dependencies.
   Every rule lives on the server; this renders, draws the map, and asks. */

(function () {
  'use strict';

  var state = null;
  var activeKind = '';
  var lastParse = null;
  var activeRoute = null;   // { fromId, toId, spotId } drawn on the map

  var SVGNS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Static build: the same promise shape the Express version had, so every
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

          var m = /^\/api\/posts\/([^/]+)\/matches$/.exec(route);
          if (m) return resolve(apiPostMatches(decodeURIComponent(m[1]), q.from));

          reject(new Error('No such endpoint: ' + route));
        } catch (err) { reject(err); }
      }, 0);
    });
  }

  var MODE_WORDS = {
    borrow: 'to borrow', keep: 'to keep',
    lend: 'happy to lend', give: 'giving it away'
  };

  function niceDate(iso) {
    return new Date(Date.parse(iso + 'T00:00:00Z'))
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function dateRange(a, b) { return a === b ? niceDate(a) : niceDate(a) + ' – ' + niceDate(b); }

  /* =======================================================================
     The campus map.

     Data coordinates put the Main Quad at the origin with east as +x and
     north as +y. SVG grows downward, so every y is negated on the way in —
     that is the only transform, which keeps the catalogue readable as
     geography rather than as screen positions.
     ======================================================================= */

  var MY = function (y) { return -y; };

  function drawCampus(g) {
    // Campus Drive — the ring road everything sits inside.
    g.appendChild(svg('ellipse', {
      cx: 120, cy: MY(-250), rx: 760, ry: 690,
      fill: 'none', stroke: '#b5b5a4', 'stroke-width': 9, 'stroke-dasharray': '4 30'
    }));

    // Palm Drive, running out of the Oval to the north-west.
    g.appendChild(svg('line', {
      x1: -60, y1: MY(455), x2: -250, y2: MY(640),
      stroke: '#b5b5a4', 'stroke-width': 16, 'stroke-linecap': 'round'
    }));
    label(g, 'Palm Dr', -215, MY(600), 'quad-label', 'start');

    // Lake Lagunita.
    g.appendChild(svg('ellipse', {
      cx: -600, cy: MY(-110), rx: 135, ry: 88,
      fill: '#dee2ff', stroke: '#17170f', 'stroke-width': 7
    }));

    // The Oval.
    g.appendChild(svg('ellipse', {
      cx: -40, cy: MY(400), rx: 140, ry: 68,
      fill: '#e6e5d9', stroke: '#17170f', 'stroke-width': 7
    }));
    label(g, 'The Oval', -40, MY(395) + 15, 'quad-label');

    // Main Quad — what everybody orients from.
    g.appendChild(svg('rect', {
      x: -155, y: MY(70), width: 310, height: 145,
      fill: '#e6e5d9', stroke: '#17170f', 'stroke-width': 8
    }));
    label(g, 'MAIN QUAD', 0, MY(-10), 'quad-label');
  }

  /** Map text, always with its halo class so it survives an overlap. */
  function label(g, text, x, y, cls, anchor) {
    var t = svg('text', {
      x: x, y: y, 'text-anchor': anchor || 'middle',
      class: 'map-type ' + cls
    });
    t.textContent = text;
    g.appendChild(t);
    return t;
  }

  /**
   * East campus has six residences inside about four hundred metres, so their
   * labels are pushed alternately above and below the dot. Without this they
   * sit on top of each other and the densest part of the map is the least
   * readable part.
   */
  var LABEL_ABOVE = {
    wilbur: true, crothers: true, govco: true,
    manzanita: true, lagunita: true, mirrielees: true
  };

  function renderMap() {
    var map = $('map');
    clear(map);
    if (!state) return;

    var base = svg('g', {});
    map.appendChild(base);
    drawCampus(base);

    var me = $('from').value;

    // ---- the route, drawn under the markers so pins stay legible ---------
    if (activeRoute) {
      var a = state.residences.find(function (r) { return r.id === activeRoute.fromId; });
      var b = state.residences.find(function (r) { return r.id === activeRoute.toId; });
      var s = activeRoute.spotId
        ? state.pickupSpots.find(function (p) { return p.id === activeRoute.spotId; })
        : null;
      if (a && b) {
        var via = s || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        [[a, via], [via, b]].forEach(function (leg) {
          base.appendChild(svg('line', {
            x1: leg[0].x, y1: MY(leg[0].y), x2: leg[1].x, y2: MY(leg[1].y), class: 'route-leg'
          }));
        });
        base.appendChild(svg('circle', { cx: b.x, cy: MY(b.y), r: 24, class: 'route-end' }));
      }
    }

    // ---- pickup spots ----------------------------------------------------
    state.pickupSpots.forEach(function (spot) {
      var live = activeRoute && activeRoute.spotId === spot.id;
      var m = svg('rect', {
        x: spot.x - 17, y: MY(spot.y) - 17, width: 34, height: 34,
        transform: 'rotate(45 ' + spot.x + ' ' + MY(spot.y) + ')',
        class: 'spot-mark' + (live ? ' live' : '')
      });
      var title = svg('title', {});
      title.textContent = spot.name + ' — ' + spot.note;
      m.appendChild(title);
      base.appendChild(m);

      label(base, spot.short, spot.x, MY(spot.y) - 34,
        'spot-label' + (live ? ' live' : ''));
    });

    // ---- residences ------------------------------------------------------
    state.residences.forEach(function (r) {
      var mine = r.id === me;
      var dot = svg('circle', {
        cx: r.x, cy: MY(r.y), r: 26,
        class: 'res-dot' + (mine ? ' me' : ''),
        role: 'button', tabindex: '0'
      });
      var t = svg('title', {});
      t.textContent = r.name + (mine ? ' — you live here' : ' — tap to move in');
      dot.appendChild(t);
      dot.addEventListener('click', function () {
        $('from').value = r.id;
        activeRoute = null;
        $('route').hidden = true;
        load();
      });
      base.appendChild(dot);

      var above = LABEL_ABOVE[r.id];
      label(base, r.short || r.name,
        r.x, MY(r.y) + (above ? -46 : 76), 'res-label' + (mine ? ' me' : ''));
    });
  }

  function showRoute(pickup) {
    if (!pickup || !pickup.from || !pickup.to) return;
    activeRoute = {
      fromId: pickup.from.id,
      toId: pickup.to.id,
      spotId: pickup.spot ? pickup.spot.id : null
    };
    renderMap();

    var box = $('route');
    clear(box);
    box.appendChild(el('div', 'rt-head', 'Hand it over at'));
    box.appendChild(el('div', 'rt-where', pickup.sameBuilding ? 'Same building' : pickup.spot.name));
    box.appendChild(el('div', 'rt-splits', pickup.sameBuilding
      ? 'You both live in ' + pickup.from.name + '. Just knock.'
      : pickup.yourWalk + ' min for you · ' + pickup.theirWalk + ' min for them'));
    if (!pickup.sameBuilding) {
      box.appendChild(el('div', 'rt-note', pickup.spot.note + ' Open ' + pickup.spot.open + '.'));
    }
    box.hidden = false;
    renderSpotList();
  }

  function renderSpotList() {
    var ul = $('spot-list');
    clear(ul);
    var me = $('from').value;
    state.pickupSpots.forEach(function (spot) {
      var li = el('li');
      li.appendChild(el('span', 'nm', spot.name));
      li.appendChild(el('span', 'open', spot.open));
      var mins = state.walkToSpot && state.walkToSpot[spot.id];
      li.appendChild(el('span', 'mins', mins != null ? mins + ' min' : ''));
      ul.appendChild(li);
    });
  }

  /* ====================================================== matches ========= */

  function hitRow(match) {
    var row = el('button', 'hit');
    row.type = 'button';

    row.appendChild(el('div', 'who' + (match.post.kind === 'daha' ? ' ask' : ''),
      match.post.poster.charAt(0).toUpperCase()));

    var main = el('div', 'hit-main');
    main.appendChild(el('div', 'hit-item', match.post.item));
    main.appendChild(el('div', 'hit-why', match.reason));
    main.appendChild(el('div', 'hit-who',
      match.post.poster + ' · ' + match.post.residence.name + ' · free ' +
      dateRange(match.post.from, match.post.until)));

    if (match.pickup) {
      var meet = el('div', 'meetup');
      meet.appendChild(el('span', 'pin-ico'));
      meet.appendChild(el('span', 'where',
        match.pickup.sameBuilding ? 'Same building — just knock' : match.pickup.spot.name));
      if (!match.pickup.sameBuilding) {
        meet.appendChild(el('span', 'splits',
          match.pickup.yourWalk + ' min you / ' + match.pickup.theirWalk + ' min them'));
      }
      main.appendChild(meet);
    }

    row.appendChild(main);
    row.addEventListener('click', function () {
      if (match.pickup) showRoute(match.pickup);
      openModal(match.post);
    });
    return row;
  }

  /* ====================================================== compose ========= */

  function showReadout(draft) {
    var chips = $('readout-chips');
    clear(chips);
    function rc(k, v, cls) {
      var c = el('div', 'rc' + (cls ? ' ' + cls : ''));
      c.appendChild(el('span', 'k', k));
      c.appendChild(el('span', 'v', v));
      return c;
    }
    chips.appendChild(rc(draft.kind === 'daha' ? 'looking for' : 'offering',
      draft.item, draft.kind === 'daha' ? 'ask' : 'give'));
    chips.appendChild(rc('arrangement', MODE_WORDS[draft.mode] || draft.mode));
    chips.appendChild(rc('when', dateRange(draft.from, draft.until)));
    chips.appendChild(rc('category', draft.category));
    $('readout-src').textContent = draft.source === 'claude' ? 'claude' : 'rules';
    $('readout').hidden = false;
  }

  function showHits(draft, matches) {
    var head = $('hits-head');
    clear(head);
    var list = $('hit-list');
    clear(list);

    if (matches.length) {
      head.className = 'hits-head';
      var closest = matches.reduce(function (best, m) {
        return (m.walkMinutes !== null && m.walkMinutes < best) ? m.walkMinutes : best;
      }, 999);
      head.appendChild(el('span', 'n', String(matches.length) +
        (draft.kind === 'daha'
          ? (matches.length === 1 ? ' person has one' : ' people have one')
          : (matches.length === 1 ? ' person wants one' : ' people want one'))));
      if (closest < 999) {
        head.appendChild(document.createTextNode(' — closest is ' + closest + ' minutes away.'));
      }
      matches.forEach(function (m) { list.appendChild(hitRow(m)); });
      if (matches[0] && matches[0].pickup) showRoute(matches[0].pickup);
      $('post-it').textContent = 'Pin it up anyway';
    } else {
      head.className = 'hits-head zero';
      head.appendChild(el('span', 'n', 'Nobody yet'));
      head.appendChild(document.createTextNode(
        draft.kind === 'daha' ? ' has one on the board.' : ' is asking for one.'));
      list.appendChild(el('div', 'nowt',
        'Pin it up and it waits. The moment someone posts a ' +
        (draft.kind === 'daha' ? 'dawa' : 'daha') +
        ' that fits, they see you — and Daha picks a spot halfway between you.'));
      $('post-it').textContent = 'Pin it to the board';
      activeRoute = null;
      $('route').hidden = true;
      renderMap();
    }
    $('hits').hidden = false;
  }

  function lookUp() {
    var raw = $('raw').value.trim();
    var status = $('status');
    status.className = 'status';

    if (!raw) {
      status.className = 'status bad';
      status.textContent = 'Type what you need, or what you are getting rid of.';
      return;
    }

    $('go').disabled = true;
    status.textContent = 'Reading it…';
    $('readout').hidden = true;
    $('hits').hidden = true;

    json('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: raw, residenceId: $('from').value })
    }).then(function (res) {
      $('go').disabled = false;
      status.textContent = '';
      lastParse = { raw: raw, draft: res.draft };
      showReadout(res.draft);
      showHits(res.draft, res.matches);
    }).catch(function (err) {
      $('go').disabled = false;
      status.className = 'status bad';
      status.textContent = err.message;
    });
  }

  function pinIt() {
    if (!lastParse) return;
    var status = $('status');
    status.className = 'status';
    status.textContent = 'Pinning…';
    $('post-it').disabled = true;

    json('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        raw: lastParse.raw, kind: lastParse.draft.kind, mode: lastParse.draft.mode,
        item: lastParse.draft.item, category: lastParse.draft.category,
        from: lastParse.draft.from, until: lastParse.draft.until,
        residenceId: $('from').value, poster: 'You'
      })
    }).then(function () {
      $('post-it').disabled = false;
      status.textContent = 'On the board.';
      $('raw').value = '';
      $('readout').hidden = true;
      $('hits').hidden = true;
      lastParse = null;
      return load();
    }).catch(function (err) {
      $('post-it').disabled = false;
      status.className = 'status bad';
      status.textContent = err.message;
    });
  }

  /* ======================================================== the board ===== */

  function pinCard(post) {
    var box = el('button', 'pin ' + (post.kind === 'daha' ? 'ask' : 'give'));
    box.type = 'button';

    var top = el('div', 'pin-top');
    top.appendChild(el('span', 'tagk ' + (post.kind === 'daha' ? 'ask' : 'give'), post.kind));
    top.appendChild(el('span', 'pin-mode', MODE_WORDS[post.mode] || post.mode));
    if (post.walkLabel) top.appendChild(el('span', 'pin-walk', post.walkLabel));
    box.appendChild(top);

    box.appendChild(el('div', 'pin-raw', post.raw));
    box.appendChild(el('div', 'pin-meta',
      post.poster + ' · ' + post.residence.name + ' · ' + dateRange(post.from, post.until)));

    var hit = el('div', 'pin-hit ' + (post.matchCount ? 'on' : 'off'));
    hit.appendChild(el('span', 'blip'));
    hit.appendChild(el('span', null, post.matchCount
      ? post.matchCount + (post.matchCount === 1 ? ' match waiting' : ' matches waiting')
      : 'Waiting for the other half'));
    box.appendChild(hit);

    box.addEventListener('click', function () { openModal(post); });
    return box;
  }

  function render() {
    var host = $('pins');
    clear(host);
    state.posts.forEach(function (p) { host.appendChild(pinCard(p)); });

    var tally = $('tally');
    clear(tally);
    tally.appendChild(el('b', null, String(state.counts.total)));
    tally.appendChild(document.createTextNode(' pinned up — '));
    tally.appendChild(el('b', null, String(state.counts.daha)));
    tally.appendChild(document.createTextNode(' wanted, '));
    tally.appendChild(el('b', null, String(state.counts.dawa)));
    tally.appendChild(document.createTextNode(' going spare. '));
    tally.appendChild(el('span', 'hit-count', String(state.counts.matched)));
    tally.appendChild(document.createTextNode(' already have a match nobody has noticed.'));

    renderMap();
    renderSpotList();
  }

  /* =========================================================== detail ===== */

  function openModal(post) {
    var body = $('modal-body');
    clear(body);

    var top = el('div', 'm-top');
    top.appendChild(el('span', 'tagk ' + (post.kind === 'daha' ? 'ask' : 'give'), post.kind));
    top.appendChild(el('span', 'pin-mode', MODE_WORDS[post.mode] || post.mode));
    body.appendChild(top);

    var h = el('h2', null, post.item);
    h.id = 'modal-title';
    body.appendChild(h);
    body.appendChild(el('p', 'm-raw', post.raw));

    var facts = el('dl', 'm-facts');
    [['Who', post.poster], ['Where', post.residence.name], ['Walk', post.walkLabel || '—'],
     ['When', dateRange(post.from, post.until)], ['Category', post.categoryName],
     ['Pinned', niceDate(post.postedOn)]].forEach(function (pair) {
      var f = el('div', 'm-fact');
      f.appendChild(el('dt', null, pair[0]));
      f.appendChild(el('dd', null, pair[1]));
      facts.appendChild(f);
    });
    body.appendChild(facts);

    body.appendChild(el('p', 'tiny-label', post.kind === 'daha' ? 'Who has one' : 'Who wants one'));
    var list = el('div', 'hit-list');
    list.style.marginTop = '11px';
    body.appendChild(list);

    $('scrim').hidden = false;
    $('modal-x').focus();

    json('/api/posts/' + encodeURIComponent(post.id) + '/matches?from=' +
         encodeURIComponent($('from').value))
      .then(function (res) {
        clear(list);
        if (!res.matches.length) {
          list.appendChild(el('div', 'nowt',
            'Nothing on the other side fits this yet — either nobody has one, or the dates ' +
            'do not line up. It stays pinned and matches the moment someone posts.'));
          return;
        }
        res.matches.forEach(function (m) { list.appendChild(hitRow(m)); });
      })
      .catch(function () {
        clear(list);
        list.appendChild(el('div', 'nowt', 'Could not load matches.'));
      });
  }

  /* ============================================================= boot ===== */

  function load() {
    return json('/api/board?from=' + encodeURIComponent($('from').value) +
                '&kind=' + encodeURIComponent(activeKind))
      .then(function (s) {
        s.walkToSpot = state && state.walkToSpot;
        state = s;
        computeSpotWalks();
        render();
      });
  }

  /** How far each pickup spot is from wherever the shopper says they live. */
  function computeSpotWalks() {
    var me = state.residences.find(function (r) { return r.id === $('from').value; });
    state.walkToSpot = {};
    if (!me) return;
    state.pickupSpots.forEach(function (spot) {
      var metres = Math.hypot(me.x - spot.x, me.y - spot.y);
      state.walkToSpot[spot.id] = metres < 1 ? 0 : Math.max(1, Math.round(metres / 84 + 1));
    });
  }

  function boot() {
    json('/api/board?from=wilbur').then(function (s) {
      state = s;

      var from = $('from');
      clear(from);
      s.residences.forEach(function (r) {
        var o = el('option', null, r.name);
        o.value = r.id;
        from.appendChild(o);
      });
      from.value = s.from || 'wilbur';

      computeSpotWalks();
      render();

      from.addEventListener('change', function () {
        activeRoute = null;
        $('route').hidden = true;
        load();
      });
      $('go').addEventListener('click', lookUp);
      $('raw').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookUp(); });
      $('post-it').addEventListener('click', pinIt);

      Array.prototype.forEach.call($('examples').querySelectorAll('.ex-chip'), function (b) {
        b.addEventListener('click', function () {
          $('raw').value = b.getAttribute('data-raw');
          lookUp();
        });
      });

      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
        t.addEventListener('click', function () {
          activeKind = t.getAttribute('data-kind');
          Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (o) {
            o.setAttribute('aria-selected', String(o === t));
          });
          load();
        });
      });

      $('modal-x').addEventListener('click', function () { $('scrim').hidden = true; });
      $('scrim').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') $('scrim').hidden = true;
      });
    }).catch(function (err) {
      $('tally').textContent = 'Could not load the board: ' + err.message;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
