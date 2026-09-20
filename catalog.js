'use strict';

/**
 * Daha — campus data and the item dictionary.
 *
 * "Today" is pinned so that every countdown, weekday and screenshot is the
 * same on every machine. 2026-09-20 is a Sunday, which is why the seed board
 * talks about "Thursday" and "this weekend" the way it does.
 */
const TODAY = '2026-09-20';

const CAMPUS = { id: 'stanford', name: 'Stanford', nickname: 'The Farm' };

/**
 * Residences on a simplified campus grid, in metres relative to the Main Quad.
 * Approximate RELATIVE positions — good enough to rank a walk correctly, which
 * is the only thing asked of them.
 */
const RESIDENCES = [
  { id: 'wilbur',     name: 'Wilbur Hall',         area: 'East Campus',  x:  700, y: -100, short: 'Wilbur' },
  { id: 'stern',      name: 'Stern Hall',          area: 'East Campus',  x:  620, y: -200, short: 'Stern' },
  { id: 'crothers',   name: 'Crothers Hall',       area: 'East Campus',  x:  500, y:  -50, short: 'Crothers' },
  { id: 'branner',    name: 'Branner Hall',        area: 'East Campus',  x:  400, y:  -80, short: 'Branner' },
  { id: 'toyon',      name: 'Toyon Hall',          area: 'East Campus',  x:  350, y: -150, short: 'Toyon' },
  { id: 'govco',      name: "Governor's Corner",   area: 'East Campus',  x:  820, y:  120, short: 'GovCo' },
  { id: 'roble',      name: 'Roble Hall',          area: 'North Campus', x: -150, y:  250, short: 'Roble' },
  { id: 'manzanita',  name: 'Manzanita Park',      area: 'West Campus',  x: -350, y:  300, short: 'Manzanita' },
  { id: 'lagunita',   name: 'Lagunita Court',      area: 'West Campus',  x: -450, y:  100, short: 'Lagunita' },
  { id: 'flomo',      name: 'Florence Moore Hall', area: 'West Campus',  x: -520, y: -260, short: 'FloMo' },
  { id: 'mirrielees', name: 'Mirrielees',          area: 'South Campus', x:  100, y: -620, short: 'Mirrielees' },
  { id: 'evgr',       name: 'EVGR',                area: 'South Campus', x:  200, y: -900, short: 'EVGR' }
];

const CATEGORIES = [
  { id: 'clothing',    name: 'Clothing' },
  { id: 'kitchen',     name: 'Kitchen' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'furniture',   name: 'Furniture' },
  { id: 'tools',       name: 'Tools' },
  { id: 'bedding',     name: 'Bedding' },
  { id: 'transport',   name: 'Bikes & travel' },
  { id: 'study',       name: 'Study' },
  { id: 'misc',        name: 'Everything else' }
];

/**
 * The item dictionary — the thing that makes "steamer" find "garment steamer"
 * without a model in the loop.
 *
 * Every surface form a student might type maps to one canonical id. Matching
 * two posts on the same canonical id is an exact hit; anything not in here
 * still matches on word overlap, just less confidently.
 *
 * Longest alias wins, so "bike pump" resolves to bike-pump rather than bike.
 */
