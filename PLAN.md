# Plan: Brand Map (live graph of brand tracking, with AI built in)

Started 2026-10-02. Status: **proposal, nothing built yet.** This file is the
working plan for this session; NOTES.md stays the running session log.

## The idea, in the founder's words (paraphrased)

A live map of Koli's brand-tracking data: our own take on Cosmograph, with AI
built in the way InfraNodus does it, feeling like the Wormhole game in the
Comet browser but in Koli's colors. Candidates named: OpenJev, Needle, and
something like MiroFish. Because Koli is browser-native: PGlite, and OrbitDB
on IPFS for scale.

## What each named piece actually is, and whether we can use it

Checked 2026-10-02 (web search; the GitHub pages themselves timed out, so
re-confirm each license file before adding a dependency).

| Piece | What it is | License | Verdict |
|---|---|---|---|
| **cosmos.gl** (engine behind Cosmograph, now an OpenJS Foundation incubating project, repo `cosmosgl/graph`) | GPU/WebGL force-directed layout and rendering, 1M+ nodes in the browser | MIT | **Use it.** This is the renderer. Use the engine directly, not the `@cosmograph/cosmograph` product package, whose terms differ and need checking separately. |
| **InfraNodus** (`noduslabs/infranodus`) | Text to network graph; centrality, topic clusters, "structural gaps", AI prompts that ask what bridges the gaps | AGPL-3.0; the open repo is the old 2020 version, Node + Neo4j | **Don't take code.** AGPL conflicts with the "fork it, add proprietary features, sell it" plan (same reason ROADMAP.md rejected Teable and Plunk). Reimplement the *method*, which is published (Paranyushkin, WWW'19), using MIT graph libraries. |
| **MiroFish** (`666ghj/MiroFish`) | Multi-agent "swarm intelligence" prediction engine; builds a simulated social world from seed material and lets agents react. Simulation layer is CAMEL-AI's OASIS. | AGPL-3.0; Python backend, a lot of LLM calls per run | **Don't take code; take the idea, small.** A full MiroFish run is a server plus hundreds or thousands of LLM calls, which breaks Koli's zero-cost rule. A capped, browser-side "audience panel" simulation gets the useful part (see Phase 4). OASIS's own license is unchecked; check before borrowing from it. |
| **Needle 2** (Cactus Compute) | 45M-parameter, 14MB tool-calling / structured-extraction model for edge devices | MIT | **Maybe, later.** Interesting as a free, on-device intent parser ("show me brands near beauty that we haven't pitched"). Still to check: whether it has a browser (WASM/WebGPU) runtime today. If it doesn't, it's not usable here. |
| **OpenJev** | Not one project: several unrelated repos share the name, all imitating a proprietary "Jev" typed-decision API (yes/no, choice, score with calibrated probabilities). Main ones need a GPU (vLLM on a 26B model). | Varies by repo | **Skip for now.** A GPU server breaks the zero-cost rule, and Gemini's structured output already covers typed scoring (Brand Fit Score uses it). **Need from founder:** which OpenJev repo you meant. |
| **PGlite** (ElectricSQL) | Postgres compiled to WASM, runs in the browser, IndexedDB/OPFS persistence, pgvector extension available | Apache-2.0 / PostgreSQL | **Use it, scoped.** As a local query + vector cache under the map, not as the source of truth (the Sheet stays the source of truth; that's Koli's core positioning). |
| **OrbitDB on IPFS** (Helia/libp2p) | Peer-to-peer, eventually-consistent database | MIT | **Defer.** See "On OrbitDB/IPFS and scale" below. |
| **Comet's Wormhole game** | Comet's built-in replacement for Chrome's dino game | n/a | Design reference only. **Need from founder:** a screenshot or a sentence on what "feel" means (the fly-through motion? dark space? the score/game loop?). I can't see it from here. |

## On OrbitDB/IPFS and scale (honest take)

- **Scale isn't the problem today.** One operator and one agency's data:
  thousands of rows, not millions. cosmos.gl plus PGlite in one browser tab
  handles far more than that with no network at all.
- **IPFS content is public by default.** Contacts, deal terms and outreach
  history would have to be encrypted before they ever reach the network.
  That needs key management, which Koli doesn't have.
- **P2P sync only matters once there are several users.** PRODUCT.md is
  explicit that there is exactly one user and no permissions model yet.
