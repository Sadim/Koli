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
text — and send it directly to your Koli spreadsheet's Prospects tab,
without leaving the page you're on.

**What it does:**
- Right-click a link → "Send link to Koli" — auto-detects whether it's
  a channel or video link
- Right-click selected text → "Send selection to Koli as a note" — for
  anything worth flagging that isn't a direct link
- Right-click anywhere on a page → "Send this page to Koli"

Everything captured lands in your Koli sheet's Prospects tab, ready to
process on your own schedule — nothing runs automatically the moment
you send something.

**Your data, your infrastructure.** This extension talks only to a
Google Apps Script Web App that you deploy and control with your own
Google account. The extension's developer never sees, receives, or has
access to anything you send through it — there's no third-party server
in the middle. See the privacy policy for full detail.

**Requires setup**: this extension is the companion to Koli, a Google
Sheets-based research tool. You'll need a Koli spreadsheet already set
up, and a few minutes to connect the extension to it (steps in the
popup's Settings screen). Not a standalone product.

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
background.

**Content script (`content.js`, runs on all pages)**: Powers "Select
similar items on this page" — right-click one item in a list/grid of
similar entries (a creator directory, a leaderboard, search results)
and capture all matching entries in one action. The script only reads
the page DOM and acts when the user explicitly triggers it from the
context menu; it does not run automatically, does not persist data,
and does not follow links or pagination on its own — one page, one
user-initiated action, nothing scheduled or unattended.

## Screenshots needed (not yet created)
1. Context menu open on a YouTube video page showing "Send link to Koli"
2. The popup's YouTube tab (worksheet lock + column list)
3. A Koli Prospects tab showing captured entries
