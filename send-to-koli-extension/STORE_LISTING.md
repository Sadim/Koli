# Chrome Web Store — Listing Copy

Draft copy, ready to paste into the Developer Dashboard fields. Adjust
tone/branding as needed — this is a starting point, not final marketing.

## Store listing name
Send to Koli

## Short description (132 characters max)
Right-click any link or selection and send it straight into your Koli worksheet — no copy-paste, no tab-switching.

## Detailed description

Send to Koli turns any webpage into an input for your Koli research
workflow. Right-click a YouTube channel or video link — or any selected
text — and send it directly to your Koli spreadsheet, without leaving
the page you're on.

**What it does:**
- Right-click a link → "Send to Worksheet → Channel" or "→ Video" —
  your explicit choice, since Koli's Channels and Videos sheets have
  different columns and sending to the wrong one isn't something worth
  guessing at from the URL
- Right-click selected text → "Send selection to Koli as a note" — for
  anything worth flagging that isn't a direct link
- Right-click anywhere on a page → "Send this page to Worksheet →
  Channel" or "→ Video"
- Open the side panel (toolbar icon) for the same actions without a
  right-click, plus one-off Profile pulls (a single channel over a date
  range) and Discover runs (find similar channels/videos) — both write
  straight into your Koli spreadsheet's Profile and Discover Results
  sheets, free of charge, same as everywhere else these live in Koli

Channel and video captures run full analysis immediately and land
straight in your Channels/Videos sheets; notes queue in a Prospects tab,
processed on your own schedule via Koli's menu — nothing runs
automatically the moment you send a note.

**Your data, your infrastructure.** This extension talks only to a
Google Apps Script Web App that you deploy and control with your own
Google account. The extension's developer never sees, receives, or has
access to anything you send through it — there's no third-party server
in the middle. See the privacy policy for full detail.

**Requires setup**: this extension is the companion to Koli, a Google
Sheets-based research tool. You'll need a Koli spreadsheet already set
up, and a few minutes to connect the extension to it (steps in the side
panel's Settings screen — Koli's own Settings dialog can generate a
single connection code so there's nothing to hand-copy). Not a
standalone product.

## Category
Productivity

## Permission justifications (for the review submission form)

**`contextMenus`**: Required to add the right-click menu items that are
this extension's entire interface.

**`storage`**: Stores the user's configured Web App URL and shared
secret locally (`chrome.storage.sync`), so they don't need to
re-enter them each session.

**`notifications`**: Shows a brief confirmation toast after a
successful (or failed) send, so the user knows the action worked
without needing to switch to their spreadsheet to check.

**`host_permissions: <all_urls>`**: The extension's core feature is
capturing links and notes from *any* page the user is browsing, not
a fixed set of sites — a user might find a creator mentioned on a
blog, a forum, or a social platform, not only on youtube.com. The
permission is inert until the user actively right-clicks and chooses
a Koli menu item; no data is read or transmitted passively or in the
background. It also lets the side panel's Home tab read the active
tab's URL/title (`chrome.tabs.query`) to show what page you're on and
offer a one-click send — no separate `tabs` permission is needed for
that, since `<all_urls>` already covers it.

**`sidePanel`**: Required to open "Send to Koli" as a persistent Chrome
side panel instead of a popup that closes on every focus change — lets
the Home tab's current-page card update live as you browse, and keeps
Profile/Discover runs visible while they work instead of needing the
popup held open.

## Screenshots

`store-screenshots/` has 4 uploaded — real renders of the old popup UI (running production HTML/CSS/JS against sample data), now stale after the side-panel rewrite and **due for re-capture** from `sidepanel.html` before the next submission:
1. `1-popup-channels.png` — Columns tab, Channels column editor
2. `2-popup-videos.png` — Columns tab, Videos column editor (shows the Channels/Videos/Profile/Discover switcher)
3. `3-popup-log.png` — Activity tab with sample sent/failed entries
4. `4-popup-settings.png` — Settings screen

Worth adding once captured: the Home tab (current-page card + Profile/Discover mini-forms).

**Still needed, and these two can't be generated the same way** — both require something outside a static render:
- **Context menu open**, showing "Send to Worksheet → Channel/Video" — a real right-click context menu is drawn by the OS/browser chrome, not the page itself, so it can only come from an actual browser with the extension loaded. To get it: load the extension unpacked (see README), open any YouTube video page, right-click a link, and screenshot the open menu before it closes.
- **A Koli sheet showing captured entries** — needs a real Google Sheet with real Koli data in it; there's no live spreadsheet available to render this from here. Analyze a few channels for real, then screenshot the Channels tab.
