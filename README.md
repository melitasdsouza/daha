# Daha

**d**oes **a**nyone **h**ave **a** · **d**oes **a**nyone **w**ant **a**

Every Stanford dorm runs on two phrases. *daha* is someone asking to borrow or be given
something. *dawa* is someone offering one up. It's a real culture of lending and passing things
along, and it already works — except for one thing.

**The two halves never find each other.** Someone posts *daha a steamer* on Tuesday. Someone
posted *dawa my garment steamer* on Sunday. The Sunday message is four hundred messages up the
group chat and might as well not exist, so a steamer sits in a closet in Stern while someone in
Wilbur goes and buys one.

Daha is a board that remembers. You type the post exactly the way you'd type it in the group
chat, and it tells you who already has one and how far you'd have to walk.

> **It's the dorm group chat, except it actually remembers who has what.**

**Live demo:** https://melitasdsouza.github.io/daha

---

## Run it

```bash
npm install && npm start
```

Then open **http://localhost:3000**.

```bash
npm test
```

Node.js 20 or newer. Express is the only dependency. No build step, no bundler, no database, no
CDN links — it runs with the network unplugged.

Optionally, for messier input:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

More on what that changes below — the short version is **nothing breaks without it**.

---

## Try this

Type `daha a steamer for formal thursday` and press the button.

It reads that as:

| | |
|---|---|
| **Looking for** | garment steamer |
| **Arrangement** | to borrow |
| **When** | Thu, Sep 24 – Fri, Sep 25 |
| **Category** | clothing |

…and answers: **"1 person has one, the closest a 3-minute walk away."** That's Amara in Stern
Hall, who posted *"dawa my garment steamer — happy to lend it out, it lives in my closet"* two
days ago and has been waiting ever since.

Nobody typed the word "garment". Nobody typed a date.

---

## How the matching works

`matching.js` is the whole product, and it's a scoring function you can read in one sitting.

### First, four hard gates

A pair that fails any of these is not a match at any score:

1. **Opposite directions.** A daha matches a dawa. Two people asking for a steamer are not a match.
2. **Compatible arrangements.** This is the one a group chat gets wrong constantly:

   | You want | They're offering | |
   |---|---|---|
   | to borrow | to lend | ✅ |
   | to borrow | to give away | ✅ |
   | to keep | to give away | ✅ |
   | **to keep** | **to lend** | ❌ *they want it back* |

3. **Windows that touch.** You need it Thursday; they're away until Saturday. Not a match.
4. **Actually the same thing.** A bike is not a bike pump.

### Then, four weighted terms

```
score = 0.55 × item similarity
      + 0.25 × proximity
      + 0.12 × timing slack
      + 0.08 × same category
```

**Item similarity** is the interesting one. An item dictionary maps 73 surface forms onto 31
canonical things, longest alias first — so `steamer`, `clothes steamer` and `garment steamer`
are all the same item, and `bike pump` resolves to a pump rather than a bike. Anything outside
the dictionary falls back to Jaccard word overlap, so two people typing *didgeridoo* still find
each other.

Jaccard specifically, and not the more generous overlap-over-minimum, because the generous
version scores "bike" against "bike pump" as a perfect match. There's a test for that.

**Proximity** decays linearly to zero at a 20-minute walk. **Timing slack** rewards a window
with room to arrange in — three days is full marks.

### Every match explains itself

> *Same thing · 3 min walk · happy to lend · 2 days that work*

Generated deterministically from the four terms, and `npm test` asserts the explanation is
**true** — that a match claiming "same thing" really was an exact dictionary hit, and one
claiming "same building" really is a zero-minute walk.

---

## The live demo runs with no server at all

GitHub Pages serves files, not processes — there is no Node and no Express behind
https://melitasdsouza.github.io/daha. That works here only because of how the project is
already split: `matching.js` is pure (no I/O, no clock, the caller passes the date) and
`catalog.js` is data, so the engine moves into the browser untouched.

```bash
npm run build:pages
```

`build-pages.js` bundles those two files with the presentation helpers lifted out of `server.js`,
then swaps the client's single `json()` call for a router that dispatches to the same handlers
locally instead of over HTTP. Output lands in `docs/`, which is what Pages is pointed at. The
Express app in the repo root is untouched and stays the thing you run locally.

