# Koli Roadmap

Last updated after: Batch 1 completion, checklist review, and the
Grist/Teable + agent-layer strategy discussion.

## Just shipped (outside the batch structure: bug fixes + borrowed ideas)

- Fixed: Creator One-Pager's `table.getRows is not a function` (DocumentApp's
  Table class uses `getNumRows()`/`getRow(i)`, not `getRows()`)
- **Run Diagnostics** (Koli menu): one-click check of YouTube key, Gemini
  key, and Drive/Docs permission
- **Brand safety check** (Reddit, free, no key): borrowed the "keyless
  scraping" approach from last30days-skill after confirming Reddit's
  plain JSON search endpoint is unreliable for scripted access
- ~~**Assistant tab**~~: plain-English command box using Gemini
  function-calling, restricted to a small fixed set of Koli's own vetted
  actions. **Removed in a later round** (see the round below): every
  action it could invoke already had a faster, more certain direct path
  (paste a link, click a menu item), so the NL layer added latency and
  an unverified failure mode for zero new capability.

## Strategic decision: Grist over Teable, if/when the platform rebuild happens

- **Teable's core (`teableio/teable`) is AGPL-3.0, not MIT**: checked the
  actual repo. Same problem that ruled out Plunk: AGPL's network copyleft
  conflicts with the "fork it, add proprietary features, sell it" plan.
- **Grist is genuinely Apache-2.0** (grist-core/grist-desktop/grist-static):
  permissive, commercial-fork-safe. This is the licensing-safe option.
- Grist's native Card/Card List views and a community Kanban widget are a
  real UI upgrade over Sheets dropdowns for the outreach pipeline
  specifically: but Grist has no bundled serverless compute like Apps
  Script's free triggers/menus. Replicating what Koli's `.gs` files do
  would mean standing up an actual external service: real infrastructure,
  not a copy-paste. Tech stack for that, if/when: Python + TypeScript is
  sufficient (matches Grist's own stack); Go only if a compiled backend
  service is wanted over Node (optional, not necessary); skip Rust until
  there's a measured, specific performance need it solves that Python/TS
  can't: not before.
- **DenchClaw / dench.com** would be real competition in that future world
  (same "AI CRM, object tables, agent chat" pattern): but its own README
  says "migrate to dench.com," meaning the open-source version is being
  steered toward retirement, and it requires a hosted Dench API key even
  to run "locally." Weak thing to borrow architecture from. Koli's edge
  there would be the vertical-specific pipeline already built, not the
  agent-chat pattern itself.
- **Current Koli (Apps Script) stays as-is**: it's the working pitch when
  the platform conversation becomes real, not a stepping stone to abandon
  early. No action needed here beyond continuing the batches below.

## Just shipped, round 2

- **SponsorBlock integration**: free, crowdsourced, human-verified sponsor
  segment data checked before falling back to Gemini's text guess. When
  it has coverage, it's a strictly better signal (real viewers marked
  it) and gives exact timestamps with no caption-matching needed. Also
  catches the case Gemini alone would miss entirely: a confirmed segment
  with no brand name in the description now logs as
  "Unknown (SponsorBlock-confirmed)" instead of vanishing.
- **Draft Deal Memo export**: merge-field contract starting point
  (parties, deliverables, rate anchor from CPM, payment terms, usage
  rights, exclusivity, FTC disclosure reminder), clearly labeled DRAFT /
  NOT LEGAL ADVICE. Deliberately not claiming "lawyer drafted" the way
  TalentSheets does: can't verify that claim, won't make it.
- **Teable/Grist clarification**: borrow Teable's product ideas (Postgres-
  backed tables, per-table REST API, native AI fields), never its AGPL
  code, into a from-scratch build on Grist's Apache-2.0 base.
- **Chrome extension verdict**: not better than Koli's current batch/API
  approach for YouTube. Likely *necessary* (not just preferable) for
  Instagram/TikTok later, since those platforms don't offer YouTube-
  equivalent free API access: flagging for whenever "other socials"
  becomes the active phase, not building now.

## Just shipped, round 3

- **"Send to Koli" browser extension**: borrowed the architecture from
  send-to-telegram: right-click context menu, POST to an endpoint with a
  shared secret. Koli's endpoint is an Apps Script Web App instead of a
  Telegram bot; captures land in a new **Inbox** tab, processed on demand
  via Koli > Process Inbox rather than automatically (keeps the webhook
  fast). Trimmed the hashtag system and the extension's own log UI from
  the original: the Inbox sheet already is the log.
- **Ollama/Gemma/FreeToken finding**: won't work with current Koli.
  Apps Script's server-side code has no network path to anything running
  on your laptop: that's a wall, not a config issue. FreeToken
  specifically also needs a real NVIDIA GPU. Local models become useful
  once the platform is self-hosted (Grist/Teable era), not before. The
  Mistral fallback already on this roadmap solves the actual rate-limit
  problem more simply than any local-model route would.

## MVP checkpoint

Deliberate pause here: paused new feature scoping to confirm the MVP bar
is actually met, not just kept expanding. Verdict: MVP-core (Channel,
Video, manual email override, Outreach pipeline, CPM, sponsor detection,
Creator One-Pager, Diagnostics) is fully built. Everything else shipped
so far (Profile, Discover, Assistant, brand-safety check, extension +
Inbox, Dashboard, Draft Deal Memo) is real value on top, not still-owed
scope. Next move: use it for a stretch before adding more, unless real
usage surfaces a gap.

## Parked: pending external input

- **EULA data-sharing clause**: drafted (`EULA_DATA_SHARING_CLAUSE.md`),
  scoped to exclude creator emails and raw text from the pooled data by
  design: pending your attorney's review before anything is built
  toward it.
- **Central pooled-data backend (Directus or otherwise)**: waits on the
  EULA review above. Don't build infrastructure for a feature whose
  legal shape isn't confirmed.
- **Google Workspace Add-on conversion**: agreed to happen before the
  Chrome Extension Sidebar (mobile-app-style). Scoped as "properly
  multi-document/multi-client installable," not a public Marketplace
  listing: that's a separate, later, discrete step.

## Validated against competitors (Sponsorship.so, TalentSheets): round 2

- **Campaign management** (Kanban + reusable per-campaign templates):
  confirmed real gap, Sponsorship.so shipped this exact shape
