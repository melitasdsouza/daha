# Daha

**d**oes **a**nyone **h**ave **a** · **d**oes **a**nyone **w**ant **a**

*Built at HackMIT by a team of Stanford students.*

---

## First, a word of ours you probably don't use

We're Stanford students, and our campus has a piece of slang that runs the dorms. It's shouted
into group chats a hundred times a day and it comes in exactly two halves:

> **daha** — *"does anyone have a…"* — someone needs to borrow or be given something.
>
> **dawa** — *"does anyone want a…"* — someone has one going spare.

Nobody says the whole phrase. You just say *daha a steamer* or *dawa my mini fridge* and everyone
knows what you mean. It sounds like nothing, but it's the load-bearing structure of an entire
lending economy: a floor of sixty students quietly passing around one iron, one tripod, one
air mattress, one good rice cooker, instead of sixty people each buying their own.

If you're reading this at MIT, you have your own version — a mailing list, a Facebook group, a
channel somebody made in 2019. Every campus grows one. Ours just happens to have a name, which
is how we noticed the thing that's wrong with it.

## The thing that's wrong with it

**The two halves never find each other.**

Somebody posts *daha a steamer* on Tuesday. Somebody posted *dawa my garment steamer* on Sunday.
By Tuesday that Sunday message is four hundred messages up the chat and might as well not exist.

So a perfectly good steamer sits in a closet in one dorm while a student in another dorm walks
to Target and buys one. Both people did everything right. The medium just has no memory.

That's not a small leak. Every unmatched pair is one more thing bought that didn't need to be
bought, and one more thing that gets left on a curb in June.

## What we built

Daha is a board that remembers.

You type the post exactly the way you'd type it in the group chat — no forms, no dropdowns, no
categories to pick. It works out what you mean, then tells you **who already has one, how far
you'd have to walk, and a public spot to meet them halfway**.

> **It's the dorm group chat, except it actually remembers who has what.**

**Live demo:** https://melitasdsouza.github.io/daha
*(Fourteen posts are already up. Eight of them have a match waiting that nobody has noticed.)*

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
Hall — a dorm on the east side of campus — who posted *"dawa my garment steamer — happy to lend
it out, it lives in my closet"* two days ago and has been waiting ever since.

Then it tells you both to meet at **Arrillaga Dining**, two minutes from her and three from you.

Nobody typed the word "garment". Nobody typed a date. Nobody agreed on a meeting spot.

*(Stanford dorm names appear throughout — Wilbur, Stern, Toyon, FloMo. You don't need to know
them; the map draws all twelve and the walk times do the work.)*

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

So every match comes with a designated pickup spot, chosen from eight real places Stanford
students already say "meet you at":

| Spot | What it is |
|---|---|
| **White Plaza** (*the Claw*) | The central student plaza, named for the fountain in it |
| **Tresidder Union** | Student union — tables, coffee, indoors when it rains |
| **Green Library steps** | Main library, front steps, always occupied |
| **Arrillaga Dining** | The east-campus dining hall |
| **The Oval** | The lawn at the end of the main approach to campus |
| **Lake Lagunita** | West campus, next to the western dorms |
| **Meyer Green** | Open lawn between main campus and the south housing |
| **EV Commons** | Escondido Village, for the graduate residences |

Every one is public, lit, and carries its opening hours — the point being that you hand something
to a stranger somewhere you'd be happy to stand alone at 9pm.

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

## Does this work anywhere but Stanford?

The honest answer is that **the slang is ours and nothing else is.**

Strip out the word "daha" and what's left is a structure every residential campus has: people
who need a thing for a few days, people who have that thing going spare, no memory connecting
them, and a walk between them that decides whether the handover actually happens.

Here's what porting Daha to another campus actually costs:

| What changes | Where | Effort |
|---|---|---|
| Dorm names and positions | `RESIDENCES` in `catalog.js` | 12 lines |
| Pickup spots | `PICKUP_SPOTS` in `catalog.js` | 8 lines |
| The two words | The UI copy | a find-and-replace |
| **The matching engine** | — | **nothing** |
| **The fair-meeting-point maths** | — | **nothing** |
| **The item dictionary** | — | **nothing — a mini fridge is a mini fridge everywhere** |

The coordinate system is deliberately campus-agnostic: any origin, any units of metres, east as
+x. Walk times fall out of the geometry rather than a routing service, so a new campus needs
positions and nothing else.

So: the culture is specific, and that's exactly why it's worth building for — a general-purpose
"borrow things near you" app has no reason to exist, but *this* one is already how sixty people
on a floor behave. The software is the general part.

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

## The 90-second demo

Written for a room that has never heard the word.

> **0:00** — "We're from Stanford, and we're going to teach you a word first, because the whole
> thing falls apart otherwise. **Daha.** It means *does anyone have a*. And **dawa** — *does
> anyone want a*. Nobody says the full phrase. You just yell *daha a steamer* into the group
> chat and sixty people know exactly what you mean."

> **0:15** — "It's a real lending economy. One iron, one tripod, one air mattress circulating a
> whole floor instead of sixty people each buying their own. You've got your own version of
> this — a mailing list, a Facebook group. Every campus grows one."

> **0:28** — "And every one of them has the same bug. I post *daha a steamer* today. Somebody
> posted *dawa my garment steamer* on Sunday. That message is four hundred messages up. So
> there's a steamer sitting in a closet two dorms over, and I go to Target and buy one."

> **0:42** — *Type `daha a steamer for formal thursday`. Press the button.* "It read that. It
> knows 'steamer' means a garment steamer, that I want to borrow it rather than keep it, and
> that 'formal thursday' is the 24th. One person has one. Three minutes away."

> **0:58** — *Point at the match card, then the map.* "And it tells us where to meet — not her
> dorm room. Arrillaga Dining, two minutes for her, three for me. It picks the spot with the
> shortest **longer** walk, so neither of us hikes across campus while the other strolls
> downstairs."

> **1:14** — *Point at the board.* "Fourteen posts up right now. **Eight already have a match
> waiting that nobody has noticed.** That's the whole problem, sitting right there in the data."

> **1:26** — *Click "daha a bike lock".* "And when nobody has one, it says so and waits. The
> moment somebody posts a dawa that fits, they see you."

**If a judge asks whether this only works at Stanford:** the slang is ours, the software isn't.
Porting it is twelve lines of dorm coordinates and eight pickup spots. The matching engine, the
fair-meeting-point maths and the item dictionary don't change — a mini fridge is a mini fridge
everywhere.

**If a judge asks what the model is actually doing:** reading language, and nothing else. The
matching is a scoring function with four terms and eighty-five tests behind it, and it runs with
no API key at all — the hosted demo has no server.

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
