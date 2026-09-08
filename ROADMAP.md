# Koli Roadmap

Last updated after: Batch 1 completion, checklist review, and the
Grist/Teable + agent-layer strategy discussion.

## Just shipped (outside the batch structure — bug fixes + borrowed ideas)

- Fixed: Creator One-Pager's `table.getRows is not a function` (DocumentApp's
  Table class uses `getNumRows()`/`getRow(i)`, not `getRows()`)
- **Run Diagnostics** (Koli menu) — one-click check of YouTube key, Gemini
  key, and Drive/Docs permission
- **Brand safety check** (Reddit, free, no key) — borrowed the "keyless
  scraping" approach from last30days-skill after confirming Reddit's
  plain JSON search endpoint is unreliable for scripted access
- **Assistant tab** — plain-English command box using Gemini function-calling,
  restricted to a small fixed set of Koli's own vetted actions (analyze
  channel/video, discover similar, export one-pager, check brand safety).
  This is the answer to "OpenClaw-like agent, restricted to the worksheet" —
  no new provider, no general agent, no arbitrary code execution.

## Strategic decision: Grist over Teable, if/when the platform rebuild happens

- **Teable's core (`teableio/teable`) is AGPL-3.0, not MIT** — checked the
  actual repo. Same problem that ruled out Plunk: AGPL's network copyleft
  conflicts with the "fork it, add proprietary features, sell it" plan.
- **Grist is genuinely Apache-2.0** (grist-core/grist-desktop/grist-static) —
  permissive, commercial-fork-safe. This is the licensing-safe option.
- Grist's native Card/Card List views and a community Kanban widget are a
  real UI upgrade over Sheets dropdowns for the outreach pipeline
  specifically — but Grist has no bundled serverless compute like Apps
  Script's free triggers/menus. Replicating what Koli's `.gs` files do
  would mean standing up an actual external service — real infrastructure,
  not a copy-paste. Tech stack for that, if/when: Python + TypeScript is
  sufficient (matches Grist's own stack); Go only if a compiled backend
  service is wanted over Node (optional, not necessary); skip Rust until
  there's a measured, specific performance need it solves that Python/TS
  can't — not before.
- **DenchClaw / dench.com** would be real competition in that future world
  (same "AI CRM, object tables, agent chat" pattern) — but its own README
  says "migrate to dench.com," meaning the open-source version is being
  steered toward retirement, and it requires a hosted Dench API key even
  to run "locally." Weak thing to borrow architecture from. Koli's edge
  there would be the vertical-specific pipeline already built, not the
  agent-chat pattern itself.
- **Current Koli (Apps Script) stays as-is** — it's the working pitch when
  the platform conversation becomes real, not a stepping stone to abandon
  early. No action needed here beyond continuing the batches below.

## Just shipped, round 2

- **SponsorBlock integration** — free, crowdsourced, human-verified sponsor
  segment data checked before falling back to Gemini's text guess. When
  it has coverage, it's a strictly better signal (real viewers marked
  it) and gives exact timestamps with no caption-matching needed. Also
  catches the case Gemini alone would miss entirely: a confirmed segment
  with no brand name in the description now logs as
  "Unknown (SponsorBlock-confirmed)" instead of vanishing.
- **Draft Deal Memo export** — merge-field contract starting point
  (parties, deliverables, rate anchor from CPM, payment terms, usage
  rights, exclusivity, FTC disclosure reminder), clearly labeled DRAFT /
  NOT LEGAL ADVICE. Deliberately not claiming "lawyer drafted" the way
  TalentSheets does — can't verify that claim, won't make it.
- **Teable/Grist clarification**: borrow Teable's product ideas (Postgres-
  backed tables, per-table REST API, native AI fields), never its AGPL
  code, into a from-scratch build on Grist's Apache-2.0 base.