const ITEM_ALIASES = {
  'garment steamer': 'garment-steamer', 'clothes steamer': 'garment-steamer',
  'fabric steamer': 'garment-steamer', 'steamer': 'garment-steamer',

  'mini fridge': 'mini-fridge', 'minifridge': 'mini-fridge',
  'dorm fridge': 'mini-fridge', 'mini refrigerator': 'mini-fridge', 'fridge': 'mini-fridge',

  'camera tripod': 'tripod', 'phone tripod': 'tripod', 'tripod': 'tripod',

  'command strips': 'command-strips', 'command hooks': 'command-strips',
  'adhesive strips': 'command-strips', 'damage free hooks': 'command-strips',

  'air mattress': 'air-mattress', 'blow up mattress': 'air-mattress',
  'inflatable mattress': 'air-mattress', 'airbed': 'air-mattress', 'air bed': 'air-mattress',

  'rice cooker': 'rice-cooker', 'zojirushi': 'rice-cooker',
  'electric kettle': 'kettle', 'kettle': 'kettle',
  'microwave': 'microwave', 'blender': 'blender',

  'bike pump': 'bike-pump', 'tire pump': 'bike-pump', 'floor pump': 'bike-pump',
  'bike lock': 'bike-lock', 'u lock': 'bike-lock',
  'bike': 'bike', 'bicycle': 'bike',

  'suit jacket': 'suit-jacket', 'blazer': 'suit-jacket', 'sport coat': 'suit-jacket',
  'formal dress': 'formal-dress', 'cocktail dress': 'formal-dress', 'gown': 'formal-dress',
  'dress shoes': 'dress-shoes', 'heels': 'dress-shoes',
  'iron': 'iron', 'sewing kit': 'sewing-kit', 'needle and thread': 'sewing-kit',

  'hdmi cable': 'hdmi-cable', 'hdmi': 'hdmi-cable',
  'power strip': 'power-strip', 'extension cord': 'power-strip',
  'external monitor': 'monitor', 'monitor': 'monitor',
  'printer': 'printer', 'desk lamp': 'desk-lamp', 'lamp': 'desk-lamp',
  'box fan': 'fan', 'standing fan': 'fan', 'fan': 'fan',

  'screwdriver': 'tools', 'allen key': 'tools', 'hex key': 'tools',
  'tool kit': 'tools', 'toolkit': 'tools', 'drill': 'tools',

  'yoga mat': 'yoga-mat', 'suitcase': 'luggage', 'luggage': 'luggage', 'duffel': 'luggage',
  'umbrella': 'umbrella', 'vacuum': 'vacuum',
  'textbook': 'textbook', 'textbooks': 'textbook',
  'whiteboard': 'whiteboard', 'calculator': 'calculator'
};

/** Canonical item to category, so a matched pair agrees on what kind of thing it is. */
const ITEM_CATEGORY = {
  'garment-steamer': 'clothing', 'suit-jacket': 'clothing', 'formal-dress': 'clothing',
  'dress-shoes': 'clothing', 'iron': 'clothing', 'sewing-kit': 'clothing',
  'mini-fridge': 'kitchen', 'rice-cooker': 'kitchen', 'kettle': 'kitchen',
  'microwave': 'kitchen', 'blender': 'kitchen',
  'hdmi-cable': 'electronics', 'power-strip': 'electronics', 'monitor': 'electronics',
  'printer': 'electronics', 'tripod': 'electronics', 'fan': 'electronics',
  'desk-lamp': 'furniture', 'whiteboard': 'study', 'textbook': 'study',
  'calculator': 'study', 'tools': 'tools', 'vacuum': 'tools',
  'air-mattress': 'bedding', 'yoga-mat': 'misc', 'umbrella': 'misc',
  'bike': 'transport', 'bike-pump': 'transport', 'bike-lock': 'transport',
  'luggage': 'transport', 'command-strips': 'misc'
};

/**
 * The board, as it stands this Sunday morning.
 *
 * `kind`  — daha (does anyone have a) or dawa (does anyone want a)
 * `mode`  — borrow/keep for a daha; lend/give for a dawa
 * `from`/`until` — when it's needed, or when it's available
 */