- **Discount code generator + CTR/CPV**: one feature, not two: the code
  generator is the mechanism that makes CTR/CPV computable at all
- **Rating**: tie to the existing authenticity score rather than a
  separate system
- **3 starter templates**: pitch email, campaign brief, proposal:
  Deal Memo and One-Pager already cover the contract/profile end
- **Extension: instant estimate while browsing**: Sponsorship.so's own
  extension does exactly this; extends "Send to Koli" naturally
- **Smart chips**: worth prototyping directly (rich inline cell objects
  via Apps Script), real "make the sheet feel like an app" upgrade
- **Content-from-data**: periodic "who's sponsoring X niche" pieces from
  Koli's own collected data, cheap organic marketing
- **Google Sheets Canvas**: real, native, 3 weeks old (Aug 13 2026):
  try manually for brand-facing views now, don't build dependency yet
  (paywalled to Workspace Business+/AI Pro-Ultra, no dev API found yet)

## Strategic split: two products, one data layer

Creator-research/vetting stays spreadsheet-native (current Koli, later
Grist/Teable if that happens). Brand-facing side becomes a separate,
thin portal: likely Appsmith (Apache 2.0, confirmed clean license,
but it's an app-builder for a database you bring, not a spreadsheet
replacement): reading the same underlying data, not duplicated logic.
Not building either portal split yet; flagging the shape now.

## Just shipped, round 4: Channels redesign + Grade/Rank

- **Channels sheet restructured** to the master-list spec: hierarchical
  niche (main + up to 5 sub-niches), Contact (renamed from Email), Avg
  Views/Likes/Comments, Posting Times, channel-level Auth and Eng %
  (all from a batched recent-video-stats fetch), channel-level audience
  estimate (folded into the existing single merged Gemini call, no new
  API call added).
- **Grade**: composite score: growth momentum 50%, quality/authenticity
  30%, Tier-1 audience (US/UK/AUS/CAN) bonus 20%. Documented as Koli's
  own formula, not a standard metric: weights live in constants.gs.
- **Rank**: relative ranking across channels *you've* analyzed, recomputed
  on every Channel analysis run. Deliberately not a global YouTube
  ranking: no public API exposes that; it grows more useful as more
  channels get tracked, same as flagged when this was scoped.
- **Migration**: this reorders existing columns, not just appends new
  ones: the generic trailing-header-append logic would have silently
  misaligned every existing row. Added a real migration (Koli > Migrate
  Channels Sheet (v2)) that backs up the old sheet by renaming it,
  copies existing data into the new positions via copyTo (preserves
  hyperlinks/notes), leaves new fields blank for backfill on next
  analysis. Old Channels sheet is never deleted.
- **Speed trade-off, stated plainly**: Channel analysis now makes 2 more
  API calls per channel (a batched recent-video-stats fetch, a comment
  sample for authenticity): not part of the parallel batch-prefetch
  path, so this is measurably slower per channel than before. Worth
  knowing given speed was a real focus earlier.
- **Inbox renamed to Prospects.**

## Just shipped, round 5: publishing readiness + growth refinement

- **Date-windowed growth**: Grade's growth component now compares "last
  45 days" against "the 45 days before that," not a raw count-based
  half/half split: a daily poster and a monthly poster were getting
  wildly different effective time windows before. Falls back to the old
  count-based split only when a channel posts too rarely for either
  date window to have 2+ videos to compare.
- **Drive scope: `drive.file` attempted, reverted: this broke Export live.**
  Full `drive` is a "restricted" OAuth scope requiring an **annual paid
  CASA security assessment (~$540/year minimum, recurring forever)** to
  publish beyond personal use: `drive.file` doesn't, so narrowing it
  was worth trying. But Apps Script's built-in `DriveApp` service (used
  throughout `reportService.gs`) forces the full `drive` scope for most
  of its methods regardless of manifest declaration: confirmed live
  when `DriveApp.createFolder` broke with an explicit "requires
  https://.../auth/drive" error. Reverted to full `drive` to restore
  working Export immediately rather than guess again blind. Getting the
  CASA-avoidance benefit for real requires replacing `DriveApp` calls
  with the lower-level Advanced Drive Service: a genuine rewrite,
  listed below as its own task, not a scope tweak.

## Publishing checklist: Chrome Web Store + Google Workspace Marketplace

