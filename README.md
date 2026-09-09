# Koli: YouTube Analyzer for Google Sheets

Internal tool for the maker/DIY influencer pipeline: paste channel or video
links, get enriched data written back to the sheet, track channel
performance over time, find similar channels/videos, and keep a running
Sponsors list for brand-to-creator matching.

## Setup (new project)

1. Open (or create) the target Google Sheet.
2. Extensions > Apps Script.
3. Delete the default `Code.gs`. In Project Settings, turn on "Show
   appsscript.json manifest file in editor," then paste `appsscript.json`'s
   content into that file.
4. Create each `.gs` file below (File > + > Script, name it exactly as
   listed, no `.gs` needed) and paste in its matching content.
5. Create the two HTML files (+ > HTML): `Sidebar` and `SettingsDialog`.
6. Save (Ctrl/Cmd+S), reload the Sheet. A **Koli** menu appears.
7. Koli > Settings (or the gear icon in the sidebar): add your
   YouTube Data API v3 key and Gemini API key.

## What's in each tab of the sidebar

- **Channel**: bulk channel metadata: niche, posting cadence, contact
  email, subscriber count, estimated CPM. Optionally scans each channel's
  5 most recent videos for sponsor mentions (toggle in Settings).
- **Video**: bulk video metadata: views/likes/comments, comment
  authenticity score, engagement ratio, posting time, audience estimates,
  new-subscriber delta since the last time that channel was checked.
- **Profile**: full per-video history for **one channel** over a date
  range you pick (native calendar pickers). Every field from Channel +
  Video combined, one row per video. Check "Track this channel" to make
  it eligible for **Koli > Refresh Tracked Profiles**, which
  pulls whatever's new since the last run for every tracked channel in
  one click: no need to remember date ranges.
- **Discover**: give it a channel or video link, pick Channels or Videos,
  and it returns up to 5 similar results, scored against whichever filters
  you check (keywords, niche, engagement rate, posts/month, views range).
  Matching uses a tolerance margin, not an exact match. Automatically skips
  any channel marked Passed or Do Not Contact on the Channels sheet.
- **Koli > Refresh Tracked Profiles** (menu item): pulls whatever's new
  since the last run for every tracked channel in one click.
- **Koli > Export > Creator One-Pager** (menu item): with any cell in a
  Channels row selected, generates a pitch-ready PDF (plus an editable
  Doc) into a "Koli Reports" Drive folder next to the spreadsheet, and
  drops a link into that row's Report column. Deliberately leaves out
  Outreach status and internal Notes: it's meant to go to a brand, not
  stay in-house.

## Outreach pipeline (Channels sheet)

Four extra columns on Channels, all manual, never touched by any
automated analysis run:

- **Outreach**: native dropdown: Not Contacted, Contacted, Replied,
  Negotiating, Closed - Won, Closed - Lost, Passed, Do Not Contact.
  New channels default to "Not Contacted."
- **Last Contact**, **Notes**: free text, yours to use however.
- **Report**: filled in automatically by Export > Creator One-Pager.

Existing Channels sheets from before this update get these columns added
automatically the next time Koli writes to that sheet: no manual setup.

## Sheet tabs Koli manages

| Tab | What it holds |
|---|---|
| Channels | One row per channel |
| Videos | One row per video |
| Profile | One row per video, scoped to tracked/date-ranged channel pulls |
| Sponsors | One row per (channel, brand), auto-aggregated, always on: includes the latest mention's Posted date, timestamp, and evidence text (Sponsor Mentions, the old separate per-mention log, is retired) |
| Discover Results | Appended results from Discover runs |
| Prospects | Captures from the "Send to Koli" browser extension (notes only: channel/video links go straight to Channels/Videos); process with Koli > Process Prospects |
| Dashboard | KPI cells + a spot to add your own charts |
| Outreach Drafts | Generated cold-outreach email drafts: Koli > Export > Draft Outreach Email |
| Brand Fit Scores | Channel-vs-campaign-brief scores: Koli > Brand Intelligence > Brand Fit Score |
| _SubscriberSnapshots, _TrackedProfiles | Hidden control sheets: don't edit directly |

## New Google permissions (Export feature)