- **Chrome extension verdict**: not better than Koli's current batch/API
  approach for YouTube. Likely *necessary* (not just preferable) for
  Instagram/TikTok later, since those platforms don't offer YouTube-
  equivalent free API access — flagging for whenever "other socials"
  becomes the active phase, not building now.

## Just shipped, round 3

- **"Send to Koli" browser extension** — borrowed the architecture from
  send-to-telegram: right-click context menu, POST to an endpoint with a
  shared secret. Koli's endpoint is an Apps Script Web App instead of a
  Telegram bot; captures land in a new **Inbox** tab, processed on demand
  via Koli > Process Inbox rather than automatically (keeps the webhook
  fast). Trimmed the hashtag system and the extension's own log UI from
  the original — the Inbox sheet already is the log.
- **Ollama/Gemma/FreeToken finding**: won't work with current Koli.
  Apps Script's server-side code has no network path to anything running
  on your laptop — that's a wall, not a config issue. FreeToken
  specifically also needs a real NVIDIA GPU. Local models become useful
  once the platform is self-hosted (Grist/Teable era), not before. The
  Mistral fallback already on this roadmap solves the actual rate-limit
  problem more simply than any local-model route would.

## MVP checkpoint

Deliberate pause here: paused new feature scoping to confirm the MVP bar
is actually met, not just kept expanding. Verdict — MVP-core (Channel,
Video, manual email override, Outreach pipeline, CPM, sponsor detection,
Creator One-Pager, Diagnostics) is fully built. Everything else shipped
so far (Profile, Discover, Assistant, brand-safety check, extension +
Inbox, Dashboard, Draft Deal Memo) is real value on top, not still-owed
scope. Next move: use it for a stretch before adding more, unless real
usage surfaces a gap.

## Parked — pending external input

- **EULA data-sharing clause**: drafted (`EULA_DATA_SHARING_CLAUSE.md`),
  scoped to exclude creator emails and raw text from the pooled data by
  design — pending your attorney's review before anything is built
  toward it.
- **Central pooled-data backend (Directus or otherwise)**: waits on the
  EULA review above. Don't build infrastructure for a feature whose
  legal shape isn't confirmed.
- **Google Workspace Add-on conversion**: agreed to happen before the
  Chrome Extension Sidebar (mobile-app-style). Scoped as "properly
  multi-document/multi-client installable," not a public Marketplace
  listing — that's a separate, later, discrete step.

## Validated against competitors (Sponsorship.so, TalentSheets) — round 2

- **Campaign management** (Kanban + reusable per-campaign templates) —
  confirmed real gap, Sponsorship.so shipped this exact shape
- **Discount code generator + CTR/CPV** — one feature, not two: the code
  generator is the mechanism that makes CTR/CPV computable at all
- **Rating** — tie to the existing authenticity score rather than a
  separate system
- **3 starter templates**: pitch email, campaign brief, proposal —
  Deal Memo and One-Pager already cover the contract/profile end
- **Extension: instant estimate while browsing** — Sponsorship.so's own
  extension does exactly this; extends "Send to Koli" naturally
- **Smart chips** — worth prototyping directly (rich inline cell objects
  via Apps Script), real "make the sheet feel like an app" upgrade
- **Content-from-data**: periodic "who's sponsoring X niche" pieces from
  Koli's own collected data, cheap organic marketing
- **Google Sheets Canvas**: real, native, 3 weeks old (Aug 13 2026) —
  try manually for brand-facing views now, don't build dependency yet
  (paywalled to Workspace Business+/AI Pro-Ultra, no dev API found yet)

## Strategic split: two products, one data layer

Creator-research/vetting stays spreadsheet-native (current Koli, later
Grist/Teable if that happens). Brand-facing side becomes a separate,
thin portal — likely Appsmith (Apache 2.0, confirmed clean license,
but it's an app-builder for a database you bring, not a spreadsheet
replacement) — reading the same underlying data, not duplicated logic.
Not building either portal split yet; flagging the shape now.

## Just shipped, round 4 — Channels redesign + Grade/Rank

