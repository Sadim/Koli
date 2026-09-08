# Send to Koli — browser extension (v2.0)

Right-click a link on any page and send it straight into a Koli worksheet —
YouTube by default, or any other platform you've set up your own profile for.

## Install (unpacked, since this isn't published to the Chrome Web Store)

1. Open `chrome://extensions` in Chrome (or the equivalent in Edge/Brave).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**, and select this `send-to-koli-extension` folder.

## Set it up

1. In your Koli **Apps Script editor**: Deploy → New deployment → select
   type **Web app** → Execute as "Me" → Who has access "Anyone" → Deploy.
   Copy the URL it gives you (ends in `/exec`).
2. Click the extension's toolbar icon → the **YouTube** tab is open by
   default → tap the **"Choose worksheet"** pill.
3. Paste the URL, and the shared secret you set in Koli's own Settings
   dialog (Koli menu → Settings). Pick a destination tab if you don't want
   the default (Prospects). Tap **Test & Lock**.
4. That's it for YouTube. Repeat for any other platform via the
   **Other Platforms** tab → **+ Add platform** — each one gets its own
   independent lock, so an Instagram profile can point at a completely
   different worksheet (or a different tab in the same one) than YouTube,
   and the two are guaranteed not to collide.

## Use it

- Right-click any link on any page → **Send link to Koli (YouTube)**. Auto-
  detects whether it's a channel or video link.
- Right-click selected text → **Send selection to Koli as a note**.
- Right-click anywhere on a page (no selection) → **Send this page to Koli**.
- Once you've added an Other-Platforms profile, a matching **"Send to
  [Platform Name]"** item appears in the same right-click menu automatically.

## The popup

- **YouTube tab**: Koli's real 24-column layout, drag to reorder or delete
  what you don't need — this only changes what the popup *shows* you, never
  your actual worksheet.
- **Other Platforms tab**: one or more named profiles (Instagram, TikTok,
  whatever), each with its own fully editable column set (starts pre-filled
  from YouTube's defaults, edit or delete freely) and its own worksheet lock.
- **Log tab**: every send, paginated, with the resolved name (YouTube page
  titles have " - YouTube" stripped automatically), which platform it went
  to, and quick view/delete actions per entry.
- **Settings (gear icon)**: every lock in one place, plus the quick-setup
  reminder — no separate options page anymore, this replaced it entirely.

## Recognized platforms

Only YouTube gets auto-detected channel/video classification right now —
that's a real, coded set of URL patterns, not just a label. Links from any
other platform still send fine as generic captures; they just don't get
that auto-classification yet. Add a platform's real detection rules in
`background.js`'s `RECOGNIZED_PLATFORMS` array when that's worth doing.

## Storage model

Everything lives in `chrome.storage.sync` under one key, `locks`:

```js
{
  youtube: { locked, url, secret, tab, columns: [...] },
  other: [ { id, name, locked, url, secret, tab, columns: [...] } ]
}
```

The activity log is separate, in `chrome.storage.local` under `koliLog`
(capped at 500 entries — that's a real recent-activity view with genuine
pagination now, not just a short scrolling list).

## Known limitations, stated plainly

- **Sign-in-based worksheet discovery isn't built.** You still paste a Web
  App URL and secret manually for every lock. A real upgrade, deliberately
  not attempted yet — see the project handoff doc for why and what it'd need.
- **Voice/attachment features aren't part of this extension** — those exist
  in the Google Sheets sidebar's Assistant mode, a completely separate
  surface from this popup.