- **Revisit when** a second real user (agency teammate or client brand)
  needs the same live map. Even then, compare OrbitDB with simpler options:
  PGlite with ElectricSQL sync, or Grist, which ROADMAP.md already picked
  for the platform rebuild.

## Where it lives

Koli surfaces are Apps Script HtmlService dialogs and sidebar, the Send to
Koli extension side panel, and the `doGet` web app.

**Recommendation:** start as a full-size dialog (`BrandMapDialog.html`,
opened from `Brand Intelligence > Brand Map`). Load cosmos.gl and PGlite
from jsDelivr, and get data through `google.script.run`, the same pattern
the Kanban boards use. Unknown until tested: whether IndexedDB/OPFS
persistence works inside the sandboxed `googleusercontent` iframe. If it
doesn't, PGlite runs in-memory per open (fine at our size), or the map
moves to the extension side panel, which has its own origin and storage.

## Graph model (all from data Koli already has)

- **Nodes:** creators/channels, brands (Sponsors, Brand Targets, Brand
  Discovery results), campaigns, topics/niches.
- **Edges:**
  - creator → brand: *sponsored* (Sponsors tab, weight = segment count/recency)
  - creator → brand: *pitched* / *in pipeline* (outreach status)
  - creator → brand: *fit* (Brand Fit Score)
  - brand → brand: *shared creators* (co-sponsorship)
  - topic ↔ topic: co-occurrence, InfraNodus-style, from titles, captions and notes
- **Live:** Apps Script can't push to a dialog, so the dialog polls a cheap
  "graph version" stamp (bumped by `sheetWriter.gs` writes) every ~20s and
  re-fetches only when it changes.

## Phases

### Phase 1: the map (no AI)
- `brandGraphService.gs`: build `{nodes, links}` from the sheets above,
  cached with `cache.gs`.
- `BrandMapDialog.html`: cosmos.gl render. Kinpaku gold = brands, patina
  teal = creators, ink = topics, vermilion = at-risk (brand-safety flags).
  Dark "paper" background, so it uses the existing dark-mode tokens.
  Hover card, click opens the existing `RecordModal`, search/filter by
  niche and pipeline stage.
- "Wormhole" motion: camera flies to a node on select, and nodes ease in
  as they're added. Exact feel to be set after the founder's answer above.
- **Done when:** the founder opens it on the real Sheet and it renders the
  real data in under 2s.

### Phase 2: InfraNodus-style insight (own implementation)
- `graphology` (MIT) in the browser for betweenness centrality and Louvain
  communities.
- Find **structural gaps**: pairs of clusters with few links between them.
- One Gemini call per gap: "What brand or creator angle bridges cluster A
  and cluster B?" Output: concrete *untapped brand* and *untried pairing*
  suggestions, each with a button that adds to Brand Targets (reuse
  `brandService.gs`).
- This is the vetting-speed payoff: it says where to look next.

### Phase 3: PGlite under the map
- Load the graph into PGlite tables. Store Gemini embeddings (free tier) of
  brand and creator descriptions in pgvector.
- Enables "brands like this one" nearest-neighbor search and an
  embedding-based layout mode (Cosmograph's other strength).
- Only worth doing if Phase 2 shows the plain in-memory graph isn't enough.

### Phase 4: "Audience panel" simulation (MiroFish idea, budget-capped)
- For a proposed creator × brand pairing: generate N (default 8) audience
  personas from the creator's real comment and caption data, then have each
  react to a mock sponsor read in one batched Gemini call. Output: predicted
  sentiment split, likely objections, a fit risk note.
- Hard cap per run, shown in the UI before it runs. No server.
- Labeled as a simulation, never as a prediction of fact.

### Phase 5 (conditional): on-device AI and sync
- Needle 2 for a free natural-language filter bar, if a browser runtime
  exists. Note that ROADMAP.md removed the earlier NL "Assistant tab"
  because it added latency without capability, so this needs a real reason.
- OrbitDB or another sync layer only when a second user exists.

## Open questions for the founder
1. Which OpenJev repo did you mean, and what should it do here?
2. What about the Comet Wormhole game should the map feel like?
3. "Brand tracking": is the map agency-facing only for now, or should a
   read-only version go into Brand View / Publish-as-Page for brands?
4. OK to start with Phase 1 as a Sheets dialog?