- **Channels sheet restructured** to the master-list spec: hierarchical
  niche (main + up to 5 sub-niches), Contact (renamed from Email), Avg
  Views/Likes/Comments, Posting Times, channel-level Auth and Eng %
  (all from a batched recent-video-stats fetch), channel-level audience
  estimate (folded into the existing single merged Gemini call, no new
  API call added).
- **Grade**: composite score — growth momentum 50%, quality/authenticity
  30%, Tier-1 audience (US/UK/AUS/CAN) bonus 20%. Documented as Koli's
  own formula, not a standard metric — weights live in constants.gs.
- **Rank**: relative ranking across channels *you've* analyzed, recomputed
  on every Channel analysis run. Deliberately not a global YouTube
  ranking — no public API exposes that; it grows more useful as more
  channels get tracked, same as flagged when this was scoped.
- **Migration**: this reorders existing columns, not just appends new
  ones — the generic trailing-header-append logic would have silently
  misaligned every existing row. Added a real migration (Koli > Migrate
  Channels Sheet (v2)) that backs up the old sheet by renaming it,
  copies existing data into the new positions via copyTo (preserves
  hyperlinks/notes), leaves new fields blank for backfill on next
  analysis. Old Channels sheet is never deleted.
- **Speed trade-off, stated plainly**: Channel analysis now makes 2 more
  API calls per channel (a batched recent-video-stats fetch, a comment
  sample for authenticity) — not part of the parallel batch-prefetch
  path, so this is measurably slower per channel than before. Worth
  knowing given speed was a real focus earlier.
- **Inbox renamed to Prospects.**

## Just shipped, round 5 — publishing readiness + growth refinement

- **Date-windowed growth**: Grade's growth component now compares "last
  45 days" against "the 45 days before that," not a raw count-based
  half/half split — a daily poster and a monthly poster were getting
  wildly different effective time windows before. Falls back to the old
  count-based split only when a channel posts too rarely for either
  date window to have 2+ videos to compare.
- **Drive scope: `drive.file` attempted, reverted — this broke Export live.**
  Full `drive` is a "restricted" OAuth scope requiring an **annual paid
  CASA security assessment (~$540/year minimum, recurring forever)** to
  publish beyond personal use — `drive.file` doesn't, so narrowing it
  was worth trying. But Apps Script's built-in `DriveApp` service (used
  throughout `reportService.gs`) forces the full `drive` scope for most
  of its methods regardless of manifest declaration — confirmed live
  when `DriveApp.createFolder` broke with an explicit "requires
  https://.../auth/drive" error. Reverted to full `drive` to restore
  working Export immediately rather than guess again blind. Getting the
  CASA-avoidance benefit for real requires replacing `DriveApp` calls
  with the lower-level Advanced Drive Service — a genuine rewrite,
  listed below as its own task, not a scope tweak.

## Publishing checklist — Chrome Web Store + Google Workspace Marketplace

**Chrome Web Store** (the extension):
- $5 one-time developer registration fee
- Real icon assets (16/48/128px) — manifest currently has none
- Privacy policy URL — required, extension transmits data via the Web App
- Screenshots + store listing copy
- Justification for the `<all_urls>` host permission — broad permissions draw extra review scrutiny; may be worth narrowing to specific site patterns (youtube.com at minimum) if the review process pushes back
- Review timeline: days to weeks, longer for broad-permission extensions

**Google Workspace Marketplace** (the Add-on):
- OAuth consent screen verification (privacy policy, terms of service, app branding, support contact)
- Still on full `drive` scope (restricted, needs CASA) — reducing this
  to `drive.file` for real means rewriting `reportService.gs` to use the
  Advanced Drive Service instead of `DriveApp`, then testing it live
  before trusting it again. Not done yet — see "Just shipped" above for
  what happened on the first attempt.
