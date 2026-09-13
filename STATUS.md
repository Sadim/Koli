# Koli: Build Status

*Living document. Updated the same turn anything ships: this should never
be more than one session stale.*

## What Koli is, in one paragraph

Koli is a Google Sheets-native tool for running an influencer marketing
agency's creator discovery, vetting, and outreach: built on Apps Script,
free-tier YouTube Data API + Gemini, and a growing set of zero/near-zero-
cost integrations (SponsorBlock, Reddit). It covers the full loop: find
creators, vet them (niche fit, engagement authenticity, sponsor history,
brand safety), track outreach through a real pipeline, and export
pitch-ready documents: all without leaving the spreadsheet, plus a
browser extension and a natural-language command tab layered on top.

## Feature inventory

### Discovery & vetting
- **Channel analysis**: niche (5 keywords), posting cadence, contact
  email (with manual-override protection), subscriber count, CPM
  estimate (industry-benchmark range, not a real ad-market figure), About
  summary. Batched/parallelized YouTube fetch + one merged Gemini call
  per channel (down from up to 6 separate calls originally).
- **Video analysis**: views/likes/comments, comment authenticity score
  (1-10), engagement ratio, posting time, audience estimate (location/
  age/gender: Gemini inference, explicitly labeled as estimate), new-
  subscriber delta since last check.
- **Profile**: full per-video history for one channel over a date
  range, trackable going forward (Refresh Tracked Profiles pulls what's
  new since last run for every tracked channel in one click).
- **Discover**: finds up to 5 similar channels/videos from a seed link,
  margin-scored (not exact-match) against keywords/niche/engagement/
  posts-per-month/views filters. Auto-excludes anything marked Passed or
  Do Not Contact.
- **Brand safety check**: free Reddit signal (no API key) for
  controversy/reputational red flags, Gemini-classified.
- **Brand Fit Score**: scores one or more selected channels against a
  specific campaign brief (target niche, target audience, budget/video),
  distinct from Grade's channel-intrinsic score. 7 weighted components,
  live in a Brand Fit Scores sheet with full breakdown per row.

### Sponsor intelligence
- **SponsorBlock integration**: checks the free, crowdsourced, human-
  verified sponsor-segment database first; falls back to Gemini's text-
  based guess only when there's no coverage. Catches the case Gemini
  alone would miss: a confirmed segment with no brand name in the
  description logs as "Unknown (SponsorBlock-confirmed)" instead of
  vanishing.
- **Sponsors tab**: aggregate rollup, always on, per (channel, brand)
  pair, including the latest mention's Posted date, timestamp (verified
  via SponsorBlock when available, best-effort caption-text-match
  otherwise), and evidence text. Sponsor Mentions, the old separate
  per-mention log, is retired: full mention-by-mention history isn't
  kept anymore, only the latest per (channel, brand).

### Outreach
- **Outreach pipeline**: native dropdown status column on Channels
  (Not Contacted → Contacted → Replied → Negotiating → Closed-Won/Lost →
  Passed → Do Not Contact), plus Last Contact and Notes, all manual and
  never touched by automated runs.
- **Creator One-Pager export**: pitch-ready PDF + editable Doc,
  deliberately excludes internal-only fields (Outreach status, Notes).
- **Draft Deal Memo export**: merge-field contract starting point,
  clearly labeled DRAFT / NOT LEGAL ADVICE (not claiming "lawyer
  drafted" the way some competitors do).
- **"Send to Koli" browser extension**: right-click a link/page →
  "Send to Worksheet → Channel" or "→ Video" (explicit, not guessed:
  Channels and Videos are different sheets with different columns), full
  analysis runs inline. A plain selection/page-with-no-choice sends as a
  note to the Prospects tab instead. Separate codebase
  (`send-to-koli-extension/`), talks to an Apps Script Web App
  deployment via a shared secret. Process Prospects turns any
  still-queued note captures into real analysis on demand.
- **Outreach draft generator**: one Channels row -> a short, personalized
  cold-outreach email, hooked on a specific detail mined from the
  creator's last 3 videos (auto-caption transcript, sampled across the
  whole video, falls back to the description when no captions exist).
  Business-oriented tone, body hard-capped at 500 characters (prompt +
  deterministic backstop). Lands in an editable **Outreach Drafts**
  sheet, not a locked export: Chars column is a live formula so it
  keeps tracking the limit as you hand-edit the draft.