const POSTS = [
  // ---- dawa: things people are offering ---------------------------------
  { id: 'p01', kind: 'dawa', mode: 'lend',
    raw: 'dawa my garment steamer — happy to lend it out, it lives in my closet',
    item: 'garment steamer', poster: 'Amara', residenceId: 'stern',
    postedOn: '2026-09-18', from: '2026-09-20', until: '2026-10-05' },

  { id: 'p02', kind: 'dawa', mode: 'give',
    raw: 'dawa a mini fridge, 3.2 cu ft, works fine — moving off campus',
    item: 'mini fridge', poster: 'Priya', residenceId: 'wilbur',
    postedOn: '2026-09-17', from: '2026-09-20', until: '2026-10-04' },

  { id: 'p03', kind: 'dawa', mode: 'lend',
    raw: 'dawa a camera tripod if anyone needs one for a shoot',
    item: 'camera tripod', poster: 'Wen', residenceId: 'crothers',
    postedOn: '2026-09-19', from: '2026-09-20', until: '2026-09-30' },

  { id: 'p04', kind: 'dawa', mode: 'give',
    raw: 'dawa like 40 command strips, bought a costco pack and massively overestimated',
    item: 'command strips', poster: 'Ibrahim', residenceId: 'branner',
    postedOn: '2026-09-19', from: '2026-09-20', until: '2026-10-10' },

  { id: 'p05', kind: 'dawa', mode: 'lend',
    raw: 'dawa an air mattress, clean, pump included',
    item: 'air mattress', poster: 'Thea', residenceId: 'roble',
    postedOn: '2026-09-16', from: '2026-09-20', until: '2026-10-12' },

  { id: 'p06', kind: 'dawa', mode: 'give',
    raw: 'dawa my CS106B textbook, finished the sequence',
    item: 'textbook', poster: 'Ana', residenceId: 'toyon',
    postedOn: '2026-09-18', from: '2026-09-20', until: '2026-10-11' },

  { id: 'p07', kind: 'dawa', mode: 'lend',
    raw: 'dawa a blazer, mens M, if someone needs one for formal',
    item: 'blazer', poster: 'Marcus', residenceId: 'lagunita',
    postedOn: '2026-09-19', from: '2026-09-21', until: '2026-09-27' },

  { id: 'p08', kind: 'dawa', mode: 'give',
    raw: 'dawa a rice cooker, got a second one as a gift',
    item: 'rice cooker', poster: 'Jae', residenceId: 'crothers',
    postedOn: '2026-09-17', from: '2026-09-20', until: '2026-10-06' },

  { id: 'p09', kind: 'dawa', mode: 'lend',
    raw: 'dawa a floor pump, in my room, just knock',
    item: 'floor pump', poster: 'Dani', residenceId: 'flomo',
    postedOn: '2026-09-15', from: '2026-09-20', until: '2026-11-01' },

  // ---- daha: things people are looking for ------------------------------
  { id: 'p10', kind: 'daha', mode: 'borrow',
    raw: 'daha a tripod for a project shoot tuesday',
    item: 'tripod', poster: 'Lucia', residenceId: 'toyon',
    postedOn: '2026-09-19', from: '2026-09-22', until: '2026-09-23' },

  { id: 'p11', kind: 'daha', mode: 'keep',
    raw: 'daha a mini fridge, my room came without one',
    item: 'mini fridge', poster: 'Sam', residenceId: 'branner',
    postedOn: '2026-09-18', from: '2026-09-20', until: '2026-10-15' },

  { id: 'p12', kind: 'daha', mode: 'borrow',
    raw: 'daha an air mattress, friend visiting this weekend',
    item: 'air mattress', poster: 'Nikhil', residenceId: 'stern',
    postedOn: '2026-09-19', from: '2026-09-25', until: '2026-09-27' },

  { id: 'p13', kind: 'daha', mode: 'keep',
    raw: 'daha command strips, like 4, poster situation is dire',
    item: 'command strips', poster: 'Oren', residenceId: 'crothers',
    postedOn: '2026-09-20', from: '2026-09-20', until: '2026-09-30' },

  { id: 'p14', kind: 'daha', mode: 'borrow',
    raw: 'daha a bike lock for a couple of days while mine is being replaced',
    item: 'bike lock', poster: 'Jules', residenceId: 'roble',
    postedOn: '2026-09-20', from: '2026-09-21', until: '2026-09-24' }
];

/**
 * Landmarks, for orienting the map. Drawn, never matched against.
 * Same coordinate frame as the residences: Main Quad at the origin, east +x.
 */
const LANDMARKS = [
  { id: 'quad',      name: 'Main Quad',     kind: 'quad',  x:    0, y:    0, w: 320, h: 150 },
  { id: 'oval',      name: 'The Oval',      kind: 'oval',  x:  -40, y:  400, w: 300, h: 150 },
  { id: 'lake',      name: 'Lake Lagunita', kind: 'lake',  x: -640, y: -120, w: 300, h: 200 },
  { id: 'palm',      name: 'Palm Drive',    kind: 'road',  x:  -40, y:  400, x2: -420, y2: 900 },
  { id: 'campusdr',  name: 'Campus Drive',  kind: 'ring',  x:    0, y: -120, rx: 900, ry: 780 }
];