- A demonstration video showing scope usage is required for sensitive-tier scopes even without CASA
- Marketplace SDK listing (screenshots, category, description) — separate step from OAuth verification itself
- Still pending regardless of scopes: the multi-document/multi-tenant properties refactor (Script Properties → per-document or per-user), since a publicly listed add-on can't have every installer sharing one set of stored settings

Given the scope fix just landed, the Marketplace path is meaningfully lighter than it looked a few messages ago. The properties refactor is now the biggest remaining piece — want that next, or the Chrome Web Store prep (icons, privacy policy, listing copy) since it's more self-contained and doesn't depend on the backend work?

## Just shipped, round 6 — properties refactor + Chrome Web Store prep

- **Properties refactor complete**: every setting/key/secret moved from
  `getScriptProperties()` (shared across every document a published
  Add-on would ever run against — would have silently defeated BYOK the
  moment this gets published) to `getDocumentProperties()` (isolated
  per spreadsheet automatically, no manual multi-tenancy code needed).
  Also caught and fixed a related risk: the webhook's failed-attempt
  lockout counter was on script-level cache — one customer's brute-force
  attempt would have locked out every other customer's webhook
  simultaneously in a shared deployment. Moved to document-level cache.
  Left the YouTube/Gemini/SponsorBlock/Reddit data caches on script
  level deliberately — that's public data, sharing it across tenants is
  an efficiency win, not a leak — documented why in cache.gs so it
  doesn't look like an inconsistency.