**Chrome Web Store** (the extension):
- [x] Real icon assets (16/48/128px)
- [x] Store listing copy (STORE_LISTING.md)
- [x] Privacy policy drafted (PRIVACY_POLICY.md): placeholders filled in
- [ ] **Privacy policy needs a public URL.** A markdown file in the repo
  doesn't satisfy Chrome's requirement: it needs to be hosted somewhere
  reachable (GitHub Pages, a simple static page, whatever's easiest) and
  that URL is what goes in the Developer Dashboard field.
- [ ] **Screenshots**: not created. Can generate the popup-UI ones from
  the existing `.preview/` static harness; the "context menu open"
  screenshot needs an actual browser with the extension loaded (can't be
  faked from a static render).
- [ ] **$5 one-time developer registration fee**: needs the account
  holder, not something that can be done on your behalf.
- Justification for the `<all_urls>` host permission is already written
  in STORE_LISTING.md; broad permissions still draw extra review
  scrutiny, may need narrowing to youtube.com if review pushes back.
- Review timeline: days to weeks, longer for broad-permission extensions.

**Google Workspace Marketplace** (the Add-on):
- [x] **Drive scope dropped to `drive.file`: the CASA blocker is
  resolved without paying for CASA.** `reportService.gs` rewritten to
  use the Advanced Drive Service (`Drive.*`, Drive API v3) instead of
  `DriveApp`: see round 13 below and the file's own top comment. This
  is genuinely the second attempt at this exact change (the first broke
  Export live and was reverted); it could not be tested against a live
  response here either (no Google account in this environment):
  **test Export/Deal Memo/Performance Report for real before trusting
  this**, and if it breaks, the fix is either the specific wrong
  `Drive.*` call or reverting the commit back to full `drive` + CASA.
- [x] Terms of Service drafted (TERMS_OF_SERVICE.md: did not exist at
  all before this)
- [x] Multi-document/multi-tenant properties refactor (round 6, already done)
- [ ] Privacy policy + ToS both need public URLs (same as above):
  OAuth consent screen verification requires linking to them, not
  uploading the files
- [ ] A demonstration video showing scope usage (still required for any
  sensitive-tier scope, `drive.file` included, just a much shorter/
  simpler video than a full-`drive` walkthrough would need)
- [ ] Marketplace SDK listing (screenshots, category, description):
  separate step from OAuth verification itself

Both stores now converge on the same two blockers: **hosting the legal
docs at public URLs**, and **screenshots**. Everything else that was
genuinely blocking (the CASA cost, the missing ToS, the properties
refactor) is resolved.

## Just shipped, round 6: properties refactor + Chrome Web Store prep

- **Properties refactor complete**: every setting/key/secret moved from
  `getScriptProperties()` (shared across every document a published
  Add-on would ever run against: would have silently defeated BYOK the
  moment this gets published) to `getDocumentProperties()` (isolated
  per spreadsheet automatically, no manual multi-tenancy code needed).
  Also caught and fixed a related risk: the webhook's failed-attempt
  lockout counter was on script-level cache: one customer's brute-force
  attempt would have locked out every other customer's webhook
  simultaneously in a shared deployment. Moved to document-level cache.
  Left the YouTube/Gemini/SponsorBlock/Reddit data caches on script
  level deliberately: that's public data, sharing it across tenants is
  an efficiency win, not a leak: documented why in cache.gs so it
  doesn't look like an inconsistency.
- **Chrome Web Store prep**: real icon assets generated (16/48/128px,
  matching the sidebar's brand mark), a draft privacy policy, and full
  listing copy with permission justifications (including the
  `<all_urls>` justification reviewers scrutinize). Still needed before
  actual submission: the $5 developer account, a public URL to host the
  privacy policy, and real screenshots.

## Use cases: parked

Real estate / land flipping (Zillow) flagged as a genuinely separate
vertical worth its own dedicated conversation: different data source
entirely, no YouTube angle. Not folded into this roadmap.

## Just shipped, round 7: Mistral/Groq fallback, Performance Report, Manage (Campaigns)

- **Mistral + Groq fallback, live**: `geminiCallJson_` is now the public
  orchestrator: tries Gemini (with its own existing retry/backoff)
  first, falls through to Mistral then Groq only if a key is configured
  for each (BYOK, optional). No caller anywhere in the codebase needed
  to change: same function name, same contract, transparent fallback.
- **Performance Report export**: per-video Views/Likes/Eng%/Location/
  Age/Gender table pulled from Profile data, distinct from the Creator
  One-Pager (that's a pitch document for a brand; this is an internal
  "is this creator worth pursuing" document). Triggerable from a
  Channels row or a Profile row.
- **Manage (Campaigns)**: new tab, one row per deal, Stage dropdown
  (Briefed → In Production → Delivered → Payment Pending → Paid →
  Complete/Cancelled): same proven pattern as Outreach's status column,
  since Sheets has no native Kanban view. Created via a small dialog
  from a Channels row (Brand, Deliverables, Value, Deadline, Notes). A
  real drag-and-drop board is a natural fit for the extension sidebar
  later, not attempted in-Sheet.
- **Icon-click-to-send** on the extension, plus console logging added to
  `background.js` for actually debugging the "didn't show up" report
  live instead of guessing again.

## Just shipped, round 8: Brand Targets, Sponsor normalization, Gap Analysis Engine

- **Gap Analysis Engine, finally built.** Been on the "immediate next
  build" list since near the start of this project. For a given channel:
  finds brands sponsoring 2+ other channels sharing its main niche that
  haven't sponsored it yet. Pure synthesis over Channels + Sponsors data
  already collected: no new API calls, no new Gemini calls. Brands on
  the new Brand Targets list rank first in results.
- **Brand Targets**: new sheet, manual entry (Brand, Niche, Priority,
  Notes), feeds Gap Analysis's prioritization.
- **Sponsor name normalization**: consolidated into one function
  (`normalizeBrandName_`/`canonicalBrandName_` in the new
  `brandIntelligenceService.gs`); found and replaced an older, lighter
  duplicate (`normalizeSponsorName_`) that was already quietly doing
  part of this job. New sponsor detections now write the canonical name
  directly; `Normalize Sponsor Names` menu action cleans up historical
  rows already sitting in the sheet, preserving the Sample Video
  hyperlink through the merge (caught this as a real bug mid-build:
  the naive approach would have flattened it to plain text).
- **Central pooled-data backend: corrected, not just deferred.** This
  doesn't just wait on the EULA review; it can't do anything useful yet
  regardless, since there's only one Koli deployment and pooling needs
  other customers to pool with. Gap Analysis Engine delivers the same
  underlying insight ("who else isn't this brand working with") from
  single-user data: that's the actual near-term answer to this, not
  central infrastructure.

## Queued next: everything else from the Sept 7 planning session, in order

1. ✅ **Brand Fit Score: shipped, round 10** (see below). Channel-vs-
   campaign-brief scoring, not a Grade rewrite.
2. **Batch 2 remainder**: sponsor intelligence report, multi-creator
   comparison doc, brand strategy deconstruction (awareness vs.
   conversion), brand-kit ingestion (OCR)
3. **Batch 3 remainder**: weekly digest email, PDF/CSV snapshot export,
   duplicate detection, audience fraud signals, brand safety/compliance
   screening (own collected text), audience sentiment scoring
   (outreach draft generator ✅ shipped: see round 9 above)
4. **Batch 4**: historical trend snapshots, API cost tracker,
   creator-brand semantic matching (embeddings), ad-read text auditing,
   sponsor timestamp/chapter extraction
5. **Competitor-validated, not yet built**: smart chips, content-from-
   data marketing pieces, 3 starter templates (pitch email/brief/
   proposal), CTR/CPV via discount codes, instant-estimate-while-
   browsing (extension), Rating: already effectively covered by the
   existing Auth/authenticity score, no separate build needed
6. **20-question checklist** (from the strategy PDF): use as an ongoing
   product-validation lens against each future build, not a single
   feature to ship

## Batch 1: Outreach-ready ✅ DONE

- Manual email entry (preserves manual edits across re-runs)
- Outreach pipeline tracking (Outreach status, Last Contact, Notes columns)
- Do-not-contact / closed-door list (Discover auto-skips Passed/Do Not Contact)
- Creator one-pager export (PDF + Doc)
- Menu renamed to "Koli"

## Batch 2: Sponsor & brand targeting

- Brand target list (curated, separate from auto-detected Sponsors)
- Sponsor intelligence report (which brands are spending in your niche, how often)
- Sponsor name normalization ("Nike" / "Nike Inc" collapsing into one row)
- Multi-creator comparison doc (same one-pager template, 2-4 creators side by side)
- **NEW: Brand strategy deconstruction**: classify a brand's recent
  campaigns as awareness-led (storytelling, reach, no direct CTA) vs.
  conversion-led (promo codes, UTM links, explicit CTAs). Same
  Gemini-classification pattern already used everywhere else in Koli.
- **NEW: Brand-kit ingestion**: drop media kits (PDF/image) into a Drive
  folder, Koli extracts rates, demographics, contact info into a sheet.
  Uses Drive's built-in free OCR first: no new API dependency unless
  that proves insufficient on real rate-card tables.

## Batch 3: Efficiency & vetting depth

- ✅ **Outreach draft generator**: shipped round 9 (see "Just shipped" above)
- Weekly digest email (new sponsor detections, tracked-profile changes)
- PDF/CSV snapshot export of any tab
- Duplicate detection (same channel re-analyzed under a different URL format)
- **NEW: Audience quality / fraud signals**: extend beyond the current
  1-10 authenticity score to flag subscriber-spike and bot-comment
  patterns specifically.
- **NEW: Brand safety / compliance screening**: description + comment
  sample scan for profanity, controversial topics, competitor mentions.
  Reddit-based reputational check is done (see "Just shipped" above):
  this item is now specifically about scanning Koli's own collected
  description/comment data, a different signal than the Reddit check.
- **NEW: Audience sentiment scoring**: reuses comment samples already
  being fetched for authenticity: separate classification pass, good
  candidate for a Groq-powered call instead of Gemini (see below).
- **NEW: Mistral fallback for Gemini enrichment calls**: when Gemini
  exhausts its own retries (rate-limited, like the 429 you hit), fall
  back to Mistral automatically instead of failing the row. This is what
  you asked to look at next: starting here.

## Batch 4: Observability & bigger lifts

- Historical trend snapshots (dashboard KPIs currently have no memory)
- API usage/cost tracker
- **NEW: Creator-brand semantic matching**: vector search pairing brand
  guidelines against creator historical performance. Gemini already has
  an embeddings endpoint, so this doesn't need a new provider: it's an
  architecture addition (store + compare embeddings), which is why it's
  a later batch, not a quick add.
- **NEW: Ad-read text auditing**: reuses the caption-fetching
  infrastructure already built for sponsor timestamps, to check whether
  required talking points/promo codes/CTAs actually appear in a video.
  Text-only: verifying pronunciation isn't feasible with captions
  (that needs audio analysis, different architecture entirely). Useful
  once there are live sponsored placements to audit, not before.
- **NEW: Timestamp/chapter extraction for sponsored segments**: same
  captions infra, same "useful once campaigns are live" caveat.

## Deliberately not scheduled (revisit once you have the data to justify them)

These aren't bad ideas: they need historical deal/campaign data that
doesn't exist yet. Building them now would front-load tooling ahead of
having anything real to point it at:

- **Contract & deliverable parsing**: no deal volume yet to justify automating
- **Automated lead scoring**: needs historical conversion data to score against
- **Conversion & attribution modeling (CPA/ROAS)**: needs real campaign spend data
- **Automated client reporting**: needs actual campaign performance to report on

Revisit each once the underlying activity (contracts signed, campaigns
run, leads converted) has enough volume to make automating it worthwhile.

## Just shipped, round 9: Outreach draft generator, extension pill fix, first test suite

- **Outreach draft generator, live** (Batch 3 item, first of the "queued
  next" list to ship). `outreachDraftService.gs` + Export > Draft
  Outreach Email (selected Channels row). Reads the last 3 videos'
  auto-caption transcripts (same best-effort endpoint sponsor timestamps
  already use: falls back to the description when a video has no
  captions), samples 3 evenly-spaced windows per transcript instead of
  just the intro (intros are almost always generic filler), and asks
  Gemini to hook the whole email on ONE specific concrete detail from
  ONE video. Business-oriented tone, personalized by construction (the
  hook requirement forces it), body hard-capped at 500 characters:
  enforced twice: once in the prompt, once as a deterministic backstop
  (`enforceEmailCharLimit_`, trims at the last word boundary) since
  nothing on Gemini's end actually enforces a stated limit. Lands in a
  new **Outreach Drafts** sheet, not a Doc: cells are natively editable,
  and the Chars column is a live `=LEN()` formula so it keeps tracking
  the limit as you hand-edit the draft afterward.
- **Extension bug fixed**: the lock pill and Settings summary always
  fell back to labeling the destination "Prospects" once locked, even on
  the YouTube tab: but channel/video captures haven't landed in
  Prospects since the round-7-era doPost rewrite (they go straight to
  Channels/Videos; only notes still queue to Prospects). The pill was
  telling you the wrong tab. Fixed to show "Channels/Videos" as the
  YouTube-tab default; "Other Platforms" profiles keep the "Prospects"
  default since that one's still accurate for them.
- **First real test coverage**: `tests/run-logic-tests.js`: Node,
  zero dependencies, runs each pure/deterministic .gs file in its own vm
  context and exercises it directly. Only covers logic that doesn't
  touch SpreadsheetApp/UrlFetchApp/a live key (still nothing that
  replaces actually running this in a real Sheet: see STATUS.md), but
  it's the first thing in this project that runs unattended and catches
  a regression instead of relying on inspection. Caught two real bugs on
  its first run, both fixed same session:
  - `clampAuthenticityScore_(null)` returned `1` instead of staying
    `null` (`Number(null) === 0`, not `NaN`: the isNaN check never
    fired). `computeEngagementQualityScore_` in
    `channelMetricsService.gs` specifically treats a null authenticity
    score as neutral (50/100) for the "no comment sample available"
    case: that fallback was silently dead code, every such channel was
    scoring as if its comments looked bot-farmed instead of "no data."
  - `canonicalBrandName_`'s own doc comment says it preserves
    intentional lowercase branding ("adidas", "iRobot"): the code
    title-cased *any* all-lowercase input regardless, so "adidas" was
    coming out "Adidas," contradicting its own stated intent. Narrowed
    the reshape to ALL-CAPS-only input, matching what the comment always
    claimed it did.

## Just shipped, round 10: Brand Fit Score, UI redesign

- **Brand Fit Score, live** (queued-next item 1, the "7-component scoring
  framework" from the Sept 7 session). `brandFitService.gs` + Brand
  Intelligence > Brand Fit Score (selected Channels row(s), multi-row
  supported for side-by-side comparison). Not a Grade rewrite: Grade
  stays the channel-intrinsic score, same for every brand. Brand Fit
  Score is channel-vs-one-specific-campaign-brief (brand, target niche,
  target audience, budget/video), and specifically replaces two things
  Grade's own code comments already flagged as placeholders once a real
  target exists: contentFit (was a flat neutral 50) and audienceFit
  (was a binary Tier-1-country check). The other 4 components:
  engagement quality, momentum, reliability: are reused as-is from
  Grade (they don't change per brief); risk uses a live
  `checkBrandSafety()` Reddit check instead of Grade's authenticity-only
  proxy, worth the extra API call for a real spend decision on one
  creator, not worth it on every bulk Channel analysis pass. New
  budgetFit component: brief's stated per-video budget vs. the channel's
  estimated CPM cost at its typical view count. Full weights and
  reasoning documented in constants.gs (BRAND_FIT_WEIGHTS): this is
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

## Just shipped, round 11: extension Channel/Video split

Direct response to feedback that the extension's YouTube column editor
(and my own round-9 "Channels/Videos" pill fix) blended two sheets with
genuinely different headers into one label/one column list. Fixed at
the root instead of just re-wording:

- **Context menu, explicit not auto-detected**: "Send link to Koli
  (YouTube)" and "Send this page to Koli" (which auto-classified via
  `classifyUrl()`) are replaced with a **"Send to Worksheet"** submenu
  offering **Channel** / **Video** as an explicit user choice, for both
  a right-clicked link and the current page. `classifyUrl()` is kept,
  but demoted to a soft mismatch check: if what you clicked doesn't
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
  which switcher tab is active, instead of one blended label: this is
  what actually resolves the original complaint, not just different
  wording.
- **Sponsors as a 3rd send target: considered, not built.** Raised
  alongside this: once Sponsors (aggregate rollup) and Sponsor Mentions
  (per-mention detail log) are consolidated into one real schema, add
  "Send to Worksheet → Sponsor" the same way. Explicitly gated on that
  consolidation happening first: sending a bare brand-name link/
  selection has no real destination schema to land in yet, and building
  the send-target before the schema exists would just create another
  thing to migrate later. Not scheduled yet; a real Batch 2/3 candidate
  once Sponsors/Sponsor Mentions consolidation itself is scoped.

## Just shipped, round 12: Sponsors/Sponsor Mentions consolidation, humanized outreach drafts

- **Sponsor Mentions retired.** It and Sponsors were carrying almost the
  same information twice. Posted/Timestamp/Evidence now live directly
  on the Sponsors rollup (SPONSOR_HEADERS grew from 7 to 10 columns,
  pure append: existing sheets migrate automatically, no manual step).
  Each column reflects the LATEST mention for that (channel, brand)
  pair, same "current state" semantics Last Seen already had: full
  mention-by-mention history is no longer kept, a deliberate
  simplification. `logSponsorMentions_` and its gating Settings toggle
  are gone; SponsorBlock's free verified timestamp is now always
  attempted (used to require the toggle + LOG_SPONSOR_MENTIONS both on),
  the caption-fuzzy-match fallback still costs a real network call so
  it's still gated behind Attempt In-Video Timestamp alone.
  `normalizeExistingSponsors()` (Normalize Sponsor Names) updated to
  carry Posted/Timestamp/Evidence through a merge instead of silently
  clearing them: caught this before it shipped as a real regression the
  consolidation would have introduced.
- **Outreach drafts, humanized.** Full prompt rewrite in
  `draftOutreachEmailCopy_` (outreachDraftService.gs). Positioning was
  wrong before: it read as a brand cold-pitching a creator for a promo.
  Corrected to the actual relationship: an agency OFFERING a creator
  well-matched sponsor opportunities it will source and manage
  long-term, not asking the creator for anything. Explicit tone rules
  now in the prompt: lead with value not a request, name one real pain
  point (inconsistent sponsor income, generic ill-fitting deals, time
  spent chasing brands, negotiating without an agent) rather than
  generic flattery, no salesy/needy language (banned phrases listed
  explicitly: "would love to," "amazing opportunity," exclamation
  points), low-pressure closing question instead of a hard CTA. The
  video-detail personalization hook and 500-char hard limit are
  unchanged: only the actual copy the model is asked to write changed.

## Just shipped, round 13: drive.file rewrite, Brand View, publish-prep docs

- **Drive scope dropped from full `drive` to `drive.file`, for real this
  time.** The user can't afford CASA's ~$540+/year and wants to publish
  to both stores, so this was worth doing properly rather than paying
  for the broader scope. Root cause of the first attempt's failure:
  `DriveApp`'s own implementation forces full `drive` for most of its
  methods no matter what the manifest declares: narrowing the scope
  alone while still calling DriveApp was never going to work.
  `reportService.gs` rewritten to use the Advanced Drive Service
  (`Drive.*`, enabled in appsscript.json) exclusively: folder create/
  get, file reparenting (v3 has no "move," it's add-parent + remove-
  parent), and PDF export all go through `Drive.Files.*` now, never
  `DriveApp`. Genuinely unverified against a live response (still no
  Google account here): flagged plainly in the file's own top comment
  and in the checklist below. Test Export for real before relying on it.
- **Brand View** (`brandViewService.gs`): Koli > Export > Set Up Brand
  View. A single live `QUERY()` formula exposing only Channel/Niche/
  Subs/Avg Views/Posts-per-Month/Grade/Contact from Channels: the
  answer to "how do we present via a link without Sheets Canvas' paid
  tier": connect Looker Studio's Sheets connector to this tab, share
  the Looker Studio report's own link with a brand, and the brand never
  touches the real spreadsheet or sees Outreach status/internal Notes/
  IDs. Column letters resolve from Channels' actual header row rather
  than being hardcoded, so a future column reorder doesn't silently
  break it.
- **Terms of Service drafted** (send-to-koli-extension/TERMS_OF_SERVICE.md)
 : didn't exist at all before, and Workspace Marketplace's OAuth
  consent verification requires one. Same "draft, have counsel review"
  framing as the Privacy Policy. Filled in the Privacy Policy's
  remaining `[DATE]`/`[CONTACT EMAIL]` placeholders too.
- **What's still actually blocking either store**: hosting both legal
  docs at public URLs (a repo markdown file doesn't satisfy either
  store's requirement), and screenshots. Neither is an engineering
  problem at this point: see the Publishing checklist above.

## Just shipped, round 14: Assistant removed, Attention view added

Triggered by a straight product-strategy question: does the Assistant
tab actually earn its place? Truth-mode verdict: no. Every action it
could invoke already had a faster, more certain direct path (paste a
link, click a menu item); the "compound request" benefit was
theoretical (it dispatches one function call per message, never
chains); and its function-calling response shape had sat unverified
against a live response since the day it shipped. It also cut against
the actual goal (get work done, make people want to come back) by
inviting open-ended chat next to what's otherwise a tight task loop.

- **Removed entirely**: `assistantService.gs` deleted, `geminiCallWithTools_`
  (geminiService.gs, only ever used by the Assistant) removed, the
  Web App's `case 'assistant'` action (inboxService.gs) removed,
  Sidebar.html's Search/Assistant mode toggle collapsed away (there's
  only one mode now, so the toggle itself is gone, not just hidden),
  the "Read aloud" input-option removed (it only ever read Assistant's
  own result panel). Voice note/Text/Attachment stay: those aren't
  Assistant-specific.
- **Attention view added** (`attentionService.gs`, Koli menu > ⚡
  Attention, first item in the menu on purpose). Direct answer to "what
  needs refinement" for the stated goal: the core loop was pull-only:
  Koli only does something for you when you remember to open it and
  paste a link. Attention surfaces 3 things every time you open it, all
  pure lookups over data already collected (no new API/Gemini cost,
  same rule Gap Analysis already follows):
  1. Stale Outreach follow-ups (Contacted/Negotiating with no Last
     Contact update in 14+ days, or never set): the Outreach column
     was otherwise write-only, nothing ever looked back at it.
  2. Recent sponsor activity (Sponsors rows whose Last Seen landed in
     the last 7 days): a real change surfaces instead of sitting
     quietly in a rollup nobody reopens.
  3. High-grade channels (A/B) with zero recorded sponsor history:
     a cheap proxy for "promising and worth pursuing," not a full Gap
     Analysis run against every channel.
  Both day-count thresholds are top-of-file constants, tune freely.
- **Not done this round, still on the list**: multi-creator comparison
  doc, a weekly digest email (Attention is the pull version of this;
  the push/email version is real but separate work: needs a
  time-based trigger + MailApp, neither touched yet), a first-run
  setup nudge when API keys are missing.
- 6 new logic tests (findStaleOutreach_, findUnclaimedHighGrade_), 39/39 passing.

## Just shipped, round 15: Profile View, premium-tier gate, business strategy pass

Triggered by a real business-strategy conversation (who's this for, is
there a market, can it make money, is this YC-shaped, how does it
survive if Google moves against it). Grounded in actual research, not
just internal reasoning: see below.

- **Profile View** (brandViewService.gs, Koli > Export > Send Selected
  Profile Rows to Profile View). Same purpose as Brand View: a
  brand-safe Looker Studio source: but a script-triggered snapshot of
  whatever Profile rows are currently selected, not a live formula:
  Sheets has no concept of "current selection" a QUERY() can reference,
  so "these specific rows" has to be captured on demand. Re-run it any
  time the selection should change. Excludes Status/Video ID/Channel ID
  (internal row-matching plumbing), keeps everything else.
- **Premium-tier access-code gate** (licenseService.gs). First real
  monetization mechanism, and stated honestly for what it is: a local
  code-vs-hash check, not real DRM: Koli has no backend yet to verify a
  code server-side, so a technical user could read their own copy's
  source and bypass it. Codes are stored as SHA-256 hashes so the file
  itself doesn't leak a working code. Gates: Gap Analysis, Brand Fit
  Score, Draft Outreach Email, every Export (Creator One-Pager, Draft
  Deal Memo, Performance Report), Campaigns, Brand View, and Profile
  View. Stays free: Channel/Video/Profile analysis, Discover, Sponsors,
  Attention, Brand Targets: the core loop and the retention hook.
  Gated menu items stay **visible**, not hidden: an invisible premium
  feature can't make anyone want to upgrade. Deliberately **one codebase
  with a gate, not two forked templates**: a free/paid fork would mean
  applying every future bug fix twice, forever, for no real benefit over
  a single codebase that just checks a flag.
- **Competitive research, done for real** (web search, not assumed):
  **TalentSheets is the one direct architectural peer**: also Google
  Sheets-native, also a Chrome extension for capture, $39-249/mo tiered
  by creator-volume caps, multi-platform (YouTube+Instagram+TikTok vs.
  Koli's YouTube-only), does contracts/UTM/shipment-tracking Koli
  doesn't. No evidence anywhere in its own marketing of AI scoring,
  sponsor-history detection, or gap analysis: that's the real,
  confirmed gap Koli's Gap Analysis + Brand Fit Score fill. Wider
  landscape (Grin, CreatorIQ, Aspire, Modash, HypeAuditor, Upfluence,
  Captiv8, InfluData, The Cirqle) is exclusively $10K-200K+/year
  enterprise SaaS, none of it spreadsheet-native: confirms Koli/
  TalentSheets share a real, distinct, underserved niche rather than
  competing head-on with the funded players. One concrete finding worth
  keeping visible: **Captiv8 sells "competitor intelligence: identify
  influencers working with competitors" at $25,000+/year**: that's
  functionally the same idea as Gap Analysis, which Koli does for free.
- **Proposed (not built): a lightweight Koli API gateway.** The single
  highest-leverage next architecture decision, because it's the answer
  to four separate questions at once (BYOK friction, real monetization,
  real license enforcement, and a natural collection point for the
  opt-in sponsor-intelligence data below) instead of four separate
  fixes. Concept: a small serverless proxy (Cloudflare Worker or
  similar) holding Koli's own YouTube/Gemini keys; each install
  authenticates with a token instead of pasting API keys; Koli meters
  usage and charges a markup over API cost. This does NOT require
  abandoning the Sheets-native architecture: Apps Script's
  `UrlFetchApp` calls the proxy instead of Google's APIs directly, same
  shape as today's calls, different destination. Real engineering work,
  not started: a deliberate proposal for the next phase, not a
  quick add.
- **Opt-in sponsor market-intelligence data gathering: added to the
  roadmap, not built.** The idea: with explicit per-user consent,
  aggregate anonymized sponsor-detection data (brand, niche, rough
  channel-size tier: NOT contact info, NOT anything channel-identifying
  beyond what's already public) across every opted-in Koli install into
  a shared dataset, so "which brands are actively sponsoring in niche X
  right now" gets more accurate as more people opt in. This is the
  closest thing to a real, defensible moat anything in this project has
  (genuinely hard to replicate without the install base), but it's
  real infrastructure (needs the API gateway above, or an equivalent
  central store, since today's architecture has zero cross-install
  communication) and real consent/privacy design, not a menu item.
  Open questions before this gets built: exact data fields (favor
  collecting less, not more), granularity (does channel-size need to be
  exact or bucketed: bucketed is safer and likely just as useful),
  where consent lives (a Settings toggle, opt-out by default), how
  results get surfaced back to contributors (the actual value exchange
 : "you contribute anonymized signal, you get back aggregate market
  intelligence no single install could see alone"), and retention/
  deletion policy. Don't build this from a guess: it needs its own
  design pass when the API gateway groundwork exists.
- **Standalone-web-app path, if ever pursued**: [Univer](https://github.com/dream-num/univer)
  (Apache-2.0, browser-native spreadsheet engine: the same one
  [GenOffice](https://github.com/shnoh-cs/genoffice-byok) builds its
  desktop office suite on top of) is a legitimate foundation if "still
  feels like a spreadsheet" matters to the brand promise. A plainer
  React-dashboard rebuild (no spreadsheet metaphor at all) is the lower-
  risk default otherwise: most of Koli's actual logic
  (channelMetricsService.gs, brandIntelligenceService.gs, cpmService.gs,
  the scoring/gating logic) is already close to plain, portable JS with
  a relatively thin SpreadsheetApp/DriveApp-specific layer around it, so
  either path reuses more of the existing codebase than starting over
  would suggest. Not started, not scoped in detail: a real pivot
  decision, not a sprint.
- 5 new logic tests (hashAccessCode_, hasPremiumAccess_), 44/44 passing.
- **Template Sheet live**: clasp wired up (`.clasp.json`/`.claspignore`
  committed), pushed to a real deployed Sheet+script for the first time.
  `clasp push` from this repo now updates that Sheet directly: no more
  manual 25-file copy-paste for this instance. Distribute via that
  Sheet's `/copy` URL, per round 13.

## Just shipped, round 17: extension side panel, connection codes, trust pass

- **Connection code** (uiHandlers.gs's `generateConnectionCode`,
  SettingsDialog.html). One base64-encoded paste (Web App URL + shared
  secret, built server-side via `ScriptApp.getService().getUrl()`)
  replaces copying two separate values by hand into the extension.
- **Extension rebuilt as a Chrome side panel** (sidepanel.html/.js,
  replacing popup.html/.js). Persistent instead of closing on every
  focus change; unifies Channel/Video/Profile/Discover in one place: a
  Home tab shows the current page with a one-click send plus free-tier
  Profile and Discover mini-forms (reusing the Web App's existing
  `profile`/`discover` actions), and the column editor is a 4-way
  switcher. Styled on Koli's own tokens, explicitly not the violet
  "AI SDR" reference the panel layout was modeled on. A `.preview/`
  dev harness (gitignored: chrome-shim.js + a zero-dep static server)
  was built alongside it, since a side panel needs real `chrome.*` APIs
  to do anything and can't be exercised from a plain `file://` open.
- **Trust pass**: a "Send to Koli" brand chip on the Home tab doubles as
  a lock-status indicator; a plain-language Privacy note in Settings
  (talks only to your own Web App URL, no telemetry, storage stays in
  `chrome.storage`); an MIT `LICENSE` staged in the extension folder
  ahead of actually publishing the source publicly: see the
  extension's README "Trust & transparency" section for the full
  commitment, including what the eventual real-sign-in flow will
  disclose before requesting any permission.
- **JetBrains Mono** added alongside Inter, reserved for genuinely
  code-like content (the connection code field, the brand chip) rather
  than applied everywhere: a deliberate accent, not a full swap.
- Fixed a real bug found via the new `.preview/` harness: Profile/
  Discover result cards set an inline `style.display:none` on reset that
  outranked the `.err`/`.ok` class's `display:block`, so the result
  never actually became visible even though the DOM update happened.

**Still open from this round**: `clasp push` hasn't happened yet, so
none of the connection-code/profile/discover backend changes are live
on the real template Sheet: needs a push plus a new Web App deployment
version to take effect. Real Google Sign-In (`chrome.identity`,
replacing the shared secret) is still the deferred long-term item; the
extension isn't actually open-sourced yet either, just staged for it.

## Affiliate program: decided to hold off, reference model recorded

Asked directly whether Koli should have an affiliate program, modeled on
TalentSheets' own (talentsheets.com/affiliates). Decided to hold off
entirely, for the same reason payment collection itself was held off:
an affiliate program tracks commission against real revenue, and there
is none to track yet. Building the tracking scaffolding now would be a
shell with nothing real to attach to.

**Reference model, recorded for when payments exist**: 20% of net
revenue per referred customer, paid monthly, for a full year following
the initial purchase: no cap on referral volume, no tier to unlock. A
90-day click-attribution window. $50 minimum payout, monthly via Stripe
or PayPal. Partners get both a link and a standalone discount code (the
code works at checkout even without a link click). ~2-minute application,
most approved within a business day. Referred customers get 20% off
their first 3 months. Partners must disclose with "#ad."

## Payment collection: decided, not yet built (round 17 follow-up)

Asked directly: does Koli need a way to actually collect payment for
premium? Yes: checked licenseService.gs and found the honest answer is
that today's mechanism **can't work post-launch at all**, not just
"isn't wired up yet." `PREMIUM_ACCESS_CODE_HASHES` is a hardcoded array
in the template; since Koli is distributed by "Make a copy," every
customer's Sheet becomes a fully independent script at copy time:
nothing pushed to this master template afterward reaches copies already
out in the wild, so there's no way to grant a new paying customer access
without them hand-editing their own copy's code.

**Decided**: hold off on wiring up an actual provider for now. **When
it is built**, pricing is a **recurring subscription**, not one-time:
noted here so the eventual design doesn't get built the wrong shape.
Planned architecture (written up in licenseService.gs's header so it
doesn't need re-deriving): swap the local array check for a runtime
`UrlFetchApp` call to a small Koli-controlled verification endpoint (no
new OAuth scope: `script.external_request` is already granted), fed by
Gumroad or Lemon Squeezy's built-in license-key API rather than a
hand-rolled Stripe webhook: recommended specifically because it needs
no custom backend beyond what Koli already has. A subscription model
means that check has to re-verify periodically (short cache TTL), not
cache forever like a one-time-purchase model could.

**In the meantime**: updated the Settings dialog's access-code field and
`showUpgradeAlert_()`'s copy to say plainly "not for sale yet": the UI
previously implied a code could be obtained somewhere, which wasn't
true and would have dead-ended anyone who tried.

**Trust note for whenever this is built**: a live license check is a
real, deliberate exception to the extension's "no outbound calls except
your own Web App URL" claim (see its README's "Trust & transparency"
section): update that section alongside the actual implementation, not
after.

## Vision backlog: from the founder, round 16

Captured in one pass, deliberately not built yet: recorded now so
nothing gets lost, not because any of it is scoped or prioritized. Three
different tiers of ambition here, worth keeping visually distinct so a
future look at this doesn't confuse "quick add" with "second company."

**Real, near-term feature gaps in Koli-as-it-exists:**
- **Region filtering on Profile/audience data**: let the user pick a
  region or combination (US/UK/CAN/AUS named specifically, but should be
  any combination, not a fixed 4-country checkbox) to focus audience
  estimates against. Concrete, scoped, a real gap: Gemini's audience
  inference currently has no region-relevance concept at all.
- **Campaign management depth**: current Campaigns is one Stage
  dropdown + free-text fields (campaignService.gs). Founder's read: not
  great, could be meaningfully better. No specific redesign scoped yet.
- **Real contract templates**: Draft Deal Memo today is one fixed
  placeholder-fill template. TalentSheets' "50+ contracts in a few
  clicks" (round 15's research) is the direct comparison point: a
  template library, not just the one draft, is a legitimate gap.
- **Brand-side adoption**: founder's own read: Koli doesn't yet have
  what it takes for a BRAND (not an agency) to choose it directly, but
  believes brand-side traction would strengthen the whole platform for
  agencies too. Positioning/trust question as much as a feature one:
  ties into "enterprise grade" below.
- **"Enterprise grade" as something discovered, not claimed**: explicit
  design directive: the product should never say it's enterprise-grade,
  the experience should make someone conclude it on their own partway
  through using it. A UX/copy/polish philosophy to hold future design
  work to, not a single feature.
- **UI/UX still limited**: founder's own assessment, general, not
  itemized beyond what's already tracked (setup friction, first-run
  nudge, multi-creator comparison from round 14).

**Real operational features missing: each roughly its own subsystem,
not a quick add, closer to "Phase 2 of the workflow layer" than a
feature request:**
- **Gifting**: tracking product sent to a creator as part of a deal.
- **Payments**: actually paying creators (or tracking that they've been
  paid) rather than just noting a rate in a memo.
- **Affiliate tracking**: UTM/promo-code-driven attribution back to a
  specific creator/deal.
- **UGC collection**: gathering and rights-managing creator-produced
  content for a brand's own reuse.
  These are the kind of features GRIN/CreatorIQ (round 15's competitive
  research) charge enterprise prices partly *for*. Real value, real
  scope: each deserves its own design pass, not a bullet-point build.

**The bigger platform bet: same shape as round 15's Univer/GenOffice
conversation, arrived at from a different direction, worth naming as
the same pattern rather than four separate ideas:**
- An **invisible AI agent** the user never directly converses with
  (contrast with the removed Assistant tab, which was the opposite: a
  visible, explicit chat surface): ambient, does things intuitively in
  the background instead.
- **[WebLLM](https://github.com/mlc-ai/web-llm)**: runs an LLM
  client-side in-browser via WebGPU, genuinely relevant to "local AI, no
  API key, no per-call cost": the same BYOK-adjacent idea from round
  15's Univer conversation, from the browser-native angle instead of the
  self-hosted-server angle.
- A **plugin/API warehouse**: a marketplace where a user searches for
  and connects free or paid third-party APIs, rather than Koli hand-
  wiring each integration itself.
- **Sheetgo**-style cross-spreadsheet workflow automation.
- **Activepieces**-style general automation/precision-orchestration
  sitting inside Koli.
  All four of these are pieces of the same underlying idea: Koli
  becomes a platform other capabilities plug into, not a fixed feature
  set. That's the same order of ambition as the Univer/agent-native-
  spreadsheet conversation two rounds back: a different company than
  "Koli, the creator-vetting tool," built with Koli as a flagship
  vertical on top of it. Worth pursuing on its own merits, but it
  deserves to be scoped and resourced as its own initiative when the
  time comes, not absorbed piecemeal into Koli's existing roadmap where
  it would compete for attention against much smaller, faster, real
  near-term wins.

## On Groq / Mistral / HF Serverless / Cloudflare Workers AI

- **Mistral**: adding as a Gemini fallback for rate-limit failures (Batch 3, next up)
- **Groq**: fast/cheap, but weaker structured-JSON reliability than
  Mistral/Gemini; earmarked for a narrow use (sentiment classification),
  not the main enrichment pipeline
- **Cloudflare Workers AI**: its embeddings are the useful part, tied to
  the Batch 4 semantic-matching feature; not useful before that exists
- **Hugging Face Serverless**: skipped for the core pipeline; cold
  starts and inconsistent free-tier reliability make it a poor fit for
  anything that needs to run reliably
