# Koli — Build Status

*Living document. Updated the same turn anything ships — this should never
be more than one session stale.*

## What Koli is, in one paragraph

Koli is a Google Sheets-native tool for running an influencer marketing
agency's creator discovery, vetting, and outreach — built on Apps Script,
free-tier YouTube Data API + Gemini, and a growing set of zero/near-zero-
cost integrations (SponsorBlock, Reddit). It covers the full loop: find
creators, vet them (niche fit, engagement authenticity, sponsor history,
brand safety), track outreach through a real pipeline, and export
pitch-ready documents — all without leaving the spreadsheet, plus a
browser extension and a natural-language command tab layered on top.

## Feature inventory

### Discovery & vetting
- **Channel analysis** — niche (5 keywords), posting cadence, contact
  email (with manual-override protection), subscriber count, CPM
  estimate (industry-benchmark range, not a real ad-market figure), About
  summary. Batched/parallelized YouTube fetch + one merged Gemini call
  per channel (down from up to 6 separate calls originally).
- **Video analysis** — views/likes/comments, comment authenticity score
  (1-10), engagement ratio, posting time, audience estimate (location/
  age/gender — Gemini inference, explicitly labeled as estimate), new-
  subscriber delta since last check.
- **Profile** — full per-video history for one channel over a date
  range, trackable going forward (Refresh Tracked Profiles pulls what's
  new since last run for every tracked channel in one click).
- **Discover** — finds up to 5 similar channels/videos from a seed link,
  margin-scored (not exact-match) against keywords/niche/engagement/
  posts-per-month/views filters. Auto-excludes anything marked Passed or
  Do Not Contact.
- **Brand safety check** — free Reddit signal (no API key) for
  controversy/reputational red flags, Gemini-classified.
- **Brand Fit Score** — scores one or more selected channels against a
  specific campaign brief (target niche, target audience, budget/video),
  distinct from Grade's channel-intrinsic score. 7 weighted components,
  live in a Brand Fit Scores sheet with full breakdown per row.

### Sponsor intelligence
- **SponsorBlock integration** — checks the free, crowdsourced, human-
  verified sponsor-segment database first; falls back to Gemini's text-
  based guess only when there's no coverage. Catches the case Gemini
  alone would miss: a confirmed segment with no brand name in the
  description logs as "Unknown (SponsorBlock-confirmed)" instead of
  vanishing.
- **Sponsors tab** — aggregate rollup, always on, per (channel, brand)
  pair, including the latest mention's Posted date, timestamp (verified
  via SponsorBlock when available, best-effort caption-text-match
  otherwise), and evidence text. Sponsor Mentions, the old separate
  per-mention log, is retired — full mention-by-mention history isn't
  kept anymore, only the latest per (channel, brand).

### Outreach
- **Outreach pipeline** — native dropdown status column on Channels
  (Not Contacted → Contacted → Replied → Negotiating → Closed-Won/Lost →
  Passed → Do Not Contact), plus Last Contact and Notes, all manual and
  never touched by automated runs.
- **Creator One-Pager export** — pitch-ready PDF + editable Doc,
  deliberately excludes internal-only fields (Outreach status, Notes).
- **Draft Deal Memo export** — merge-field contract starting point,
  clearly labeled DRAFT / NOT LEGAL ADVICE (not claiming "lawyer
  drafted" the way some competitors do).
- **"Send to Koli" browser extension** — right-click a link/page →
  "Send to Worksheet → Channel" or "→ Video" (explicit, not guessed —
  Channels and Videos are different sheets with different columns), full
  analysis runs inline. A plain selection/page-with-no-choice sends as a
  note to the Prospects tab instead. Separate codebase
  (`send-to-koli-extension/`), talks to an Apps Script Web App
  deployment via a shared secret. Process Prospects turns any
  still-queued note captures into real analysis on demand.
- **Outreach draft generator** — one Channels row -> a short, personalized
  cold-outreach email, hooked on a specific detail mined from the
  creator's last 3 videos (auto-caption transcript, sampled across the
  whole video, falls back to the description when no captions exist).
  Business-oriented tone, body hard-capped at 500 characters (prompt +
  deterministic backstop). Lands in an editable **Outreach Drafts**
  sheet, not a locked export — Chars column is a live formula so it
  keeps tracking the limit as you hand-edit the draft.

### Cross-cutting
- **Assistant tab** — plain-English command box, Gemini function-calling
  restricted to a small fixed set of Koli's own vetted actions (analyze
  channel/video, discover similar, export one-pager, check brand
  safety). Not a general agent — can't execute anything outside that list.
- **Run Diagnostics** — one-click check of YouTube key, Gemini key, and
  Drive/Docs permission.
- **Dashboard** — KPI cells (channels/videos tracked, avg engagement,
  avg authenticity), room for your own charts.

## Architecture snapshot

- **Platform**: Google Apps Script, container-bound to the spreadsheet.
  No external server for the core tool — the browser extension is the
  first piece that needs a Web App deployment.