Adding the Creator One-Pager export required two new OAuth scopes in
`appsscript.json`: Google Docs and Drive access. Currently on the full
**`drive`** scope, not the narrower `drive.file`: a `drive.file`
attempt was tried and rolled back after confirming live that Apps
Script's built-in `DriveApp` service (used throughout `reportService.gs`)
forces the full `drive` scope for most of its methods regardless of
what's declared in the manifest, including the folder-creation call the
Export feature depends on. Getting real `drive.file` behavior would mean
replacing `DriveApp` calls with the lower-level Advanced Drive Service
throughout that file (a real rewrite, not a manifest change), tracked
as a separate task, not attempted again blind. Full `drive` access is a
"restricted" OAuth scope, meaning an annual paid third-party security
assessment (Google's CASA program, ~$540+/year) is required before this
can be published on the Chrome Web Store or Google Workspace Marketplace
as-is: see ROADMAP.md for where that stands. Next time you authorize
the script, Google's consent screen will ask for the (again) broader
Drive permission: expected, matches what's actually declared.

Channel/Video names are clickable links (`=HYPERLINK`) straight to YouTube;
the raw ID columns used for internal row-matching are hidden, not deleted.

## "Send to Koli" browser extension

A separate, standalone piece: lives in the `send-to-koli-extension`
folder in this download, not inside the Apps Script project. Right-click
a YouTube link (or any selected text) on any page, send it straight to
Koli's Inbox tab without opening the Sheet. Full setup steps are in that
folder's own README, but the short version:

1. Deploy this Apps Script project as a **Web App** (Deploy > New
   deployment > Web app > Execute as "Me" > Who has access "Anyone") to
   get a URL.
2. Set a shared secret in Koli > Settings.
3. Load the extension unpacked in Chrome (`chrome://extensions` >
   Developer mode > Load unpacked), paste the Web App URL and the same
   secret into its options page.
4. Captures land in the Inbox tab with status "New." Run Koli > Process
   Inbox whenever you want them turned into real Channel/Video analysis
  : nothing runs automatically the moment you send something, on purpose.

This is the first time this project needs a Web App deployment rather
than just running the menu: a genuinely different setup step from
everything else in Koli so far.

## Speed

Channel and Video analysis now batch-fetch YouTube data for the whole
pasted list in one or two parallel network round trips before processing
items one at a time, instead of one round trip per line. Gemini calls are
also consolidated: one combined call per channel, one per video, instead
of three or four separate calls. Net effect: noticeably faster on batches
of more than a couple items; a single item won't feel much different.

## Known limitations (by design)

- **CPM** is an industry-benchmark estimate, always a range, never a real
  ad-market figure.
- **New Subscribers** needs at least two runs against a channel before it
  returns a number; Profile's Sub Δ is the same mechanism, so historical
  videos from before a channel was first analyzed show "n/a."
- **Audience location/gender/age** are Gemini estimates from public
  signals, explicitly labeled as such: not YouTube Studio analytics.
- **Contact email discovery** follows the About description and any
  link-in-bio aggregator/personal site found there. It can't log into
  Instagram/TikTok/X to read bios directly (no headless browser in Apps
  Script): those handles still show up in the Channel note even without
  an email.
- **In-video sponsor timestamps** (Settings toggle) use YouTube's public
  auto-caption endpoint and best-effort text matching: not every video
  has captions, and it's an unofficial endpoint that could stop working
  without notice. When it can't find a confident match, it says so rather
  than guessing.
- **Discover** has no official "similar channels" API to call: it derives
  search keywords via Gemini, searches, then scores candidates. It's the
  most expensive feature per run, which is why results are capped at 5.
- **Refresh Tracked Profiles** is a manual menu action, not an automatic
  background schedule: automatic time-based triggers need a separate
  Google authorization step. You click it when you want tracked channels
  updated.

## Quota notes

- YouTube: batched `channels.list`/`videos.list` calls (up to 50 IDs each)
  plus parallel `playlistItems.list`/`commentThreads.list` for Channel and
  Video analysis. `search.list` (highest quota cost) is only used as a
  fallback for legacy `/c/` URLs, free-text input, and Discover: prefer
  `@handle` or a direct ID/link everywhere else.
- Everything YouTube-side is cached 6 hours; resolved channel IDs 24 hours.
- Discover scans up to 15 candidates per run to pick the top 5: it's
  meant for occasional use, not a batch tool.
