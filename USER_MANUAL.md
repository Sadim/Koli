# Koli — User Manual

*Living document. Updated the same turn a user-facing feature changes.*

This is the feature-by-feature reference — what every tab, menu item,
column, and setting actually does. For "how do I actually work day to
day," see OPERATOR_GUIDE.md instead. For installation, see README.md.

## The Koli menu

| Item | What it does |
|---|---|
| Analyze Channels | Opens the sidebar's Channel tab |
| Analyze Videos | Opens the sidebar's Video tab |
| Profile | Opens the sidebar's Profile tab |
| Discover | Opens the sidebar's Discover tab |
| Dashboard | Jumps to the Dashboard sheet, refreshes its stats |
| Export > Creator One-Pager | PDF + Doc for the Channels row your cursor is on |
| Export > Draft Deal Memo | Contract-starting-point Doc for the Channels row your cursor is on |
| Refresh Tracked Profiles | Pulls new videos for every channel tagged "Track this channel" in Profile |
| Process Inbox | Runs full analysis on everything the browser extension has queued |
| Settings | API keys, lookback window, comment sample size, sponsor-detection toggles, extension shared secret |
| Run Diagnostics | Checks YouTube key, Gemini key, and Drive/Docs permission in one click |
| Help | Quick in-app summary of all of the above |

## Sidebar tabs

### Channel

Paste channel links/handles (one per line) or use the selected sheet
range. Writes one row per channel to the **Channels** sheet:

| Column | Meaning |
|---|---|
| Status | Done / Error / Skipped |
| Channel | Clickable name, links to the channel |
| Niche | 5 keywords, Gemini-derived, most to least central |
| Posts/Mo | Average uploads/month over the lookback window (default 90 days) |
| Email | Auto-found from the About page or a linked site. **Type over it any time — never overwritten on re-run once it's not "Not found."** |
| Subs | Subscriber count, formatted (1.2M etc.) — "Hidden" if the channel hides it |
| CPM | Industry-benchmark estimate range, never a real quote |
| Updated | Last analysis timestamp |
| Outreach | Dropdown: Not Contacted / Contacted / Replied / Negotiating / Closed-Won / Closed-Lost / Passed / Do Not Contact |
| Last Contact | Manual, free text/date |
| Notes | Manual, free text |
| Report | Auto-filled link once you've exported a one-pager or deal memo |

The Channel Name cell carries a note with the About summary and any
other social links found. A "Scan recent videos for sponsors" checkbox
controls whether channel analysis also checks the 5 most recent uploads
for sponsor mentions (default on, toggle in Settings).

### Video

Paste video links/IDs (watch URLs, youtu.be, Shorts, bare IDs). Writes
one row per video to **Videos**:

| Column | Meaning |
|---|---|
| Video | Clickable title |
| Channel | Parent channel name — carries an About-summary note |
| Views / Likes / Comments | Raw counts |
| Auth | Comment authenticity, shown as "7/10" — cell note has the justification |
| Eng % | (likes + comments) / views |
| Posted / Day | Publish time (West Africa Time) and day of week |
| New Subs | Delta since the last time this channel was checked — needs 2+ runs to show a number |
| Location / Age / Gender | Audience estimates — Gemini inference, not real analytics |

### Profile

One channel, a date range (native calendar pickers), one row per video
published in that window. Options: Append or Replace on re-run, and
"Track this channel going forward" (makes it eligible for Refresh
Tracked Profiles). Headers are the same idea as Channel + Video combined
plus Sponsor / Mention TS / Sub Δ, shortened for one sheet.

### Discover

One seed link, pick Channels or Videos, up to 5 results. Filters
(Keywords, Niche, Engagement rate, Posts/month, Views range) are
checkboxes — checked filters count toward a match score with a
tolerance margin, not an exact match. Automatically skips anything
marked Passed or Do Not Contact on Channels. Results append to
**Discover Results**, never overwrite.

## Settings dialog

| Field | Default | Notes |
|---|---|---|
| YouTube API key | — | Required |
| Gemini API key | — | Required |
| Lookback window | 90 days | Used for Posts/Mo |
| Comment sample size | 40 | Per video, for authenticity scoring |
| Scan recent videos for sponsors | On | Channel analysis's sponsor scan |
| Attempt in-video timestamp | Off | Best-effort caption match when SponsorBlock has no coverage (SponsorBlock's own verified timestamp is free and always attempted regardless of this toggle) |
| Extension shared secret | — | Required for the browser extension to work |

## Sheets Koli manages

| Sheet | Written by |
|---|---|
| Channels | Channel tab, extension (via Process Prospects) |
| Videos | Video tab, extension |
| Profile | Profile tab, Refresh Tracked Profiles |
| Sponsors | Any feature that detects a sponsor — aggregate rollup, always on, now includes the latest mention's Posted date/timestamp/evidence (the old separate Sponsor Mentions log is retired) |
| Discover Results | Discover tab |
| Prospects | The browser extension only (notes and unrecognized captures) |
| Dashboard | Formulas + a script-computed authenticity average, refreshed on open |
| _SubscriberSnapshots, _TrackedProfiles | Internal, hidden — don't edit |

## Glossary

- **Estimate / Inferred** — Gemini's best guess from available text
  signals, not real analytics. Always labeled as such in the sheet.
- **Verified** — Confirmed by SponsorBlock's crowd-sourced human data,
  not an LLM guess.
- **Margin / tolerance** — Discover's filters don't require an exact
  match; candidates are scored on closeness, not pass/fail.
- **Draft** — The Deal Memo export. Explicitly not legal advice, not a
  finished contract.

## Troubleshooting

See OPERATOR_GUIDE.md's "When something looks wrong" section. Short
version: 429 errors are Gemini's free-tier rate limit (wait a minute);
"Not found"/"Insufficient signal" are Koli being honest about a real
limit, not a bug; anything else, describe exactly what you see and it
gets fixed in code, not explained away.