- **Chrome Web Store prep**: real icon assets generated (16/48/128px,
  matching the sidebar's brand mark), a draft privacy policy, and full
  listing copy with permission justifications (including the
  `<all_urls>` justification reviewers scrutinize). Still needed before
  actual submission: the $5 developer account, a public URL to host the
  privacy policy, and real screenshots.

## Use cases — parked

Real estate / land flipping (Zillow) flagged as a genuinely separate
vertical worth its own dedicated conversation — different data source
entirely, no YouTube angle. Not folded into this roadmap.

## Just shipped, round 7 — Mistral/Groq fallback, Performance Report, Manage (Campaigns)

- **Mistral + Groq fallback, live**: `geminiCallJson_` is now the public
  orchestrator — tries Gemini (with its own existing retry/backoff)
  first, falls through to Mistral then Groq only if a key is configured
  for each (BYOK, optional). No caller anywhere in the codebase needed
  to change — same function name, same contract, transparent fallback.
- **Performance Report export**: per-video Views/Likes/Eng%/Location/
  Age/Gender table pulled from Profile data, distinct from the Creator
  One-Pager (that's a pitch document for a brand; this is an internal
  "is this creator worth pursuing" document). Triggerable from a
  Channels row or a Profile row.
- **Manage (Campaigns)**: new tab, one row per deal, Stage dropdown
  (Briefed → In Production → Delivered → Payment Pending → Paid →
  Complete/Cancelled) — same proven pattern as Outreach's status column,
  since Sheets has no native Kanban view. Created via a small dialog
  from a Channels row (Brand, Deliverables, Value, Deadline, Notes). A
  real drag-and-drop board is a natural fit for the extension sidebar
  later, not attempted in-Sheet.
- **Icon-click-to-send** on the extension, plus console logging added to
  `background.js` for actually debugging the "didn't show up" report
  live instead of guessing again.

## Just shipped, round 8 — Brand Targets, Sponsor normalization, Gap Analysis Engine

- **Gap Analysis Engine, finally built.** Been on the "immediate next
  build" list since near the start of this project. For a given channel:
  finds brands sponsoring 2+ other channels sharing its main niche that
  haven't sponsored it yet. Pure synthesis over Channels + Sponsors data
  already collected — no new API calls, no new Gemini calls. Brands on
  the new Brand Targets list rank first in results.
- **Brand Targets** — new sheet, manual entry (Brand, Niche, Priority,
  Notes), feeds Gap Analysis's prioritization.
- **Sponsor name normalization** — consolidated into one function
  (`normalizeBrandName_`/`canonicalBrandName_` in the new
  `brandIntelligenceService.gs`); found and replaced an older, lighter
  duplicate (`normalizeSponsorName_`) that was already quietly doing
  part of this job. New sponsor detections now write the canonical name
  directly; `Normalize Sponsor Names` menu action cleans up historical
  rows already sitting in the sheet, preserving the Sample Video
  hyperlink through the merge (caught this as a real bug mid-build —
  the naive approach would have flattened it to plain text).
- **Central pooled-data backend — corrected, not just deferred.** This
  doesn't just wait on the EULA review; it can't do anything useful yet
  regardless, since there's only one Koli deployment and pooling needs
  other customers to pool with. Gap Analysis Engine delivers the same
  underlying insight ("who else isn't this brand working with") from
  single-user data — that's the actual near-term answer to this, not
  central infrastructure.

## Queued next — everything else from the Sept 7 planning session, in order

1. ✅ **Brand Fit Score — shipped, round 10** (see below). Channel-vs-
   campaign-brief scoring, not a Grade rewrite.
2. **Batch 2 remainder**: sponsor intelligence report, multi-creator
   comparison doc, brand strategy deconstruction (awareness vs.
   conversion), brand-kit ingestion (OCR)
3. **Batch 3 remainder**: weekly digest email, PDF/CSV snapshot export,
   duplicate detection, audience fraud signals, brand safety/compliance
   screening (own collected text), audience sentiment scoring
   (outreach draft generator ✅ shipped — see round 9 above)
4. **Batch 4**: historical trend snapshots, API cost tracker,
   creator-brand semantic matching (embeddings), ad-read text auditing,
   sponsor timestamp/chapter extraction
5. **Competitor-validated, not yet built**: smart chips, content-from-
   data marketing pieces, 3 starter templates (pitch email/brief/
   proposal), CTR/CPV via discount codes, instant-estimate-while-
   browsing (extension), Rating — already effectively covered by the
   existing Auth/authenticity score, no separate build needed
6. **20-question checklist** (from the strategy PDF) — use as an ongoing
   product-validation lens against each future build, not a single
   feature to ship

## Batch 1 — Outreach-ready ✅ DONE

- Manual email entry (preserves manual edits across re-runs)
- Outreach pipeline tracking (Outreach status, Last Contact, Notes columns)
- Do-not-contact / closed-door list (Discover auto-skips Passed/Do Not Contact)
- Creator one-pager export (PDF + Doc)
- Menu renamed to "Koli"

## Batch 2 — Sponsor & brand targeting

- Brand target list (curated, separate from auto-detected Sponsors)
- Sponsor intelligence report (which brands are spending in your niche, how often)
- Sponsor name normalization ("Nike" / "Nike Inc" collapsing into one row)
- Multi-creator comparison doc (same one-pager template, 2-4 creators side by side)
- **NEW — Brand strategy deconstruction**: classify a brand's recent
  campaigns as awareness-led (storytelling, reach, no direct CTA) vs.
  conversion-led (promo codes, UTM links, explicit CTAs). Same
  Gemini-classification pattern already used everywhere else in Koli.
- **NEW — Brand-kit ingestion**: drop media kits (PDF/image) into a Drive
  folder, Koli extracts rates, demographics, contact info into a sheet.
  Uses Drive's built-in free OCR first — no new API dependency unless
  that proves insufficient on real rate-card tables.

## Batch 3 — Efficiency & vetting depth

- ✅ **Outreach draft generator** — shipped round 9 (see "Just shipped" above)
- Weekly digest email (new sponsor detections, tracked-profile changes)
- PDF/CSV snapshot export of any tab
- Duplicate detection (same channel re-analyzed under a different URL format)
- **NEW — Audience quality / fraud signals**: extend beyond the current
  1-10 authenticity score to flag subscriber-spike and bot-comment
  patterns specifically.
- **NEW — Brand safety / compliance screening**: description + comment
  sample scan for profanity, controversial topics, competitor mentions.
  Reddit-based reputational check is done (see "Just shipped" above) —
  this item is now specifically about scanning Koli's own collected
  description/comment data, a different signal than the Reddit check.
- **NEW — Audience sentiment scoring**: reuses comment samples already
  being fetched for authenticity — separate classification pass, good
  candidate for a Groq-powered call instead of Gemini (see below).
- **NEW — Mistral fallback for Gemini enrichment calls**: when Gemini
  exhausts its own retries (rate-limited, like the 429 you hit), fall
  back to Mistral automatically instead of failing the row. This is what
  you asked to look at next — starting here.

## Batch 4 — Observability & bigger lifts

- Historical trend snapshots (dashboard KPIs currently have no memory)
- API usage/cost tracker
- **NEW — Creator-brand semantic matching**: vector search pairing brand
  guidelines against creator historical performance. Gemini already has
  an embeddings endpoint, so this doesn't need a new provider — it's an
  architecture addition (store + compare embeddings), which is why it's
  a later batch, not a quick add.
- **NEW — Ad-read text auditing**: reuses the caption-fetching
  infrastructure already built for sponsor timestamps, to check whether
  required talking points/promo codes/CTAs actually appear in a video.
  Text-only — verifying pronunciation isn't feasible with captions
  (that needs audio analysis, different architecture entirely). Useful
  once there are live sponsored placements to audit, not before.
- **NEW — Timestamp/chapter extraction for sponsored segments**: same
  captions infra, same "useful once campaigns are live" caveat.

## Deliberately not scheduled (revisit once you have the data to justify them)

These aren't bad ideas — they need historical deal/campaign data that
doesn't exist yet. Building them now would front-load tooling ahead of
having anything real to point it at:

- **Contract & deliverable parsing** — no deal volume yet to justify automating
- **Automated lead scoring** — needs historical conversion data to score against
- **Conversion & attribution modeling (CPA/ROAS)** — needs real campaign spend data
- **Automated client reporting** — needs actual campaign performance to report on

Revisit each once the underlying activity (contracts signed, campaigns
run, leads converted) has enough volume to make automating it worthwhile.

## Just shipped, round 9 — Outreach draft generator, extension pill fix, first test suite

- **Outreach draft generator, live** (Batch 3 item, first of the "queued
  next" list to ship). `outreachDraftService.gs` + Export > Draft
  Outreach Email (selected Channels row). Reads the last 3 videos'
  auto-caption transcripts (same best-effort endpoint sponsor timestamps
  already use — falls back to the description when a video has no
  captions), samples 3 evenly-spaced windows per transcript instead of
  just the intro (intros are almost always generic filler), and asks
  Gemini to hook the whole email on ONE specific concrete detail from
  ONE video. Business-oriented tone, personalized by construction (the
  hook requirement forces it), body hard-capped at 500 characters —
  enforced twice: once in the prompt, once as a deterministic backstop
  (`enforceEmailCharLimit_`, trims at the last word boundary) since
  nothing on Gemini's end actually enforces a stated limit. Lands in a
  new **Outreach Drafts** sheet, not a Doc — cells are natively editable,
  and the Chars column is a live `=LEN()` formula so it keeps tracking
  the limit as you hand-edit the draft afterward.
- **Extension bug fixed**: the lock pill and Settings summary always
  fell back to labeling the destination "Prospects" once locked, even on
  the YouTube tab — but channel/video captures haven't landed in
  Prospects since the round-7-era doPost rewrite (they go straight to
  Channels/Videos; only notes still queue to Prospects). The pill was
  telling you the wrong tab. Fixed to show "Channels/Videos" as the
  YouTube-tab default; "Other Platforms" profiles keep the "Prospects"
  default since that one's still accurate for them.
- **First real test coverage**: `tests/run-logic-tests.js` — Node,
  zero dependencies, runs each pure/deterministic .gs file in its own vm
  context and exercises it directly. Only covers logic that doesn't
  touch SpreadsheetApp/UrlFetchApp/a live key (still nothing that
  replaces actually running this in a real Sheet — see STATUS.md), but
  it's the first thing in this project that runs unattended and catches
  a regression instead of relying on inspection. Caught two real bugs on
  its first run, both fixed same session:
  - `clampAuthenticityScore_(null)` returned `1` instead of staying
    `null` (`Number(null) === 0`, not `NaN` — the isNaN check never
    fired). `computeEngagementQualityScore_` in
    `channelMetricsService.gs` specifically treats a null authenticity
    score as neutral (50/100) for the "no comment sample available"
    case — that fallback was silently dead code, every such channel was
    scoring as if its comments looked bot-farmed instead of "no data."
  - `canonicalBrandName_`'s own doc comment says it preserves
    intentional lowercase branding ("adidas", "iRobot") — the code
    title-cased *any* all-lowercase input regardless, so "adidas" was
    coming out "Adidas," contradicting its own stated intent. Narrowed
    the reshape to ALL-CAPS-only input, matching what the comment always
    claimed it did.

## Just shipped, round 10 — Brand Fit Score, UI redesign

- **Brand Fit Score, live** (queued-next item 1, the "7-component scoring
  framework" from the Sept 7 session). `brandFitService.gs` + Brand
  Intelligence > Brand Fit Score (selected Channels row(s), multi-row
  supported for side-by-side comparison). Not a Grade rewrite — Grade
  stays the channel-intrinsic score, same for every brand. Brand Fit
  Score is channel-vs-one-specific-campaign-brief (brand, target niche,
  target audience, budget/video), and specifically replaces two things
  Grade's own code comments already flagged as placeholders once a real
  target exists: contentFit (was a flat neutral 50) and audienceFit
  (was a binary Tier-1-country check). The other 4 components —
  engagement quality, momentum, reliability — are reused as-is from
  Grade (they don't change per brief); risk uses a live
  `checkBrandSafety()` Reddit check instead of Grade's authenticity-only
  proxy, worth the extra API call for a real spend decision on one
  creator, not worth it on every bulk Channel analysis pass. New
  budgetFit component: brief's stated per-video budget vs. the channel's
  estimated CPM cost at its typical view count. Full weights and
  reasoning documented in constants.gs (BRAND_FIT_WEIGHTS) — this is
  Koli's own framework, not sourced from the referenced strategy PDF
  (not available in this session), stated plainly rather than implied
  otherwise. Results land in a new **Brand Fit Scores** sheet, one row
  per (channel, brand) scoring event, full component breakdown in a
  cell note (same pattern as Grade's).
- **UI redesign, both surfaces**: refined design tokens (shadow/radius
  scale, consistent motion easing), a shared inline-SVG icon system
  replacing emoji throughout, dark-mode support via
  `prefers-color-scheme` on both the extension popup and the Sidebar,
  and matching brand-mark treatment across both. Every element
  id/class the existing JS depends on was verified unchanged; every
  screen/state was exercised through a local static-preview harness
  (mocked `chrome.storage` / `google.script.run`) in both color schemes
  before shipping.

## Just shipped, round 11 — extension Channel/Video split

Direct response to feedback that the extension's YouTube column editor
(and my own round-9 "Channels/Videos" pill fix) blended two sheets with
genuinely different headers into one label/one column list. Fixed at
the root instead of just re-wording:

- **Context menu, explicit not auto-detected**: "Send link to Koli
  (YouTube)" and "Send this page to Koli" (which auto-classified via
  `classifyUrl()`) are replaced with a **"Send to Worksheet"** submenu
  offering **Channel** / **Video** as an explicit user choice, for both
  a right-clicked link and the current page. `classifyUrl()` is kept,
  but demoted to a soft mismatch check — if what you clicked doesn't
  look like what you picked, the "Analyzing…" notification says so, but
  never overrides your explicit choice.
- **Popup column editor, split for real**: the YouTube tab now has a
  Channels/Videos switcher, each with its own real column list
  (`columnsChannel`/`columnsVideo`, migrated automatically from the old
  single `columns` field) and its own Apply action. Server side,
  `applyChannelColumnLayout_` (sheetWriter.gs) generalized to
  `applyColumnLayout_(sheetName, orderedNames)`, with a new
  `apply_video_columns` Web App action alongside the existing
  `apply_channel_columns`.
- **Lock pill, contextual**: shows "Channels" or "Videos" depending on
  which switcher tab is active, instead of one blended label — this is
  what actually resolves the original complaint, not just different
  wording.
- **Sponsors as a 3rd send target — considered, not built.** Raised
  alongside this: once Sponsors (aggregate rollup) and Sponsor Mentions
  (per-mention detail log) are consolidated into one real schema, add
  "Send to Worksheet → Sponsor" the same way. Explicitly gated on that
  consolidation happening first — sending a bare brand-name link/
  selection has no real destination schema to land in yet, and building
  the send-target before the schema exists would just create another
  thing to migrate later. Not scheduled yet; a real Batch 2/3 candidate
  once Sponsors/Sponsor Mentions consolidation itself is scoped.

## Just shipped, round 12 — Sponsors/Sponsor Mentions consolidation, humanized outreach drafts

- **Sponsor Mentions retired.** It and Sponsors were carrying almost the
  same information twice. Posted/Timestamp/Evidence now live directly
  on the Sponsors rollup (SPONSOR_HEADERS grew from 7 to 10 columns,
  pure append — existing sheets migrate automatically, no manual step).
  Each column reflects the LATEST mention for that (channel, brand)
  pair, same "current state" semantics Last Seen already had — full
  mention-by-mention history is no longer kept, a deliberate
  simplification. `logSponsorMentions_` and its gating Settings toggle
  are gone; SponsorBlock's free verified timestamp is now always
  attempted (used to require the toggle + LOG_SPONSOR_MENTIONS both on),
  the caption-fuzzy-match fallback still costs a real network call so
  it's still gated behind Attempt In-Video Timestamp alone.
  `normalizeExistingSponsors()` (Normalize Sponsor Names) updated to
  carry Posted/Timestamp/Evidence through a merge instead of silently
  clearing them — caught this before it shipped as a real regression the
  consolidation would have introduced.
- **Outreach drafts, humanized.** Full prompt rewrite in
  `draftOutreachEmailCopy_` (outreachDraftService.gs). Positioning was
  wrong before: it read as a brand cold-pitching a creator for a promo.
  Corrected to the actual relationship — an agency OFFERING a creator
  well-matched sponsor opportunities it will source and manage
  long-term, not asking the creator for anything. Explicit tone rules
  now in the prompt: lead with value not a request, name one real pain
  point (inconsistent sponsor income, generic ill-fitting deals, time
  spent chasing brands, negotiating without an agent) rather than
  generic flattery, no salesy/needy language (banned phrases listed
  explicitly — "would love to," "amazing opportunity," exclamation
  points), low-pressure closing question instead of a hard CTA. The
  video-detail personalization hook and 500-char hard limit are
  unchanged — only the actual copy the model is asked to write changed.

## On Groq / Mistral / HF Serverless / Cloudflare Workers AI

- **Mistral** — adding as a Gemini fallback for rate-limit failures (Batch 3, next up)
- **Groq** — fast/cheap, but weaker structured-JSON reliability than
  Mistral/Gemini; earmarked for a narrow use (sentiment classification),
  not the main enrichment pipeline
- **Cloudflare Workers AI** — its embeddings are the useful part, tied to
  the Batch 4 semantic-matching feature; not useful before that exists
- **Hugging Face Serverless** — skipped for the core pipeline; cold
  starts and inconsistent free-tier reliability make it a poor fit for
  anything that needs to run reliably