### Cross-cutting
- **Attention**: the menu's first item, on purpose. Stale Outreach
  follow-ups, recent sponsor activity, and high-grade channels with no
  sponsor history yet: rebuilt fresh every open, zero new API cost.
- **Run Diagnostics**: one-click check (Koli menu, near the bottom) of
  YouTube key, Gemini key, Drive/Docs permission, **which account is
  actually running the script**, and a **full protection scan** across
  every sheet (flags any range the current user can't edit) -- added
  after a permission-error mystery that took several rounds to root-cause
  (see "getActiveRangeList()" below).
- **Dashboard**: KPI cells (channels/videos tracked, avg engagement,
  avg authenticity), room for your own charts.

### Added this session (2026-09-13), not yet folded into the sections above
- **Airtable/Teable-grade record system** (`recordService.gs`, `RecordModal.html`,
  `RecordModalDialog.html`, new): one schema-driven expanded-record modal
  (`CHANNEL_FIELD_SCHEMA`/`CAMPAIGN_FIELD_SCHEMA` in constants.gs) reused by
  three surfaces instead of three bespoke UIs -- the Sidebar's new Expand
  button, a click on an Outreach Kanban card, and a click on the new
  Campaigns Kanban card. Type-aware field rendering (enum as a colored
  select-pill, date, longtext, currency, computed fields visibly locked),
  autosave per field with optimistic update + revert-on-error. Sidebar's
  channel-card also gained inline quick-edits directly (no modal needed) for
  the three fields that had **no edit UI anywhere before this**: Outreach
  (was a dead `<span>`, now a real inline single-select), Last Contact (new
  date chip), and Notes (new textarea with Copy/Insert-timestamp/Clear/
  Expand-to-full-editor quick actions).
- **Campaigns Kanban** (`CampaignsKanban.html`, new; `campaignService.gs`,
  extended): full drag-and-drop board across `CAMPAIGN_STAGES`, at parity
  with the existing Outreach board -- Campaigns previously had no board at
  all, just a plain sheet with a Stage dropdown. Needed a real per-row key
  first (`Campaign ID`, new, backfilled for existing rows) since Channel ID
  alone repeats across multiple deals with the same channel.
- **Documents field** (`documentService.gs`, new), on both Channels and
  Campaigns records: upload-and-OCR (same Gemini Vision mechanism as the
  existing Brand Kit feature, generalized rather than modified) plus linking
  an already-existing Drive file via the Google Picker, without duplicating
  it into Koli's own Drive folder. Picker needs one manual step (enabling
  the Picker API + a browser key in Cloud Console, pasted into Settings) --
  no OAuth scope change either way, since Picker grants per-file access
  under the `drive.file` scope already declared. Attachments are stored as a
  structured list in the cell's Developer Metadata (what the modal actually
  renders from) plus a human-readable log in the cell's Note (same
  convention Brand Kit already uses).

### Added 2026-09-12/13, not yet folded into the sections above
- **Brand Discovery** (`Brand Intelligence > Discovery > Discover New
  Brands`): searches YouTube directly for a niche/keyword (no seed
  channel needed), scans candidate videos' descriptions for sponsor
  mentions in one merged Gemini call, surfaces only brands **not already**
  in Sponsors or Brand Targets -- the actual missing half of the
  acquisition pipeline (Gap Analysis, built earlier, only finds brands
  already sponsoring a tracked channel).
