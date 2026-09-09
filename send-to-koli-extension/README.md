# Send to Koli — browser extension (v2.1)

Right-click a link on any page and send it straight into a Koli worksheet —
YouTube by default, or any other platform you've set up your own profile for.
The toolbar icon opens a persistent side panel with the same setup plus
one-off Profile and Discover runs, so it stays open and live-updates as you
browse instead of closing every time you click away.

## Install (unpacked, since this isn't published to the Chrome Web Store)

1. Open `chrome://extensions` in Chrome (or the equivalent in Edge/Brave).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**, and select this `send-to-koli-extension` folder.

## Set it up

1. In your Koli **Apps Script editor**: Deploy → New deployment → select
   type **Web app** → Execute as "Me" → Who has access "Anyone" → Deploy.
2. In Koli's own **Settings** dialog (Koli menu → Settings), set a shared
   secret, then click **Generate** next to "Connection code" — it bundles
   the deployed URL and your secret into one string, so there's nothing to
   copy from the Deploy dialog by hand.
3. Click the extension's toolbar icon to open the side panel → **Columns**
   tab → tap the **"Choose worksheet"** pill → paste the connection code and
   tap **"Fill in URL & secret from this code"** (or paste the URL/secret
   separately if you'd rather). Pick a destination tab if you don't want the
   default (Prospects). Tap **Test & Lock**.
4. That's it for YouTube. Repeat for any other platform by tapping the
   **+** tab at the end of the tab bar — each named platform (Instagram,
   TikTok, whatever) gets its own tab, right after YouTube, and its own
   independent lock, so it can point at a completely different worksheet
   (or a different tab in the same one) than YouTube, guaranteed not to
   collide.

## Use it

- Right-click any YouTube link → **Send to Worksheet → Channel** or
  **→ Video**. Explicit, not auto-detected — Channels and Videos are
  different sheets with different columns, so which one you're sending
  to is always your call, never a guess from the URL shape.
- Right-click selected text → **Send selection to Koli as a note**.
- Right-click anywhere on a page (no selection) → **Send this page to
  Worksheet → Channel** or **→ Video** — same explicit choice, for
  whichever page you're currently on.
- Once you've added a platform, a matching **"Send to [Platform Name]"**
  item appears in the same right-click menu automatically (still a single
  generic capture — no channel/video split for those yet).
- Or open the side panel's **Home** tab: it shows whatever page you're on
  (auto-classified as a YouTube channel/video where recognized) with a
  one-click send, plus **Profile** (pull one channel over a date range) and
  **Discover** (find similar channels/videos) — both free, both write
  straight into your Koli spreadsheet's Profile / Discover Results sheets.

## The side panel

- **Home tab**: current-page card with a one-click send (updates live as
  you switch or navigate tabs, since the panel stays open); sent/error
  counts for today; a **Profile** mini-form (channel, date range, track
  toggle) and a **Discover** mini-form (seed link, channel/video toggle,
  result count, match filters) — each posts straight to your Koli Web App
  and reports back inline.
- **YouTube tab**: a **Channels / Videos / Profile / Discover** switcher —
  each has its own real column layout, edited and applied independently.
  Drag to reorder or delete what you don't need; this only changes what
  the panel *shows* you until you tap Apply.
- **One tab per added platform** (Instagram, TikTok, whatever) — sits
  right after the YouTube tab, in the order you added them. Each has its
  own fully editable column set (starts pre-filled from Channels'
  defaults, edit or delete freely) and its own worksheet lock. Tap **+**
  at the end of the tab bar to add another; "Delete this platform" on a
  platform's own tab removes it (and its tab) for good.
- **Activity tab**: every send (including Profile/Discover runs), paginated,
  with the resolved name (YouTube page titles have " - YouTube" stripped
  automatically), which platform it went to, and quick view/delete actions
  per entry.
- **Settings (gear icon)**: every lock in one place, plus the quick-setup
  reminder — no separate options page, this replaced it entirely.

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
  youtube: { locked, url, secret, tab, columnsChannel: [...], columnsVideo: [...], columnsProfile: [...], columnsDiscover: [...] },
  other: [ { id, name, locked, url, secret, tab, columns: [...] } ]
}
```

The activity log is separate, in `chrome.storage.local` under `koliLog`
(capped at 500 entries — that's a real recent-activity view with genuine
pagination now, not just a short scrolling list).

## Trust & transparency

Said plainly, not just claimed:
- **No telemetry.** This extension makes exactly one kind of outbound
  request: to the Web App URL *you* deploy and control. There's no
  Koli-operated server it phones home to, and no analytics SDK in it.
- **Nothing leaves your browser except what you send.** Locks, columns,
  and the activity log all live in `chrome.storage` (see above) — never
  synced anywhere Koli's developer can read.
- **Minimal permissions, and each one is justified in
  [STORE_LISTING.md](STORE_LISTING.md)'s "Permission justifications"
  section** — worth reading before trusting any extension with
  `<all_urls>`, this one included.
- **MIT-licensed** (see [LICENSE](LICENSE)) — staged ahead of actually
  publishing the source publicly, so the license is settled before
  anyone's asked to trust "we'll open it up eventually." Once it's public,
  the permission list, the network calls, and the storage model above are
  all independently checkable, not just asserted here.
- **The planned real Google Sign-In** (`chrome.identity`, replacing the
  shared-secret model — see Known limitations below) will ship with its
  own plain-language screen at first sign-in stating exactly what scope is
  requested and why, before any permission prompt — not buried in a
  privacy policy nobody reads.

## Known limitations, stated plainly

- **Sign-in-based worksheet discovery isn't built.** You still lock a
  worksheet with a URL+secret connection code for every lock — real Google
  Sign-In (via `chrome.identity`) is a bigger future upgrade, deliberately
  not attempted yet. Drive-based auto-discovery was considered and rejected:
  it would require a new, broader Drive OAuth scope, reopening the exact
  CASA security-review cost this project has otherwise avoided.
- **Voice/attachment features aren't part of this extension** — those exist
  in the Google Sheets sidebar's input-options dropdown, a completely
  separate surface from this side panel.
