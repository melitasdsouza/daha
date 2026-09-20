'use strict';

/**
 * Daha — the matching engine.
 *
 * The whole product is one observation: a DAHA ("does anyone have a…") and a
 * DAWA ("does anyone want a…") are the two halves of the same transaction, and
 * in a group chat they never find each other. Someone asks for a steamer on
 * Tuesday; someone offered one on Sunday; the Sunday message is four hundred
 * messages up and might as well not exist.
 *
 * This file finds them. It is pure — no I/O, no clock, the caller passes the
 * date — which is what makes it testable and the demo identical every run.
 *
 * Nothing here needs a model. A model makes the PARSING better (see
 * parsePost below, and the Claude path in server.js), but the matching itself
 * is a scoring function with four terms you can read in one sitting.
 */

const {
  ITEM_ALIASES, ITEM_CATEGORY, PICKUP_SPOTS,
  walkMinutes, walkToPickup
} = require('./catalog.js');

const MS_PER_DAY = 86400000;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Words that carry no information about WHAT is being asked for. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'i', 'is', 'it', 'its', 'to', 'for', 'of', 'in', 'on',
  'at', 'by', 'or', 'and', 'if', 'so', 'be', 'am', 'any', 'some', 'anyone', 'does',
  'do', 'have', 'has', 'want', 'wants', 'need', 'needs', 'needed', 'looking', 'look',
  'daha', 'dawa', 'pls', 'please', 'thanks', 'thx', 'ty', 'hi', 'hey', 'hello',
  'got', 'get', 'can', 'could', 'would', 'will', 'just', 'really', 'very', 'like',
  'anybody', 'somebody', 'someone', 'one', 'out', 'up', 'with', 'from', 'that', 'this'
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude but predictable singularisation — no stemmer library, no surprises. */
function singular(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function contentTokens(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(singular)
    .filter((w) => w.length > 1);
}

/**
 * Resolve free text to a canonical item id, longest alias first so "bike pump"
 * beats "bike". Returns null when nothing in the dictionary fits, and the
 * caller falls back to word overlap.
 */
const ALIASES_BY_LENGTH = Object.keys(ITEM_ALIASES)
  .sort((a, b) => b.length - a.length);

function canonicalItem(text) {
  const haystack = ' ' + normalize(text) + ' ';
  for (const alias of ALIASES_BY_LENGTH) {
    if (haystack.includes(' ' + alias + ' ')) return ITEM_ALIASES[alias];
  }
  // Try again on singularised tokens, so "steamers" still resolves.
  const singularised = ' ' + contentTokens(text).join(' ') + ' ';
  for (const alias of ALIASES_BY_LENGTH) {
    if (singularised.includes(' ' + alias + ' ')) return ITEM_ALIASES[alias];
  }
  return null;
}

function categoryFor(text, canonical) {
  const id = canonical || canonicalItem(text);
  return (id && ITEM_CATEGORY[id]) || 'misc';
}

/**
 * How alike are two item descriptions, 0 to 1.
 *
 *   1.00  the dictionary resolves both to the same canonical item
 *   else  Jaccard overlap of their content words
 *
 * Jaccard rather than the more generous overlap/min, because min() would score
 * "bike" against "bike pump" as a perfect match, and a bike is not a pump.
 */
function itemSimilarity(textA, textB) {
  const a = canonicalItem(textA);
  const b = canonicalItem(textB);
  if (a && b) return a === b ? 1 : 0;

  const A = new Set(contentTokens(textA));
  const B = new Set(contentTokens(textB));
  if (!A.size || !B.size) return 0;

  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_PER_DAY);

const addDays = (iso, n) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + n * MS_PER_DAY).toISOString().slice(0, 10);

/** The days both posts can work with, or null if their windows never touch. */
function overlapWindow(a, b) {
  const from = a.from > b.from ? a.from : b.from;
  const until = a.until < b.until ? a.until : b.until;
  if (daysBetween(from, until) < 0) return null;
  return { from, until, days: daysBetween(from, until) + 1 };
}

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

/**
 * Can these two posts actually transact?
 *
 *   borrow + lend   yes — the ordinary case
 *   borrow + give   yes — they never want it back, you only need it briefly
 *   keep   + give   yes
 *   keep   + lend   NO  — you want to keep it, they want it back
 *
 * That last row is the only real constraint, and it is the one a group chat
 * gets wrong constantly.
 */
function modesCompatible(dahaMode, dawaMode) {
  if (dahaMode === 'borrow') return dawaMode === 'lend' || dawaMode === 'give';
  if (dahaMode === 'keep') return dawaMode === 'give';
  return false;
}