- **About-page contact/social discovery** (`findContact` in
  contactService.gs, feeds the existing Contact-column note): fetches a
  channel's public About page directly and parses its Links section
  (Facebook/Instagram/business email/etc) -- a field the YouTube Data API
  never exposes at all, only the free-text description. Real bug fixed
  here: Apps Script's default request looked bot-like to YouTube, which
  redirected to the mobile site (a completely different, hex-escaped data
  format); fixed with an explicit desktop User-Agent header.
- **Brand Kit upload** (`Brand Intelligence > Research > Attach Brand
  Kit`): upload a PDF/image brand kit, Gemini's vision input (new
  `callGeminiVisionJson_` in geminiService.gs -- Koli's first multimodal
  call) extracts brand name/website/niche/decision-makers/contact,
  appends to the row's note. File saved to a "Koli Brand Kits" Drive
  folder. No Picker API needed: the file goes straight from browser to
  script as base64, never touching Drive for the read.
- **Guess Contact Email** (`Brand Intelligence > Research > Guess Contact
  Email`): free pattern-based email guesser (name + domain ->
  first.last@, flast@, etc, same technique as MailFinder/Mail-Hunter) plus
  a **DNS-level domain health check** (MX/SPF/DMARC via Google's public
  DNS-over-HTTPS, github.com/omm9846/verdict-inspired) before the guess is
  shown. Explicitly labeled "pattern-guessed, not verified": Apps Script
  has no raw-socket API, so real SMTP-level verification (what
  Apollo/Hunter/Derrick actually do) isn't possible here. A paid tier via
  Apollo (Koli-fronted, not BYOK) is the planned upgrade path once Apollo
  is connected.
- **Email open tracking** (wired into `Send Approved Drafts`): a
  Magio-inspired invisible tracking pixel, served through the same Web
  App's `doGet` (`?track=<token>`). Opened/Open Count columns update live
  on the Outreach Drafts row. Real Apps Script constraint worked around:
  `ContentService` is text-only, so returning a real GIF needs the
  ISO-8859-1 byte round-trip trick. Known limitation stated plainly: most
  email clients block remote images by default, so this undercounts.
- **Publish as Page** (`Export > Views & Pages > Publish Selected
  Channels as Page`): Koli's own answer to Sheets Canvas's "share a
  mini-app without exposing the sheet" gap (Canvas has no such sharing
  mode and no Apps Script API at all). Renders selected Channels rows into
  a static, brand-safe HTML snapshot at publish time, saves it as a
  script-owned Drive file, serves it through `doGet` (`?p=<token>`) --
  brand never touches the real spreadsheet. **Now interactive**: an "I'm
  Interested" button per card logs to a new visible **Brand Interest**
  sheet, authenticated by the publish token itself (never the shared
  secret, which a brand viewer should never have). `?debug=1` on a page
  link surfaces the real failure reason if a link stops working, instead
  of the generic visitor-facing message.
- **Outreach Pipeline Kanban** (`Koli menu > Outreach Pipeline (Kanban)`):
  the non-Sheets-Canvas-Pro alternative -- real drag-and-drop across all 8
  Outreach statuses, writes back to the Channels sheet's Outreach column
  instantly, same behavior as the native Canvas Kanban (confirmed
  side-by-side by the user, who has Canvas access). Styled in a similar
  clean-card design language, not a literal visual copy of Google's own
  product chrome.