/**
 * Designated pickup spots.
 *
 * The whole point: you should never have to knock on a stranger's door. These
 * are public, lit, central, and every student already knows where they are —
 * the places people genuinely say "meet you at" on this campus.
 *
 * A match picks the spot that minimises the LONGER of the two walks, so
 * neither person gets stuck hiking across campus while the other strolls
 * downstairs. See bestPickup() in matching.js.
 */
const PICKUP_SPOTS = [
  { id: 'white_plaza', name: 'White Plaza',        short: 'the Claw',
    note: 'Dead centre of campus. Everyone knows the Claw.',
    x:   60, y: 180, open: 'always' },
  { id: 'tresidder',   name: 'Tresidder Union',    short: 'Tres',
    note: 'Tables, coffee, indoors when it rains.',
    x:  -90, y: 110, open: '7am–midnight' },
  { id: 'green_lib',   name: 'Green Library steps', short: 'Green',
    note: 'Front steps. Always somebody around.',
    x:  200, y: 230, open: '8am–midnight' },
  { id: 'arrillaga',   name: 'Arrillaga Dining',   short: 'Arrillaga',
    note: 'East campus, right between Wilbur and Stern.',
    x:  600, y: -30, open: 'meal hours' },
  { id: 'the_oval',    name: 'The Oval',           short: 'the Oval',
    note: 'The big lawn at the end of Palm Drive.',
    x:  -40, y: 400, open: 'always' },
  { id: 'lake_lag',    name: 'Lake Lagunita',      short: 'Lake Lag',
    note: 'West campus, by FloMo and Lagunita.',
    x: -520, y: -90, open: 'daylight' },
  { id: 'meyer_green', name: 'Meyer Green',        short: 'Meyer',
    note: 'Between main campus and Escondido.',
    x:  140, y: -360, open: 'always' },
  { id: 'ev_commons',  name: 'EV Commons',         short: 'EV Commons',
    note: 'Escondido Village, for anyone down south.',
    x:  180, y: -800, open: '7am–11pm' }
];

const WALK_METRES_PER_MINUTE = 84;
const WALK_OVERHEAD_MINUTES = 1;

/** Walk time between any two points on the grid, in whole minutes. */
function walkBetween(a, b) {
  if (!a || !b) return null;
  const metres = Math.hypot(a.x - b.x, a.y - b.y);
  if (metres < 1) return 0;
  return Math.max(1, Math.round(metres / WALK_METRES_PER_MINUTE + WALK_OVERHEAD_MINUTES));
}

const residenceById = (id) => RESIDENCES.find((r) => r.id === id) || null;
const pickupById = (id) => PICKUP_SPOTS.find((s) => s.id === id) || null;

/** Walk time between two residences, in whole minutes. */
function walkMinutes(fromId, toId) {
  if (fromId === toId) return 0;
  const a = residenceById(fromId);
  const b = residenceById(toId);
  if (!a || !b) return null;
  return walkBetween(a, b);
}

/** Walk time from a residence to a pickup spot. */
function walkToPickup(residenceId, spotId) {
  return walkBetween(residenceById(residenceId), pickupById(spotId));
}

function cloneCatalog() {
  return {
    today: TODAY,
    campus: JSON.parse(JSON.stringify(CAMPUS)),
    residences: JSON.parse(JSON.stringify(RESIDENCES)),
    categories: JSON.parse(JSON.stringify(CATEGORIES)),
    landmarks: JSON.parse(JSON.stringify(LANDMARKS)),
    pickupSpots: JSON.parse(JSON.stringify(PICKUP_SPOTS)),
    posts: JSON.parse(JSON.stringify(POSTS))
  };
}

module.exports = {
  TODAY, CAMPUS, RESIDENCES, CATEGORIES, POSTS,
  LANDMARKS, PICKUP_SPOTS,
  ITEM_ALIASES, ITEM_CATEGORY,
  WALK_METRES_PER_MINUTE, WALK_OVERHEAD_MINUTES,
  walkBetween, walkMinutes, walkToPickup,
  residenceById, pickupById, cloneCatalog
};