**What the static build loses:** the Claude parsing path, which needs a key and therefore a
server. The rule parser runs instead — and because that is a real parser rather than a stub, the
hosted demo is fully usable. The interface already labels which one read your post (`RULES` or
`CLAUDE` in the readout), so the page stays honest about it without a disclaimer.

The board is per-visitor and resets on reload, which is the right behaviour for a public demo
nobody is moderating.

---

## Where you actually meet

Finding the match is half of it. The other half is that **nobody wants to knock on a
stranger's door** — and nobody wants to hike across campus while the other person strolls
downstairs.

So every match comes with a designated pickup spot, chosen from eight real places students
already say "meet you at": White Plaza (the Claw), Tresidder, Green Library steps, Arrillaga
Dining, the Oval, Lake Lagunita, Meyer Green and EV Commons. Each one is public, lit, and
carries its opening hours.

### Which spot, and why that one

`bestPickup()` picks the spot that minimises the **longer of the two walks** — not the total.

That distinction is the whole design. Minimising the *total* walk would happily send one person
twenty minutes and the other zero, which is efficient on paper and socially useless. Minimising
the *longer* walk is the fair version, and it's what two people negotiate to in a group chat
anyway.

| Pair | Meets at | Walks |
|---|---|---|
| Wilbur + Stern | Arrillaga Dining | 2 min / 3 min |
| Roble + Stern | Green Library steps | 8 min / 5 min |
| Wilbur + FloMo | Meyer Green | 8 min / 9 min |
| Branner + Branner | — | *same building, just knock* |

Both east-campus dorms meet on east campus. A cross-campus pair meets in the middle. The tests
assert the fairness property directly: for every one of the 132 residence pairs, **no other spot
on the map has a shorter longer-walk**, and swapping who asked first never changes the answer.

### The map

The right-hand panel is a drawn map of campus — Main Quad, the Oval, Lake Lagunita, Palm Drive
and Campus Drive for orientation, twelve residences, eight pickup spots. Tap any dorm to move
in, and the whole board re-sorts around your new walk times.

When a match comes up, the map draws the actual handover: your dorm, a dashed leg to the pickup
spot, another leg to theirs.

Coordinates put the Main Quad at the origin with east as +x, so `catalog.js` reads as geography
rather than as screen positions; the only transform is negating y on the way into SVG. They're
approximate *relative* positions — good enough to rank a walk, not survey data.

---

## Where the AI sits

> **The model reads language. The engine decides who matches.**

`POST /api/parse` hands Claude one line of text and asks what it means: is this a request or an
offer, what's the thing, is it a borrow or a keep, and what dates. It is **never asked who
should be matched with whom**.

That matters because matching is the part that has to be right, and a scoring function can be
tested while a model's judgement can't.

**Without an API key the app is fully functional.** `matching.parsePost()` is not a stub — it's
a real rule-based parser that reads the daha/dawa prefix, resolves the item through the same
dictionary, works out borrow-versus-keep from the wording, and pulls dates out of phrases like
"thursday", "tonight" and "this weekend". Claude does the same job better on messier input
("that iron thing for wrinkly clothes"); it isn't doing something different. Whatever it returns
is validated against the same shape before it can reach the board, and any failure — no key,
bad key, timeout, malformed JSON — falls through to the rules silently.

---

## What's real and what's simulated

**Real:**

- The matching engine, its gates, its scoring, and every match on the board. 85 tests.
- The rule-based parser, including the date handling.
- The item dictionary.
- Walk-time ranking between residences, and the fair pickup-spot choice.
- The campus map — every dot is drawn from the same coordinates the walk times use.
- Posting: put something on the board and it matches immediately, both directions.

**Simulated:**

- **The board.** Fourteen invented posts from invented people. Four of them are already sitting
  on a match nobody has noticed, which is the point being made.
- **Campus coordinates.** Approximate *relative* positions on a simplified grid — enough to rank
  a walk correctly, not survey data. The pickup spots are real places; their positions are
  eyeballed.
- **"Today."** Pinned to `2026-09-20` (a Sunday) so that "thursday" resolves identically on every
  machine and every run.
- **Everything after the match.** No messaging, no handoff, no reputation. Daha finds the other
  half of the transaction and stops there.

---

## The 60-second demo

> **0:00** — "Every dorm at Stanford runs on two words. *Daha* — does anyone have a. *Dawa* —
> does anyone want a. It's a whole culture of lending and passing things down, and it lives
> entirely in group chats."

