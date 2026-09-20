'use strict';

/**
 * Daha — tests. Plain Node, no framework. `npm test`.
 *
 * The matching engine is the whole product, so it gets the attention: that it
 * never matches things that cannot transact, that it does match the things a
 * group chat would miss, and that it says so for reasons you can check.
 */

const m = require('./matching.js');
const catalog = require('./catalog.js');
const { decorate } = require('./server.js');

let passed = 0, failed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else {
    failed++; failures.push(name);
    console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? '\n      ' + detail : ''));
  }
}
const eq = (n, a, b) => check(n, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const section = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const TODAY = catalog.TODAY;
const BOARD = catalog.POSTS;

console.log('\n\x1b[1m\x1b[36mDaha — test suite\x1b[0m');

// ---------------------------------------------------------------------------
section('1. Reading what people actually type');

eq('the dictionary resolves a bare word', m.canonicalItem('steamer'), 'garment-steamer');
eq('…and the long form', m.canonicalItem('garment steamer'), 'garment-steamer');
eq('…and a plural', m.canonicalItem('steamers'), 'garment-steamer');
eq('…inside a whole sentence', m.canonicalItem('daha a steamer for formal thursday'), 'garment-steamer');
eq('longest alias wins over the shorter one',
  m.canonicalItem('does anyone have a bike pump'), 'bike-pump');
eq('the shorter one still resolves on its own', m.canonicalItem('daha a bike'), 'bike');
eq('unknown things resolve to nothing rather than guessing',
  m.canonicalItem('daha a didgeridoo'), null);

eq('"steamer" and "garment steamer" are the same thing',
  m.itemSimilarity('steamer', 'garment steamer'), 1);
eq('"airbed" and "air mattress" are the same thing',
  m.itemSimilarity('airbed', 'air mattress'), 1);
eq('"blazer" and "suit jacket" are the same thing',
  m.itemSimilarity('blazer', 'suit jacket'), 1);
eq('a bike is NOT a bike pump', m.itemSimilarity('bike', 'bike pump'), 0);
eq('a rice cooker is NOT a kettle', m.itemSimilarity('rice cooker', 'kettle'), 0);
check('two unknown things still match on shared words',
  m.itemSimilarity('daha a didgeridoo', 'dawa my didgeridoo') > 0.5);
eq('two unrelated unknown things do not match',
  m.itemSimilarity('didgeridoo', 'theremin'), 0);

// ---------------------------------------------------------------------------
section('2. Pulling dates out of ordinary phrasing');

eq('2026-09-20 really is a Sunday',
  new Date(Date.parse(TODAY + 'T00:00:00Z')).getUTCDay(), 0);
eq('"thursday" is the next Thursday', m.nextWeekday(TODAY, 'thursday'), '2026-09-24');
eq('"sunday" from a Sunday means today', m.nextWeekday(TODAY, 'sunday'), TODAY);
eq('"tonight" is today', m.parseWindow('daha a tripod tonight', TODAY).from, TODAY);
eq('"tomorrow" is tomorrow', m.parseWindow('daha an iron tomorrow', TODAY).from, '2026-09-21');
eq('"this weekend" starts on Saturday',
  m.parseWindow('daha an air mattress this weekend', TODAY).from, '2026-09-26');
eq('no timing at all means a two-week window',
  m.daysBetween(TODAY, m.parseWindow('dawa a rice cooker', TODAY).until), 14);

// ---------------------------------------------------------------------------
section('3. Parsing a whole post, with no model involved');

const steamer = m.parsePost('daha a steamer for formal thursday', TODAY);
eq('recognises a daha', steamer.kind, 'daha');
eq('knows it is a borrow, not a keep', steamer.mode, 'borrow');
eq('finds the item', steamer.canonicalItem, 'garment-steamer');
eq('picks the category up from the item', steamer.category, 'clothing');
eq('dates it to Thursday', steamer.from, '2026-09-24');

const fridge = m.parsePost('dawa my mini fridge, moving out next month', TODAY);
eq('recognises a dawa', fridge.kind, 'dawa');
eq('moving out means giving away', fridge.mode, 'give');
eq('finds the item', fridge.canonicalItem, 'mini-fridge');

const lend = m.parsePost('dawa a tripod, happy to lend it for a couple of days', TODAY);
eq('"lend" means they want it back', lend.mode, 'lend');

eq('"does anyone have a" works spelled out',
  m.parsePost('does anyone have a kettle', TODAY).kind, 'daha');
eq('"giving away" reads as an offer',
  m.parsePost('giving away a desk lamp', TODAY).kind, 'dawa');

// ---------------------------------------------------------------------------
section('4. Who can transact with whom');

check('borrow + lend works', m.modesCompatible('borrow', 'lend'));
check('borrow + give works', m.modesCompatible('borrow', 'give'));
check('keep + give works', m.modesCompatible('keep', 'give'));
check('keep + lend does NOT — they want it back', !m.modesCompatible('keep', 'lend'));

const base = {
  kind: 'daha', mode: 'borrow', item: 'garment steamer',
  residenceId: 'wilbur', poster: 'You', from: '2026-09-24', until: '2026-09-25'
};
const offer = {
  kind: 'dawa', mode: 'lend', item: 'garment steamer',
  residenceId: 'stern', poster: 'Amara', from: '2026-09-20', until: '2026-10-05'
};

check('a good pair scores', m.scorePair(base, offer) !== null);
check('two dahas never match', m.scorePair(base, { ...offer, kind: 'daha' }) === null);
check('two dawas never match', m.scorePair({ ...base, kind: 'dawa' }, offer) === null);
check('nobody matches themselves',
  m.scorePair(base, { ...offer, poster: 'You' }) === null);
check('keep + lend is refused even when everything else is perfect',
  m.scorePair({ ...base, mode: 'keep' }, offer) === null);
check('a different item is refused however close they live',
  m.scorePair({ ...base, item: 'rice cooker' }, offer) === null);
check('windows that never touch are refused',
  m.scorePair({ ...base, from: '2026-11-01', until: '2026-11-02' }, offer) === null);

// ---------------------------------------------------------------------------
section('5. Scoring behaves sensibly');

const near = m.scorePair(base, offer);
const far = m.scorePair(base, { ...offer, residenceId: 'evgr' });
check('a closer offer scores higher than a far one — ' + near.score + ' vs ' + far.score,
  near.score > far.score);

const exact = m.scorePair(base, offer);
const fuzzy = m.scorePair({ ...base, item: 'steamer thing for clothes' },
                          { ...offer, item: 'clothes steamer thing' });
check('an exact dictionary hit scores at least as high as a fuzzy one',
  exact.score >= (fuzzy ? fuzzy.score : 0));

let outOfRange = null, badReason = null;
for (const p of BOARD) {
  for (const match of m.findMatches(p, BOARD, 10)) {
    if (match.score < 0 || match.score > 1) outOfRange = p.id + ' → ' + match.score;
    if (!match.reason || match.reason.length < 8) badReason = p.id;
    // The reason has to be true.
    if (match.exactItem && !/^Same thing/.test(match.reason)) badReason = p.id + ' reason';
    if (match.walkMinutes === 0 && !/same building/.test(match.reason)) badReason = p.id + ' walk';
  }
}
check('every score lands between 0 and 1', outOfRange === null, outOfRange);
check('every match explains itself, and the explanation is true', badReason === null, badReason);

eq('proximity is 1 in the same building', m.proximityScore(0), 1);
eq('proximity is 0 at the far end of campus', m.proximityScore(30), 0);
check('proximity decreases with distance', m.proximityScore(3) > m.proximityScore(12));

// ---------------------------------------------------------------------------
section('6. The board finds what a group chat would lose');

const byId = Object.fromEntries(BOARD.map((p) => [p.id, p]));
const pairs = [
  ['p10', 'p03', 'tripod'],
  ['p11', 'p02', 'mini fridge'],
  ['p12', 'p05', 'air mattress'],
  ['p13', 'p04', 'command strips']
];
for (const [daha, dawa, what] of pairs) {
  const matches = m.findMatches(byId[daha], BOARD, 5);
  check(`the ${what} request finds the ${what} offer`,
    matches.some((x) => x.post.id === dawa),
    matches.map((x) => x.post.id).join(',') || 'nothing');
  const reverse = m.findMatches(byId[dawa], BOARD, 5);
  check(`…and it works in reverse, offer to request`,
    reverse.some((x) => x.post.id === daha));
}

check('a request nobody can fill honestly finds nothing',
  m.findMatches(byId.p14, BOARD, 5).length === 0,
  'bike lock should have no match on this board');
check('the textbook offer finds nothing — nobody asked',
  m.findMatches(byId.p06, BOARD, 5).length === 0);

// The demo moment.
const live = m.parsePost('daha a steamer for formal thursday', TODAY);
const probe = { ...live, id: 'live', poster: 'You', residenceId: 'wilbur' };
const found = m.findMatches(probe, BOARD, 5);
check('the demo query finds Amara\'s steamer', found.length === 1 && found[0].post.id === 'p01',
  found.map((x) => x.post.poster).join(',') || 'nothing');
check('…and reports the walk honestly (Wilbur to Stern)',
  found[0].walkMinutes === catalog.walkMinutes('wilbur', 'stern'));

// ---------------------------------------------------------------------------
section('7. Where to meet');

const { describePickup } = require('./server.js');

check('same building needs no meeting point',
  m.bestPickup('wilbur', 'wilbur').sameBuilding === true);

let unfair = null, notPublic = null, asymmetric = null;
for (const a of catalog.RESIDENCES) {
  for (const b of catalog.RESIDENCES) {
    if (a.id === b.id) continue;
    const pick = m.bestPickup(a.id, b.id);

    // It has to be one of the designated public spots, never someone's room.
    if (!catalog.PICKUP_SPOTS.some((sp) => sp.id === pick.spot.id)) notPublic = a.id + '/' + b.id;

    // It has to be the fairest spot available: no other spot has a shorter
    // longer-walk. This is the property the whole function claims.
    for (const other of catalog.PICKUP_SPOTS) {
      const longest = Math.max(
        catalog.walkToPickup(a.id, other.id), catalog.walkToPickup(b.id, other.id));
      if (longest < pick.longest) unfair = `${a.id}/${b.id}: ${other.id} is fairer`;
    }

    // Swapping who is asking must not change where you meet.
    const flipped = m.bestPickup(b.id, a.id);
    if (flipped.spot.id !== pick.spot.id) asymmetric = a.id + '/' + b.id;
  }
}
check('a pickup is always one of the designated public spots', notPublic === null, notPublic);
check('no other spot is fairer — it really does minimise the longer walk',
  unfair === null, unfair);
check('the meeting point does not depend on who asked first', asymmetric === null, asymmetric);

const fair = m.bestPickup('wilbur', 'flomo');
check('a cross-campus pair meets in the middle rather than at one end — ' +
  fair.spot.name + ' (' + fair.walkA + '/' + fair.walkB + ')',
  Math.abs(fair.walkA - fair.walkB) <= 3);

const eastPair = m.bestPickup('wilbur', 'stern');
check('two east-campus dorms meet on east campus — ' + eastPair.spot.name,
  eastPair.longest <= 4);

const described = describePickup(m.bestPickup('wilbur', 'stern'), 'wilbur', 'stern');
check('the description names the spot and both walks',
  /Meet at/.test(described.label) && /min for you/.test(described.detail));
check('same-building reads as just knock',
  describePickup(m.bestPickup('toyon', 'toyon'), 'toyon', 'toyon').label === 'Same building — just knock');

check('every pickup spot sits somewhere on the map',
  catalog.PICKUP_SPOTS.every((sp) => Number.isFinite(sp.x) && Number.isFinite(sp.y)));
check('every pickup spot says when it is open',
  catalog.PICKUP_SPOTS.every((sp) => sp.open && sp.note));

check('every match on the board comes with somewhere to meet',
  BOARD.every((p) => m.findMatches(p, BOARD, 5).every((x) => x.pickup)));

// ---------------------------------------------------------------------------
section('8. Campus geography');

eq('nowhere to walk to yourself', catalog.walkMinutes('wilbur', 'wilbur'), 0);
eq('walking is symmetric',
  catalog.walkMinutes('wilbur', 'flomo'), catalog.walkMinutes('flomo', 'wilbur'));
check('neighbours beat the far side of campus',
  catalog.walkMinutes('wilbur', 'stern') < catalog.walkMinutes('wilbur', 'flomo'));
check('east to west campus is a real walk', catalog.walkMinutes('wilbur', 'flomo') >= 12);
eq('an unknown residence is null, not a number', catalog.walkMinutes('wilbur', 'narnia'), null);
check('every post sits somewhere real',
  BOARD.every((p) => catalog.RESIDENCES.some((r) => r.id === p.residenceId)));
check('every post has a mode its kind allows',
  BOARD.every((p) => p.kind === 'daha'
    ? ['borrow', 'keep'].includes(p.mode)
    : ['lend', 'give'].includes(p.mode)));
check('every post window runs forwards', BOARD.every((p) => p.until >= p.from));

// ---------------------------------------------------------------------------
section('9. Decoration and determinism');

const shown = BOARD.map((p) => decorate(p, 'wilbur'));
check('every card knows the walk', shown.every((p) => typeof p.walkMinutes === 'number'));
check('every card carries its own match count',
  shown.every((p) => typeof p.matchCount === 'number'));
check('a card claiming a match has one to show',
  shown.every((p) => p.matchCount === 0 || p.topMatch));

const once = JSON.stringify(BOARD.map((p) => m.findMatches(p, BOARD, 5).map((x) => x.post.id + ':' + x.score)));
const twice = JSON.stringify(BOARD.map((p) => m.findMatches(p, BOARD, 5).map((x) => x.post.id + ':' + x.score)));
eq('matching the whole board twice gives identical output', once, twice);

// ---------------------------------------------------------------------------
section('Matches sitting on the board right now');

let live_count = 0;
for (const p of BOARD) {
  const ms = m.findMatches(p, BOARD, 1);
  if (!ms.length || p.kind !== 'daha') continue;
  live_count++;
  console.log('  ' + p.poster + ' wants ' + p.item +
    '  →  ' + ms[0].post.poster + ' (' + ms[0].reason + ')');
}
console.log('  ' + live_count + ' requests already answerable by someone on this board.');

console.log('\n' + (failed === 0
  ? '\x1b[32m\x1b[1m' + passed + ' passed, 0 failed.\x1b[0m\n'
  : '\x1b[31m\x1b[1m' + passed + ' passed, ' + failed + ' failed.\x1b[0m\n  ' + failures.join('\n  ') + '\n'));

process.exit(failed === 0 ? 0 : 1);