// ---------------------------------------------------------------------------
// Where to actually meet
// ---------------------------------------------------------------------------

/**
 * Pick the fairest public spot for two people to hand something over.
 *
 * Nobody should have to knock on a stranger's door, and nobody should have to
 * hike across campus while the other person strolls downstairs. So the spot
 * chosen is the one that minimises the LONGER of the two walks — not the total.
 *
 * Minimising the total would happily send one person twenty minutes and the
 * other zero, which is technically efficient and socially useless. Minimising
 * the longer walk is the fair version, and it is the one people actually
 * negotiate to in a group chat.
 *
 * Ties break on total walk, then on spot id, so the answer never wobbles
 * between runs.
 */
function bestPickup(residenceA, residenceB) {
  if (!residenceA || !residenceB) return null;

  // Same building: there is nothing to negotiate.
  if (residenceA === residenceB) {
    return { sameBuilding: true, spot: null, walkA: 0, walkB: 0, longest: 0, total: 0 };
  }

  let best = null;
  for (const spot of PICKUP_SPOTS) {
    const walkA = walkToPickup(residenceA, spot.id);
    const walkB = walkToPickup(residenceB, spot.id);
    if (walkA === null || walkB === null) continue;

    const longest = Math.max(walkA, walkB);
    const total = walkA + walkB;

    const better = !best
      || longest < best.longest
      || (longest === best.longest && total < best.total)
      || (longest === best.longest && total === best.total && spot.id < best.spot.id);

    if (better) best = { sameBuilding: false, spot, walkA, walkB, longest, total };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const WEIGHTS = { item: 0.55, proximity: 0.25, timing: 0.12, category: 0.08 };

/** Item similarity below this is not a match at all, however close they live. */
const ITEM_FLOOR = 0.34;
/** Total score below this is not worth showing. */
const SHOW_FLOOR = 0.35;
/** A walk this long scores zero on proximity. */
const FAR_MINUTES = 20;

function proximityScore(minutes) {
  if (minutes === null || minutes === undefined) return 0.5;
  return Math.max(0, Math.min(1, 1 - minutes / FAR_MINUTES));
}

/** Three or more days of overlap is all the slack anyone needs to arrange it. */
function timingScore(overlap) {
  if (!overlap) return 0;
  return Math.min(1, overlap.days / 3);
}

/**
 * Score one daha against one dawa. Returns null when they cannot transact at
 * all — wrong direction, incompatible modes, windows that never touch, or an
 * item that simply is not the same thing.
 */
function scorePair(daha, dawa) {
  if (daha.kind !== 'daha' || dawa.kind !== 'dawa') return null;
  if (daha.poster === dawa.poster) return null;          // don't match someone to themselves
  if (!modesCompatible(daha.mode, dawa.mode)) return null;

  const overlap = overlapWindow(daha, dawa);
  if (!overlap) return null;

  const item = itemSimilarity(daha.item, dawa.item);
  if (item < ITEM_FLOOR) return null;

  const minutes = walkMinutes(daha.residenceId, dawa.residenceId);
  const sameCategory = categoryFor(daha.item) === categoryFor(dawa.item);

  const score =
    WEIGHTS.item * item +
    WEIGHTS.proximity * proximityScore(minutes) +
    WEIGHTS.timing * timingScore(overlap) +
    WEIGHTS.category * (sameCategory ? 1 : 0);

  if (score < SHOW_FLOOR) return null;

  return {
    score: Math.round(score * 1000) / 1000,
    item,
    exactItem: item === 1,
    walkMinutes: minutes,
    overlap,
    sameCategory,
    pickup: bestPickup(daha.residenceId, dawa.residenceId),
    reason: describe(item, minutes, overlap, dawa.mode)
  };
}

/** A one-line, human reason the match is good. Deterministic — no model. */
function describe(item, minutes, overlap, dawaMode) {
  const bits = [];
  bits.push(item === 1 ? 'Same thing' : 'Close match');
  if (minutes === 0) bits.push('same building');
  else if (minutes !== null) bits.push(minutes + ' min walk');
  bits.push(dawaMode === 'give' ? 'giving it away' : 'happy to lend');
  if (overlap.days >= 7) bits.push('free all week');
  else if (overlap.days === 1) bits.push('one day that works');
  else bits.push(overlap.days + ' days that work');
  return bits.join(' · ');
}

/**
 * Every post on the board that could satisfy `post`, best first.
 * Works in both directions: a daha finds dawas, a dawa finds dahas.
 */
function findMatches(post, board, limit = 5) {
  const out = [];
  for (const other of board) {
    if (other.id === post.id) continue;
    const scored = post.kind === 'daha'
      ? scorePair(post, other)
      : scorePair(other, post);
    if (scored) out.push({ post: other, ...scored });
  }
  out.sort((a, b) =>
    b.score - a.score ||
    (a.walkMinutes ?? 999) - (b.walkMinutes ?? 999) ||
    (a.post.id < b.post.id ? -1 : 1));   // stable, so runs are identical
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Parsing what someone typed
// ---------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The next occurrence of a weekday, counting today as "today" not "next week". */
function nextWeekday(todayIso, weekday) {
  const todayDow = new Date(Date.parse(todayIso + 'T00:00:00Z')).getUTCDay();
  const target = WEEKDAYS.indexOf(weekday);
  if (target < 0) return null;
  return addDays(todayIso, (target - todayDow + 7) % 7);
}

/**
 * Pull a date window out of ordinary phrasing. Deterministic, and good enough
 * for the way people actually write on a dorm board.
 */
function parseWindow(text, todayIso) {
  const t = normalize(text);

  if (/\btonight\b|\btoday\b/.test(t)) return { from: todayIso, until: todayIso };
  if (/\btomorrow\b/.test(t)) return { from: addDays(todayIso, 1), until: addDays(todayIso, 1) };

  if (/\bthis weekend\b|\bweekend\b/.test(t)) {
    const sat = nextWeekday(todayIso, 'saturday');
    return { from: sat, until: addDays(sat, 1) };
  }
  if (/\bnext week\b/.test(t)) {
    return { from: addDays(todayIso, 7), until: addDays(todayIso, 13) };
  }

  for (const day of WEEKDAYS) {
    if (new RegExp('\\b' + day + '\\b').test(t)) {
      const d = nextWeekday(todayIso, day);
      return { from: d, until: addDays(d, 1) };
    }
  }

  const couple = /\b(a couple of days|few days|couple days)\b/.test(t);
  if (couple) return { from: todayIso, until: addDays(todayIso, 3) };

  // Nothing said: assume it is live for the next two weeks.
  return { from: todayIso, until: addDays(todayIso, 14) };
}

/**
 * Parse a raw post with no model in the loop.
 *
 * This is the path that runs with no API key, and it is a real parser rather
 * than a stub — it reads the daha/dawa prefix, resolves the item through the
 * dictionary, works out borrow-versus-keep from the wording, and pulls a date
 * window out of phrases like "thursday" or "this weekend". Claude does the
 * same job better on messier input; it is not doing something different.
 */
function parsePost(raw, todayIso) {
  const t = normalize(raw);

  let kind = null;
  if (/\bdaha\b/.test(t) || /does anyone have/.test(t) || /\blooking for\b/.test(t)) kind = 'daha';
  else if (/\bdawa\b/.test(t) || /does anyone want/.test(t) || /giving away/.test(t)) kind = 'dawa';

  const wantsToKeep = /\bkeep\b|\bforever\b|\bfor good\b|\bto own\b/.test(t);
  const isTemporary = /\bborrow\b|\blend\b|\breturn\b|\bovernight\b|\bfor the (day|night|weekend)\b|\bcouple of days\b/.test(t);
  const givingAway = /\bgiving away\b|\bfree\b|\btake it\b|\bmoving out\b|\bdon.?t need\b/.test(t);

  let mode;
  if (kind === 'dawa') mode = (givingAway || !isTemporary) && !/\blend\b|\bborrow\b/.test(t) ? 'give' : 'lend';
  else mode = wantsToKeep || (!isTemporary && givingAway) ? 'keep' : 'borrow';

  const canonical = canonicalItem(raw);
  const tokens = contentTokens(raw);

  return {
    kind: kind || 'daha',
    kindConfident: kind !== null,
    mode,
    item: canonical ? canonical.replace(/-/g, ' ') : tokens.slice(0, 4).join(' '),
    canonicalItem: canonical,
    category: categoryFor(raw, canonical),
    ...parseWindow(raw, todayIso),
    source: 'rules'
  };
}

module.exports = {
  STOPWORDS, WEIGHTS, ITEM_FLOOR, SHOW_FLOOR, FAR_MINUTES,
  normalize, singular, contentTokens, canonicalItem, categoryFor, itemSimilarity,
  daysBetween, addDays, overlapWindow, modesCompatible,
  proximityScore, timingScore, scorePair, describe, findMatches, bestPickup,
  nextWeekday, parseWindow, parsePost
};