> **0:12** — "Which means it barely works. I post *daha a steamer* today. Somebody posted *dawa
> my steamer* on Sunday. That message is four hundred messages up. So there's a steamer in a
> closet in Stern, and I go buy one."

> **0:26** — *Type `daha a steamer for formal thursday`. Press the button.* "It read that. It
> knows 'steamer' means a garment steamer, that I want to borrow it and not keep it, and that
> 'formal thursday' is the 24th. And it says: one person has one, three minutes away."

> **0:40** — *Point at the match card, then the map.* "And it tells us where to meet. Not her
> room — Arrillaga Dining, two minutes for me, three for her. It picks the spot with the
> shortest *longer* walk, so neither of us gets stuck hiking across campus."

> **0:54** — *Point at the board.* "Fourteen posts up right now. **Eight already have a match
> waiting that nobody has noticed.** That's the entire problem, sitting right there."

> **1:04** — *Click "daha a bike lock".* "And when nobody has one, it says so, and waits. The
> moment somebody posts a dawa that fits, they see you."

*For a sceptic:* the matching runs with no API key at all. Claude reads messy language; the
matching is a scoring function with four terms and eighty-five tests.

---

## Design decisions, recorded

1. **The matching engine has no model in it.** Language is a model problem; matching is not.
   Keeping the line clean is what makes the matches testable and the demo identical every run.

2. **The no-key path is a real parser, not a stub.** A hackathon demo that dies when conference
   WiFi drops is not a demo. Claude is an upgrade on the same job, not a load-bearing dependency.

3. **`keep + lend` is a hard rejection.** Not a low score — a refusal. It's the failure mode a
   group chat produces constantly ("oh, I actually need that back") and getting it right costs
   four lines.

4. **Jaccard, not overlap-over-minimum.** The generous metric calls a bike a bike pump.

5. **Colour carries information.** Amber is a request, green is an offer, and buttons are
   near-black so those two stay legible as data rather than decoration.

6. **The board sorts by "has a waiting match" first.** The reason to open Daha is to discover
   something you'd otherwise miss, so that goes at the top.

7. **Empty states tell the truth.** When nothing matches, it says nothing matches, and explains
   what happens next. No fake nearby results to pad the screen.

8. **Pinned date.** Determinism beats a live clock for a demo whose parser resolves "thursday".

9. **In-memory board.** Every run starts clean.

10. **Fairness over efficiency in the pickup choice.** Minimising the longer walk instead of the
    total is a deliberately "worse" optimisation that produces a better product.

11. **The page is built like a printed flyer, not a dashboard.** The thing Daha replaces is a
    corkboard in a dorm lounge, so the design borrows from riso-printed campus posters: hard 2px
    black rules instead of soft grey borders, solid offset shadows with no blur (the look of
    slightly-off print registration), uppercase mono labels, a yellow highlighter on the number
    that matters, and near-square corners. Buttons are near-black on purpose so the two inks
    stay readable as *data* — orange is somebody asking, blue is somebody offering — rather than
    as decoration.

12. **Map labels use real nicknames.** FloMo, GovCo, the Claw, Tres, Lake Lag. If the map called
    it "Florence Moore Hall" no student would read it as fast, and the label would not fit.

13. **Every map label carries a paper-coloured halo** (`paint-order: stroke`). Six residences sit
    inside four hundred metres on east campus; without the halo the densest and most-used part
    of the map is the least readable part. Labels also alternate above and below their dot.

---

## Files

| File | |
|---|---|
| `matching.js` | The item dictionary lookup, the parser, the gates, the scoring, the fair pickup choice. Pure — no I/O, no clock. |
| `catalog.js` | Campus geography, pickup spots, landmarks, the item aliases, the seed board, the pinned date. |
| `server.js` | Express, four endpoints, and the Claude parsing path. |
| `test.js` | 85 assertions, no framework. |
| `public/` | One page, vanilla JS, the drawn campus map, no build step. |
| `build-pages.js` | Bundles the engine into `docs/` for GitHub Pages. |
| `docs/` | The generated static build. Do not edit by hand. |

### API

| | |
|---|---|
| `GET /api/board?from=&kind=` | The board, with walk times and match counts. |
| `POST /api/parse` | A line of text in; what it means plus who already has one. Posts nothing. |
| `POST /api/posts` | Put it on the board. Returns the post and its matches. |
| `GET /api/posts/:id/matches` | Matches for one post. |