- **Engagement % display bug, fixed at the root**: Sheets was silently
  auto-converting a `"3.9%"`-shaped string into a fraction (0.039) with
  its own percent formatting on write -- every reader (Sidebar, reports,
  Publish-as-Page) showed the raw unformatted fraction. Fixed on both
  ends: writes now use a plain number + explicit format (matching how
  Video's own Eng % column always worked correctly), and reads
  disambiguate old vs. new rows by the cell's *actual number format*, not
  the value's magnitude.
- **Menu restructure**: Brand Intelligence and Export both grew past what
  fits on a normal screen with no way to scroll (Sheets' custom menus have
  no scrollbar and no API to add one) -- both are now nested sub-submenus
  instead of one flat list each.
- **Dark/light theme toggle**, Sidebar and extension both -- was
  system-only before, now has a manual override, persisted per-surface
  (localStorage for Sidebar, chrome.storage.sync for the extension).
- **Video "Pull Stats" in the extension**, at parity with the existing
  channel preview: same look-before-you-commit flow, redesigned card with
  Views/Engagement/Comments/Likes as the primary row.
- **A real, deliberate non-build**: an "Aura"-inspired autonomous
  browser-action executor (randomized human-like click/type timing
  labeled "Anti-Bot Safeguard," POSTing scraped page content to an
  unspecified cloud proxy) was proposed by the user and declined --
  assessed as detection-evasion tooling with no legitimate purpose for the
  timing, plus a direct contradiction of the extension's own privacy
  policy (third-party data transmission it explicitly promises never
  happens). Explained in full to the user rather than silently refused.

## Architecture snapshot

- **Platform**: Google Apps Script, container-bound to the spreadsheet.
  No external server for the core tool: the browser extension is the
  first piece that needs a Web App deployment.
- **External APIs used**: YouTube Data API v3, Gemini API (now including
  a multimodal/vision call, see Brand Kit above), SponsorBlock (public,
  unofficial-for-our-use), Reddit (old.reddit.com RSS, unofficial),
  YouTube's own public About page (fetched directly with a desktop
  User-Agent -- see the mobile-redirect fix above), Google's public
  DNS-over-HTTPS resolver (`dns.google/resolve`, free, keyless -- domain
  MX/SPF/DMARC checks for the contact-email guesser).
- **Data model**: grew this session -- 3 new hidden control sheets
  (`_PublishedPages`, `_EmailOpens`, plus the pre-existing pattern) and 1
  new **visible** sheet (`Brand Interest`, inbound signal worth actually
  seeing, not hidden plumbing), on top of the original 8 visible + 2
  hidden. README.md's file table is stale against all of this -- treat it
  as historical, not current, until refreshed.
- **Speed**: batch-fetch (parallel `UrlFetchApp.fetchAll`) for Channel/
  Video analysis, 6-hour response cache, merged Gemini calls (1 per item
  instead of 3-6).
- **File manifest**: grew substantially this session (7 new `.gs` files:
  addOnHomepage, brandDiscoveryService, brandKitService,
  contactFinderService, emailTrackingService, publishService,
  kanbanService; several new `.html` dialogs). README.md's count/table is
  stale -- don't trust the "17 files" figure, check the actual directory.

## What's verified vs. what isn't

Being straight about this since a lot of this shipped without a live
test loop: I don't have a Google account to run Apps Script in.

