# Plan: Brand Graph (brand tracking, with AI built in)

Started 2026-10-02. Status: **proposal, nothing built yet.** This file is the
working plan; NOTES.md stays the running session log.

## The idea

A live map of Koli's brand-tracking data: our own take on Cosmograph, with
InfraNodus-style AI insight built in, looking and feeling like Comet's
Wormhole game but in Koli's colors. Later it becomes the base for
brand-facing analysis, with prediction from our own MiroFish-style engine.

## Founder decisions (2026-10-02)

1. **OpenJev** means [`razorback16/openjev`](https://github.com/razorback16/openjev).
2. **Comet's Wormhole game** is the reference for look and feel (UX/UI), in
   Koli's own colors.
3. **Audience:** agency-only for now. Later, brands use it for competitor
   analysis, influencer-relationship analysis, and predictive analysis from
   our own version of the MiroFish engine. That engine runs on OASIS as a
   **separate service, not in the browser**, and is a distant-future plan.
4. **Starting point:** the founder asked for a recommendation; see "Build
   order" below.

Also agreed: AGPL projects (InfraNodus, MiroFish) are idea sources only. We
can borrow concepts and published methods, but not their code, prompt text
or assets. Write our own implementation from the idea and the published
paper, without working from their source.

## Why build it (value check)

The value is the **analysis**; the map is how it's presented. Measured
against PRODUCT.md's main goal (faster, cheaper vetting) plus outreach:

- **Brands to pitch a creator to:** brands that sponsor similar creators but
  not this one yet.
- **Co-sponsorship:** brands that sponsor the same creators, which gives a
  warmer lead list than cold discovery.
- **Gaps:** niches with creators but no brands, or brands but no creators.
  A sharper version of Gap Analysis and Brand Discovery.
- **Vetting signal:** whether a creator's past sponsors cluster with good
  brands or with risky ones.
- **Later, for brands:** competitor maps (who sponsors whom in my
  category), relationship history with influencers, and predicted reactions.

So the graph *data layer* is the real product. The map makes it explorable
and is a showpiece, but it isn't required for the first payoff.

## Pieces and verdicts

Licenses checked 2026-10-02 by web search. Re-confirm each license file
before adding a dependency.

| Piece | Role | License | Verdict |
|---|---|---|---|
| **cosmos.gl** (`cosmosgl/graph`, OpenJS Foundation incubating) | GPU/WebGL force layout + rendering, 1M+ nodes | MIT | **Renderer.** Use the engine directly. The `@cosmograph/cosmograph` product package has its own terms (unchecked). |
| **graphology** | Centrality, Louvain communities, in the browser | MIT | **Analysis library** for the InfraNodus-style layer. |
| **InfraNodus** | Clusters, structural gaps, AI questions that bridge the gaps | AGPL-3.0 | **Ideas only.** The method is published (Paranyushkin, WWW'19). |
| **OpenJev** (`razorback16/openjev`) | "System One" typed-decision server: yes/no (Noul), Choice and Score answers, with probability and confidence in about 30ms | Apache-2.0 (code and DiffusionGemma weights) | **Use it as a fast classifier**, called server-side from Apps Script (`UrlFetchApp`). Self-hosting needs a 24GB GPU or about 16GB on Apple silicon, so use the **free hosted endpoint on Codiv**. Gemini stays the fallback. See "OpenJev's job" below. |
| **Needle 2** (Cactus Compute) | 14MB on-device tool-calling model | MIT | **Maybe, later**, if a browser runtime exists. ROADMAP.md removed an earlier natural-language box for adding latency without capability, so this needs a real reason. |
| **PGlite** | Postgres + pgvector in the browser | Apache-2.0 / PostgreSQL | **Later**, as a local query/vector cache. The Sheet stays the source of truth. |
| **MiroFish / OASIS** | Multi-agent social simulation for prediction | MiroFish AGPL-3.0; OASIS license unchecked | **Distant future, separate service** (founder decision). Ideas only from MiroFish. Check OASIS's license before using any of it. |
| **OrbitDB on IPFS** | P2P database | MIT | **Deferred.** Data volume is small, IPFS is public unless encrypted (Koli has no key management), and P2P sync only matters with several users. Revisit when brands or teammates share live data. Compare against PGlite + ElectricSQL sync and Grist (ROADMAP.md's rebuild pick). |

### OpenJev's job

The graph needs many small, typed judgments, one per creator-brand edge.
Gemini's free tier is slow and rate-limited for that; OpenJev is built for it.

- **Choice, relationship type:** paid sponsorship / affiliate / gifted /
  organic mention / competitor mention.
- **Noul, flags:** "Is this sponsor in a brand-safety risk category?",
  "Is this brand a competitor of brand X?" (needed later for competitor
  analysis).
- **Score, edge strength:** how central the brand is to the creator's
  content.

Wrap it behind one `classify_()` helper with a Gemini fallback, so Koli
keeps working if the free hosted endpoint changes or goes away.

**To check before relying on it:**
- Codiv's terms and data policy, since creator and brand text would be sent there.
- Rate limits on the free tier.
- Whether accuracy on our labels is good enough. Test on about 50 real
  Sponsors rows against what Gemini says.

## Look and feel: Wormhole, in Koli's colors

From descriptions of the game (I couldn't load the developer's blog from
this environment; the founder should sanity-check against the real thing):
procedurally generated galaxies, planets that pull and push with gravity,
a comet you steer, slingshot trails, and fast zooms through space.

Translated to the map:

- **Space:** the dark "paper" theme (`--bg: oklch(17% 0 0)`) as deep space,
  with a faint parallax star field.
- **Galaxies = clusters** (niches/communities from Louvain). Zooming out
  shows galaxies; zooming in flies into one.
- **Planets = brands**, sized by how many creators they sponsor, in
  kinpaku gold (`oklch(78% .13 82)` / `oklch(87% .2 85)`).
- **Moons/ships = creators** orbiting the brands they work with, in patina
  teal (`oklch(78% .1 188)` / `oklch(82% .07 188)`).
- **Risk = vermilion** (`oklch(68% .16 35)`).
- **The comet is you**: selecting a node flies the camera there with a
  glowing trail. Relationship edges light up like gravity lines.
- **Wormholes = structural gaps**: a gap between two galaxies is drawn as a
  wormhole. Clicking it shows the AI's "what bridges these" suggestion.
- Albert Sans for all UI text; minimal HUD; motion respects
  `prefers-reduced-motion`.

Run the impeccable design pass on it, and render it in a real browser
before calling it done.

## Where it lives

- **Phase 1** (the insight) is in the Sheet itself: new columns/sheets plus
  a sidebar card. No new surface.
- **A "Brand Graph" tab in the Koli Sheet** (founder's ask, 2026-10-02:
  "visualize the graph in a tab"). A Sheets tab can only hold cells,
  built-in charts, images and drawings, not a live WebGL page, so the tab
  holds:
  - a **snapshot image** of the map at the top. The map renders it to PNG
    on open/refresh, and Apps Script inserts it with
    `sheet.insertImage(blob)`.
  - an **"Open live map" button** (a drawing assigned to a script) that
    launches the interactive map.
  - the **nodes and edges as plain tables** below. These are the data layer
    Phase 1 builds anyway, so the grid stays a real fallback UI.
- **The map** is one HTML file. It's launched from the Koli Sheet as a large
  dialog (`Brand Intelligence > Brand Map`) and served unchanged by the web
  app (`doGet`, `?map=1`) for a full-screen tab. The web app version is
  also the future path for brand access.
- **Live updates:** Koli Sheet panels can't receive pushes from Apps Script,
  so the map polls a cheap "graph version" stamp every few seconds, the
  same pattern `Sidebar.html` already uses (1.5s and 4s intervals). Koli's
  own writes bump the stamp. A new `onEdit` trigger (none exists today)
  bumps it for hand edits in the grid.

## Build order (recommendation)

### Phase 1: graph data layer + insight in the Sheet (first payoff, no map)
- `brandGraphService.gs`: build nodes and edges from Sponsors, Brand
  Targets, Brand Discovery, outreach status and Brand Fit Scores. Cache it
  with `cache.gs` and keep a version stamp.
- **"Suggested brands"** on a creator's record/sidebar card: brands that
  sponsor similar creators but not this one, each with the reason.
- **"Brand Opportunities" sheet:** co-sponsoring brands and niche gaps,
  with one-click "Add to Brand Targets" (reuse `brandService.gs`).
- **Done when:** the founder runs it on the real Sheet and gets at least
  one suggestion they'd actually act on. Also record real row counts here,
  to decide how dense the map will be.

### Phase 2: the map (Wormhole look)
- `BrandMap.html` with cosmos.gl + graphology loaded from jsDelivr, the
  visual design above, and hover card / click that opens the existing
  RecordModal.
- Dialog launch plus the web app full-screen route. Polling for live updates.
- **Done when:** it renders the real data in under 2s and the founder
  agrees it feels right.

### Phase 3: AI layer
- OpenJev `classify_()` with Gemini fallback, used to label edges
  (relationship type, risk, strength).
- Structural gaps → one Gemini call per gap → shown as wormholes with
  bridge suggestions.

### Phase 4: PGlite (only if needed)
- Local tables + Gemini embeddings in pgvector, for "brands like this one"
  search and an embedding-based layout mode.

### Future (brand-facing, separate service)
- Competitor analysis and relationship analysis views for brands, via the
  web app with read-only access (build on Brand View / Publish-as-Page).
- Our own prediction engine on OASIS, MiroFish-style, as a separate
  service. Needs hosting and budget decisions that conflict with today's
  zero-cost rule, so it needs a founder call when the time comes.
- Shared live data (OrbitDB or an alternative) once multiple users exist.

## Still open
- Founder to sanity-check the Wormhole translation above against the
  actual game.
- Codiv terms/limits and OpenJev accuracy (Phase 3 gate).
- OASIS license (future gate).