- **External APIs used**: YouTube Data API v3, Gemini API, SponsorBlock
  (public, unofficial-for-our-use), Reddit (old.reddit.com RSS, unofficial).
- **Data model**: 8 visible sheet tabs + 2 hidden control sheets, see
  README.md for the full table. Channel/Video IDs are hidden columns
  used as row keys; names render as `=HYPERLINK` formulas.
- **Speed**: batch-fetch (parallel `UrlFetchApp.fetchAll`) for Channel/
  Video analysis, 6-hour response cache, merged Gemini calls (1 per item
  instead of 3-6).
- **File manifest**: 17 `.gs`/`.html`/`.json` files in the Apps Script
  project, 5 files in the browser extension. Full list and what each
  does is in README.md's file table.

## What's verified vs. what isn't

Being straight about this since a lot of this shipped without a live
test loop — I don't have a Google account to run Apps Script in.

**Fixed after real bugs you hit**: sidebar template rendering order,
stale Gemini model name, Dashboard `#REF!` errors, `DocumentApp.Table`
API (`getRows()` doesn't exist, fixed to `getNumRows()`/`getRow(i)`),
sponsor-row off-by-one indexing.

**Built against documented APIs, not yet live-confirmed**: Gemini's
function-calling response shape (Assistant tab), SponsorBlock's exact
JSON field names, the Web App `doPost`/`doGet` deployment flow end to
end, the browser extension's full context-menu → POST → Inbox loop, and
the outreach draft generator end to end (caption sampling, the Gemini
prompt's actual output shape, the 500-char enforcement against a real
response), and Brand Fit Score end to end (the brief-fit Gemini prompt's
actual output shape, and whether the 7-component composite feels right
against real channels/briefs — the math itself is unit-tested, the
judgment calls behind the weights aren't). Also now: the `drive.file` +
Advanced Drive Service rewrite in reportService.gs — this is the exact
class of change that broke Export once before (see ROADMAP.md round
13), so treat Creator One-Pager/Deal Memo/Performance Report as
unverified until you've run each one for real. None of these are guesses — they're built to documented
behavior — but "documented" and "tested against a live response" aren't
the same thing, and I want that distinction visible rather than implied
away.

**What automated tests do and don't cover**: `tests/run-logic-tests.js`
(Node, `node tests/run-logic-tests.js`) covers every pure/deterministic
function in Koli — the parts with no SpreadsheetApp, UrlFetchApp, or API
key involved. It does not and cannot touch anything that needs a live
Sheet, a live YouTube/Gemini call, or a real browser extension install —
that gap is real and is exactly the "not yet live-confirmed" list above,
not something the test suite closes.

## Recent changelog

- Drive OAuth scope dropped from full `drive` to `drive.file` (via the
  Advanced Drive Service, reportService.gs rewritten to stop calling
  DriveApp entirely) — this was the actual CASA-cost blocker for
  Workspace Marketplace publishing, resolved without paying for CASA.
  **Not live-tested** (see "what's verified" below) — test Export for
  real before trusting it, same caveat as everything else built without
  a Google account available. Added Brand View (Koli > Export > Set Up
  Brand View) — a live Looker Studio-ready sheet, brand-safe columns
  only. Drafted the missing Terms of Service and filled in the Privacy
  Policy's placeholders — both needed for either store's publishing
  checklist.
- Sponsor Mentions retired — Posted/Timestamp/Evidence merged into the
  Sponsors rollup (always-on, latest-mention semantics). Outreach draft
  generator's prompt rewritten for tone: was reading as a brand
  cold-pitching a creator, corrected to an agency offering well-matched,
  long-term sponsor opportunities — leads with the creator's pain point,
  not a request.
- "Send to Koli" extension: Channel vs. Video is now an explicit
  right-click menu choice ("Send to Worksheet → Channel/Video"), not
  auto-detected from the URL — and the popup's column editor has a real
  Channels/Videos switcher (separate column lists, separate Apply
  action) instead of one blended list. Fixes the root cause the round-9
  "Channels/Videos" pill label was only papering over.
- Brand Fit Score (channel-vs-campaign-brief, 7 components — see
  constants.gs's BRAND_FIT_WEIGHTS for full reasoning) + a visual
  redesign of both the extension popup and the Sidebar (dark mode,
  shared SVG icon system, refined motion/shadows)
- Outreach draft generator (last-3-videos hook, 500-char cap, editable
  Outreach Drafts sheet) + fixed "Send to Koli" extension mislabeling its
  destination as "Prospects" on the YouTube tab (it's Channels/Videos)
- First automated test coverage (`tests/run-logic-tests.js`, pure-logic
  only) — caught and fixed two real bugs same session: a null
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
extension verdict) lives in ROADMAP.md — this doc is the "what exists,"
that one's the "what's next and why."

## What's next

See ROADMAP.md for the batch structure. Immediate candidate on the
table: the **Gap Analysis Engine** (find brands sponsoring 2+ other
channels in a niche who've never sponsored a specific one) — pure SQL/
data-query logic over data Koli already has, no new legal or
infrastructure exposure.