**Fixed after real bugs you hit**: sidebar template rendering order,
stale Gemini model name, Dashboard `#REF!` errors, `DocumentApp.Table`
API (`getRows()` doesn't exist, fixed to `getNumRows()`/`getRow(i)`),
sponsor-row off-by-one indexing.

**Built against documented APIs, not yet live-confirmed**: SponsorBlock's
exact JSON field names, the Web App `doPost`/`doGet` deployment flow end to
end, the browser extension's full context-menu → POST → Inbox loop, and
the outreach draft generator end to end (caption sampling, the Gemini
prompt's actual output shape, the 500-char enforcement against a real
response), and Brand Fit Score end to end (the brief-fit Gemini prompt's
actual output shape, and whether the 7-component composite feels right
against real channels/briefs: the math itself is unit-tested, the
judgment calls behind the weights aren't). Also now: the entire record
system/Campaigns Kanban/Documents feature added 2026-09-13 (Outreach pill
inline single-select, Notes/Last Contact quick-edits, the expanded-record
modal, drag-and-drop on the new Campaigns board, Documents upload+OCR, and
especially the Google Picker "Connect from Drive" flow -- Picker+Apps-Script
integration specifically, since it's the one piece of this batch resting on
a claimed-but-unverified-here Google integration pattern rather than a
already-proven Koli mechanism). Also now: the `drive.file` +
Advanced Drive Service rewrite in reportService.gs: this is the exact
class of change that broke Export once before (see ROADMAP.md round
13), so treat Creator One-Pager/Deal Memo/Performance Report as
unverified until you've run each one for real. None of these are guesses: they're built to documented
behavior: but "documented" and "tested against a live response" aren't
the same thing, and I want that distinction visible rather than implied
away.

**What automated tests do and don't cover**: `tests/run-logic-tests.js`
(Node, `node tests/run-logic-tests.js`) covers every pure/deterministic
function in Koli: the parts with no SpreadsheetApp, UrlFetchApp, or API
key involved. It does not and cannot touch anything that needs a live
Sheet, a live YouTube/Gemini call, or a real browser extension install:
that gap is real and is exactly the "not yet live-confirmed" list above,
not something the test suite closes.

## Recent changelog

- **2026-09-13: Sidebar selection-sync regression fixed (user-reported,
  confirmed by screenshot) + coverage extended to Campaigns and 5 more
  sheets.** The sidebar's reactive card was showing stale data on Channels
  and nothing at all on Videos, regardless of what was actually selected.
  Root cause: `getSelectedRowMarker()` (uiHandlers.gs) relied on an
  `onSelectionChange` **simple trigger** writing to a cache -- simple
  triggers can silently stop firing after enough live code pushes without
  the spreadsheet being reloaded, which a long single-session build (this
  one) does to it reliably. Fixed by removing the trigger+cache dependency
  entirely: the marker function now reads `SpreadsheetApp.getActiveRange()`
  live on every poll, so there's no staleness class left to hit. While
  fixing it: **Campaigns now has a real reactive card**
  (`getSelectedCampaignSummary`, reuses the existing Campaign record
  schema/Expand dialog), and Sponsors/Brand Fit Scores/Attention/Brand
  View/Outreach Drafts now show an honest "selected here, no card built
  for this tab yet" message in the sidebar instead of looking broken --
  full rich cards for those five sheets are real, separate, not-yet-built
  scope.
- **2026-09-13: Contact/About real bug fixed, video-description notes added,
  type-scale pass across Sidebar + extension.** Found while investigating
  a "social links still not showing" report: About summary + social links
  were landing on the **Channel** column's note, not Contact
  (`sheetWriter.gs`'s `writeChannelRow`) -- moved to Contact, where the
  existing code comment already said they belonged. Found a real bug in
  the same spot: the socials-note write unconditionally overwrote whatever
  `writeEmailPreservingManual_` had just written moments earlier (a
  legitimate "kept your entry, found a different address" warning),
  silently destroyed every run -- fixed with a new shared `appendNote_`
  helper so both writers merge onto the same cell instead of clobbering.
  Traced the social-link extraction's own data flow end to end
  (`findContact` → `bundle.contact` → `writeChannelRow`) and found it
  intact -- the more likely explanation for "not showing" is that **no
  surface built this session displayed cell Notes at all**: `RecordModal.html`
  now reads and shows any cell Note (collapsed "Note" disclosure per
  field) via `recordService.gs`'s `getRecordGeneric_`, so Contact's About/
  socials block (and Grade's confidence breakdown, etc.) is finally visible
  somewhere other than a raw-cell hover. If links are still genuinely
  missing after this, `contactService.gs`'s existing "Test About-Page
  Fetch" diagnostic is the tool to reach for -- I can't reproduce a live
  YouTube fetch from this environment to rule out a fetch-side bug myself.
  Separately: Videos' Views column now gets the video's own description +
  every URL found in it as a note (`extractAllUrls_`, new, generalizes
  `contactService.gs`'s social-domain matching to "any link at all").
  Also: raised every functional/interactive text size below 11px to the
  floor Impeccable holds the rest of this codebase to, across `Sidebar.html`
  and `send-to-koli-extension/sidepanel.html` (one deliberate exception
  left below it: the small circular brand-mark logo, a WCAG-exempt
  logotype, not content text). Cleaned up a dead duplicate `.cc-outreach-pill`
  CSS rule left over from an earlier edit this session. Low-contrast
  findings in the extension (pre-existing, unrelated to text size) were
  flagged but not touched -- a separate task if wanted.
- **2026-09-13: Dislikes estimate added** (`dislikeService.gs`, new) —
  YouTube removed public dislike counts from its own API in Dec 2021, no
  official source exists anymore. Wired the free, keyless "Return YouTube
  Dislike" community API in as a live, clearly-labeled *estimate* (never an
  official figure) in the Sidebar's video card and the "Send to Koli"
  extension's Pull Stats preview only -- deliberately **not** added to the
  Videos sheet (VIDEO_HEADERS unchanged): an extrapolated third-party
  number isn't something worth tracking a history of the way a real
  YouTube-reported stat is. Same "live check, fails soft, never blocks"
  pattern SponsorBlock detection already uses.
- **2026-09-13: `ux-designer-skill` installed** (project-scoped,
  `.claude/skills/ux-designer/`) — complements rather than duplicates
  Impeccable: this one is a prescriptive pattern/reference library (23
  anti-patterns, decision trees, domain-specific guidance for canvas/
  collaborative/AI interfaces) rather than a detector+critique workflow.
  Checked and installed directly: modest scale (60 stars), plausible
  growth, no credibility red flags.
- **2026-09-13: Bulk Template / Mail Merge shipped** (`BulkTemplateDialog.html`,
  new; `outreachDraftService.gs`, extended) — write one rich-text email/
  contract template with `{{Field}}` merge tokens (matched against the
  Channels sheet's real header row, never a hardcoded list), apply it once
  per selected creator, land each as its own row in the existing Outreach
  Drafts sheet -- same review-then-Send-Approved-Drafts flow as every other
  draft, no new send pipeline. Distinct from Draft Outreach Email (which has
  Gemini author a whole new email per channel from scratch, no template at
  all). An unrecognized `{{Field}}` is left literal and flagged after
  generating, never silently blanked. Toolbar: Bold/Italic/Underline/
  Strikethrough/bullet-and-number-as-text-prefix/links, plus an AI-assist
  button (Gemini) that drafts/rewrites surrounding prose while leaving
  `{{Field}}` tokens untouched. **Real bug fixed as part of this**: rich-text
  formatting applied in any draft dialog (this one, Draft Outreach Email,
  Reply Assistant) looked correct in the Sheet cell but was silently
  flattened to plain text at send time -- `sendApprovedOutreachDrafts` now
  builds the sent HTML body from the cell's actual `RichTextValue` runs
  (new `cellRichTextToHtml_`), so bold/italic/links now actually reach the
  delivered email, not just the sheet view. `applyRichTextToCell_` extended
  to carry strikethrough + per-run link URLs. New pure-logic tests for the
  merge-field substitution engine (`tests/run-logic-tests.js`).
- **2026-09-13: Impeccable design skill installed + a real bug it (indirectly)
  surfaced, fixed.** Installed `pbakaus/impeccable` (project-scoped, under
  `.claude/`) and ran its detector + a design-director-style review against
  the new pipeline UI. Most of the 50 detector flags were pre-existing (not
  from today), a false positive (a dark-mode color checked against a
  light-mode background that never actually co-renders), or an intentional
  reuse of the app's existing shadow tokens -- one real hit was
  `RecordModal.html`'s dialog shadow (thin border + 50px blur, the classic
  "AI-generated card" look), fixed. The design review then caught a real,
  confirmed data-integrity bug in the Sidebar's new quick-edit fields: the
  channel ID used at *save* time was read live, not captured at *edit-start*
  time, so typing a Note (or picking a date), then clicking a different
  Channels row before the field lost focus, could silently save that text
  onto the wrong channel's record. Fixed by having each field track its own
  "owner" channel ID, captured only when it's safe to refresh that field.
  Also unified Outreach-status coloring: Sidebar.html and RecordModal.html
  used to compute status colors two different ways (an exact map vs. a regex
  guess) that could drift apart -- now both read one shared
  `OUTREACH_TONES`/`CAMPAIGN_STAGE_TONES` map from constants.gs, and the
  Sidebar's outreach pill is now a native `<select>` (same widget the record
  modal already used) instead of a separate hand-built popup menu. Two
  low-contrast findings and the pervasive small-text sizing throughout
  Sidebar.html were left as-is (a decorative logo badge exempt under WCAG's
  logotype exception, and a much bigger whole-panel type-scale decision the
  user hasn't weighed in on) -- flagged to the user rather than silently
  fixed or silently ignored.
- **2026-09-13: Airtable/Teable-grade pipeline UI build-out** -- see "Added
  this session" above for the full breakdown. Pushed to Apps Script
  (`clasp push`, no redeploy needed: nothing here touches `doGet`/`doPost`).
  Not yet committed to git at time of writing.
- **2026-09-12: Brand Discovery shipped** (`brandDiscoveryService.gs`,
  new) — the actual missing half of the acquisition pipeline: until now a
  brand only entered Koli if you already knew its name or it happened to
  already sponsor a tracked channel (Gap Analysis, itself bounded to
  brands already in the Sponsors tab). Koli > Brand Intelligence >
  Discover New Brands searches YouTube directly for a niche/keyword (no
  seed channel required), scans the candidate videos' descriptions for
  sponsor mentions in one merged Gemini call, and surfaces only brands
  not already in Brand Targets or Sponsors — a genuine "what's new" feed,
  not a re-listing of what Gap Analysis already finds. Deliberately
  lighter than Discover/enrichVideo_: a dedicated snippet-only batch
  fetch (`getVideoSnippetsBatch_`) skips comments and statistics
  entirely, since this feature only ever reads title+description.
  Premium-gated, same tier as Gap Analysis/Brand Fit Score. Untested
  against a live account (no Google account in this environment) — the
  usual caveat, test it for real before trusting it.
- **2026-09-12: publishing prep for both stores, plus a batch of real bugs
  found via live testing.** Chrome Web Store: 5 current screenshots
  (replacing stale pre-rewrite ones), listing/privacy/terms text fixed up,
  both legal docs now hosted at live URLs, full upload zip assembled.
  Workspace Marketplace: `addOns` manifest block + a real (not stub)
  CardService homepage card (`addOnHomepage.gs`), Koli's own Privacy
  Policy/Terms (distinct from the extension's) hosted live, listing copy +
  icon + 2 screenshots. Still open either way: the demo video and $5 fee
  (account-holder only), and an explicit call on multi-client-installable
  vs. public Marketplace listing (see ROADMAP.md's publishing checklist).
  Real bugs found and fixed this round, now that live testing is
  happening: `getActiveRangeList()` throwing "You do not have permission"
  on a full-row selection (root cause of the Brand Fit Score/Shortlist
  Report failures — fixed with a fallback to `getActiveRange()`); three
  view-rebuild functions (`showAttentionView`, `showBrandView`,
  `sendProfileSelectionToView`) losing the default font/format on every
  `sheet.clear()` refresh; the About-page Links section (Facebook/
  Instagram/a real business email) now feeding `findContact` alongside
  the description-text parser, since the public YouTube API never
  exposed that field at all.
- **Premium-tier access-code gate live** (licenseService.gs): Gap
  Analysis, Brand Fit Score, Draft Outreach Email, every Export,
  Campaigns, Brand View, and the new **Profile View** (Koli > Export >
  Send Selected Profile Rows: same Looker Studio idea as Brand View,
  but a snapshot of your current Profile selection, not a live formula)
  now require a valid access code, set in Settings. Free tier stays:
  Channel/Video/Profile analysis, Discover, Sponsors, Attention, Brand
  Targets. Stated honestly: this is a local check, not real DRM: see
  ROADMAP.md round 15 for the real fix (an API gateway) and the
  business-strategy reasoning behind all of this.
- **Assistant tab removed entirely**: every action it could invoke
  already had a faster, more certain direct path, and it worked against
  the actual goal (a tight task loop, not an open-ended chat). Cut, not
  hidden: assistantService.gs deleted, geminiCallWithTools_ removed, the
  Web App's 'assistant' action removed, Sidebar's mode toggle collapsed
  (one mode now, not two), "Read aloud" input-option removed.
- **Attention view added** (Koli menu > ⚡ Attention, first item on
  purpose): the actual fix for "the core loop is pull-only." Surfaces
  stale Outreach follow-ups, recent sponsor activity, and high-grade
  unclaimed channels every time you open it. Zero new API/Gemini cost:
  pure lookups over data already collected.
- Drive OAuth scope dropped from full `drive` to `drive.file` (via the
  Advanced Drive Service, reportService.gs rewritten to stop calling
  DriveApp entirely): this was the actual CASA-cost blocker for
  Workspace Marketplace publishing, resolved without paying for CASA.
  **Not live-tested** (see "what's verified" below): test Export for
  real before trusting it, same caveat as everything else built without
  a Google account available. Added Brand View (Koli > Export > Set Up
  Brand View): a live Looker Studio-ready sheet, brand-safe columns
  only. Drafted the missing Terms of Service and filled in the Privacy
  Policy's placeholders: both needed for either store's publishing
  checklist.
- Sponsor Mentions retired: Posted/Timestamp/Evidence merged into the
  Sponsors rollup (always-on, latest-mention semantics). Outreach draft
  generator's prompt rewritten for tone: was reading as a brand
  cold-pitching a creator, corrected to an agency offering well-matched,
  long-term sponsor opportunities: leads with the creator's pain point,
  not a request.
- "Send to Koli" extension: Channel vs. Video is now an explicit
  right-click menu choice ("Send to Worksheet → Channel/Video"), not
  auto-detected from the URL: and the popup's column editor has a real
  Channels/Videos switcher (separate column lists, separate Apply
  action) instead of one blended list. Fixes the root cause the round-9
  "Channels/Videos" pill label was only papering over.
- Brand Fit Score (channel-vs-campaign-brief, 7 components: see
  constants.gs's BRAND_FIT_WEIGHTS for full reasoning) + a visual
  redesign of both the extension popup and the Sidebar (dark mode,
  shared SVG icon system, refined motion/shadows)
- Outreach draft generator (last-3-videos hook, 500-char cap, editable
  Outreach Drafts sheet) + fixed "Send to Koli" extension mislabeling its
  destination as "Prospects" on the YouTube tab (it's Channels/Videos)
- First automated test coverage (`tests/run-logic-tests.js`, pure-logic
  only): caught and fixed two real bugs same session: a null
  authenticity score silently becoming a real score of 1 instead of
  staying "no data," and brand-name casing normalization contradicting
  its own documented behavior on lowercase brand names
- Manual email entry (preserves edits across re-runs)
- Outreach pipeline + Do Not Contact exclusion in Discover
- Creator One-Pager export
- Menu renamed YouTube Analyzer → Koli
- SponsorBlock integration + Draft Deal Memo export
- "Send to Koli" browser extension + Inbox webhook
- Assistant tab (Gemini function-calling) + Run Diagnostics + Reddit
  brand-safety check

Full reasoning behind each decision (including the Grist/Teable license
finding, the Ollama/FreeToken architectural wall, and the Chrome
extension verdict) lives in ROADMAP.md: this doc is the "what exists,"
that one's the "what's next and why."

## What's next

See ROADMAP.md for the batch structure. Immediate candidate on the
table: the **Gap Analysis Engine** (find brands sponsoring 2+ other
channels in a niche who've never sponsored a specific one): pure SQL/
data-query logic over data Koli already has, no new legal or
infrastructure exposure.
