/**
 * background.js
 * Right-click (context menu) is the primary way to send a link/selection —
 * deliberate: pick a link, a selection, or the whole page. The toolbar icon
 * opens the persistent side panel instead (sidepanel.html), which also
 * offers its own Home-tab quick-send, Profile, and Discover actions — see
 * the koli-send message bridge below for how those reuse this file's send().
 *
 * Storage model: chrome.storage.sync key `locks` = {
 *   youtube: { locked, url, secret, tab, columns },
 *   other:   [{ id, name, locked, url, secret, tab, columns }]
 * }
 * Each lock is a fully independent binding — YouTube's context-menu
 * items always target the youtube lock; each Other-Platform profile
 * gets its own dynamically-created menu item so a send is never
 * guessed at, only ever explicit about which lock it's going to.
 */

/**
 * Channel and Video are explicit menu choices, not auto-detected — Koli's
 * Channels and Videos sheets have genuinely different headers (Channels:
 * Niche/Posts-per-Month/Contact/Subs/Grade/Outreach...; Videos: Views/
 * Likes/Comments/Auth/Eng %/New Subs...), so guessing wrong from a URL
 * pattern silently sends the wrong shape of data to the wrong place. Two
 * explicit "Send to Worksheet" submenu items (for both a right-clicked
 * link and the current page) put that choice in the user's hands instead.
 * classifyUrl() is kept only as a soft mismatch check (see send()) — it
 * never overrides what was explicitly clicked.
 */
function rebuildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'send-worksheet-link', title: 'Send to Worksheet', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'send-link-channel', parentId: 'send-worksheet-link', title: 'Channel', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'send-link-video', parentId: 'send-worksheet-link', title: 'Video', contexts: ['link'] });

    chrome.contextMenus.create({ id: 'send-selection-to-koli', title: 'Send selection to Koli as a note', contexts: ['selection'] });

    chrome.contextMenus.create({ id: 'send-worksheet-page', title: 'Send this page to Worksheet', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'send-page-channel', parentId: 'send-worksheet-page', title: 'Channel', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'send-page-video', parentId: 'send-worksheet-page', title: 'Video', contexts: ['page'] });

    chrome.storage.sync.get('locks', ({ locks }) => {
      const others = (locks && locks.other) || [];
      if (!others.length) return;
      chrome.contextMenus.create({ id: 'sep-other-platforms', type: 'separator', contexts: ['all'] });
      others.forEach((p) => {
        chrome.contextMenus.create({ id: 'send-other-' + p.id, title: 'Send to ' + p.name, contexts: ['all'] });
      });
    });
  });
}
chrome.runtime.onInstalled.addListener(rebuildContextMenus);
chrome.runtime.onStartup.addListener(rebuildContextMenus);

// Toolbar icon now opens the side panel instead of a popup — persistent
// across page navigation, so Home's current-page card can react as you
// browse instead of resetting every time the popup would've closed.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error('[Koli]', e));
// Rebuilds automatically whenever a profile is added/renamed/removed in
// the popup — background.js never goes stale relative to what's stored.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.locks) rebuildContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-link-channel' && info.linkUrl) {
    send('channel', info.linkUrl, tab.title, tab.url);
  } else if (info.menuItemId === 'send-link-video' && info.linkUrl) {
    send('video', info.linkUrl, tab.title, tab.url);
  } else if (info.menuItemId === 'send-selection-to-koli' && info.selectionText) {
    send('note', info.selectionText, tab.title, tab.url);
  } else if (info.menuItemId === 'send-page-channel') {
    send('channel', tab.url, tab.title, tab.url);
  } else if (info.menuItemId === 'send-page-video') {
    send('video', tab.url, tab.title, tab.url);
  } else if (info.menuItemId.indexOf('send-other-') === 0) {
    const profileId = info.menuItemId.slice('send-other-'.length);
    const value = info.linkUrl || info.selectionText || tab.url;
    send('note', value, tab.title, tab.url, false, profileId); // non-YouTube platforms aren't auto-classified — always sent as a generic capture
  }
});

/**
 * Recognized platforms — each with its own rules for what counts as a
 * "channel" vs. a "video/post." No longer the source of truth for what
 * gets sent as (that's now an explicit menu choice — see
 * rebuildContextMenus), only used by send() as a soft mismatch check
 * against whatever was explicitly clicked. Unrecognized platforms/URLs
 * still send fine as a generic note — unrestricted on purpose, that's
 * what makes off-platform mentions (a creator referenced on a blog, a
 * forum post, a directory listing) useful to capture at all. Add a new
 * platform here when it's time — one object, not a rewrite.
 */
const RECOGNIZED_PLATFORMS = [
  {
    name: 'YouTube',
    domain: /youtube\.com|youtu\.be/,
    videoPattern: /youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\//,
    channelPattern: /youtube\.com\/(channel\/|@|c\/|user\/)/
  }
  // Instagram, TikTok, etc. — added here when their turn comes.
];

function classifyUrl(url) {
  if (!url) return 'note';
  for (const platform of RECOGNIZED_PLATFORMS) {
    if (!platform.domain.test(url)) continue;
    if (platform.videoPattern && platform.videoPattern.test(url)) return 'video';
    if (platform.channelPattern && platform.channelPattern.test(url)) return 'channel';
  }
  return 'note'; // not a recognized platform, or didn't match a known pattern — still sendable, just generic
}

/**
 * YouTube's own page titles are reliably formatted ("Channel Name -
 * YouTube", "Video Title - YouTube") — stripping that suffix gets a
 * clean display name for the log without an extra network round-trip
 * to resolve the real channel name server-side, which would slow down
 * the one interaction that's supposed to be instant. Not perfect for
 * every site, but right for the common case at zero added cost.
 */
function resolveDisplayName_(pageTitle, value) {
  if (pageTitle) {
    const stripped = pageTitle.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    if (stripped) return stripped;
  }
  return value || 'Untitled';
}

async function logActivity_(entry) {
  const { koliLog } = await chrome.storage.local.get('koliLog');
  const log = koliLog || [];
  log.unshift(Object.assign({ timestamp: Date.now() }, entry));
  if (log.length > 500) log.length = 500; // raised from 50 — enough for the Log tab's real pagination
  await chrome.storage.local.set({ koliLog: log });
}

/**
 * lockId is 'youtube' (default) or an Other-Platform profile's id —
 * decides which stored lock's url/secret/tab this send uses. Never
 * guessed from the URL; always either the YouTube-specific menu items
 * or an explicit per-profile menu item chose it.
 */
async function send(type, value, pageTitle, sourceUrl, silent, lockId) {
  const { locks } = await chrome.storage.sync.get('locks');
  const isYoutube = !lockId || lockId === 'youtube';
  const lock = isYoutube ? (locks && locks.youtube) : ((locks && locks.other) || []).find((p) => p.id === lockId);
  const profileLabel = isYoutube ? 'YouTube' : (lock && lock.name) || 'Unknown platform';

  if (!lock || !lock.locked || !lock.url || !lock.secret) {
    if (!silent) notify('Not connected', 'Open the extension and lock a worksheet for ' + profileLabel + ' first.');
    return false;
  }

  const resolvedName = resolveDisplayName_(pageTitle, value);

  // Channel/Video is now an explicit menu choice (see rebuildContextMenus),
  // never guessed — but classifyUrl() still runs here as a soft mismatch
  // check, since picking the wrong one sends the right shape of data to
  // the wrong sheet with no error (a video URL "looks like" a valid
  // channel input often enough that Koli won't necessarily reject it).
  // This only adds a heads-up to the notification; it never overrides
  // what was explicitly clicked.
  const guessedType = classifyUrl(value);
  const mismatchWarning = (type === 'channel' || type === 'video') && guessedType !== 'note' && guessedType !== type
    ? ' (this looked like a ' + guessedType + ' link — sent as ' + type + ' anyway)'
    : '';

  // Channel/video sends now wait on live YouTube+Gemini calls (several
  // seconds, sometimes longer) — an immediate notification here doesn't
  // make that faster, but it means the wait isn't silent dead air with
  // no sign anything is happening. Notes are still effectively instant,
  // so they don't get this.
  if (!silent && (type === 'channel' || type === 'video')) {
    notify('Analyzing…', resolvedName + mismatchWarning + ' — this takes a few seconds, hang tight.');
  }

  try {
    const resp = await fetch(lock.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight against Apps Script
      body: JSON.stringify({ secret: lock.secret, type, value, pageTitle, sourceUrl, targetTab: lock.tab || '' })
    });
    const data = await resp.json();
    if (data.ok) {
      if (!silent) notify('Sent to ' + profileLabel, resolvedName + ' added to your worksheet. Click to view.', data.link);
      await logActivity_({ type, value, pageTitle, resolvedName, profileLabel, success: true, link: data.link });
      return true;
    } else {
      if (!silent) notify(profileLabel + ' rejected this', data.error || 'Unknown error.');
      await logActivity_({ type, value, pageTitle, resolvedName, profileLabel, success: false, message: data.error });
      return false;
    }
  } catch (e) {
    console.error('[Koli] fetch failed:', e);
    if (!silent) notify('Could not reach ' + profileLabel, e.message);
    await logActivity_({ type, value, pageTitle, resolvedName, profileLabel, success: false, message: e.message });
    return false;
  }
}

// Maps a notification's auto-generated ID to the sheet link it should
// open on click — lets a "Sent to Koli" toast actually take you to the
// result instead of just confirming it happened somewhere.
const notificationLinks = {};

function notify(title, message, link) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    title, message
  }, (notificationId) => {
    if (link && notificationId) notificationLinks[notificationId] = link;
  });
}

chrome.notifications.onClicked.addListener((notificationId) => {
  const link = notificationLinks[notificationId];
  if (link) {
    chrome.tabs.create({ url: link });
    delete notificationLinks[notificationId];
  }
});

// Bridge for the side panel's Home-tab quick-send buttons — routes through
// this exact same send() rather than duplicating its fetch/log/notify
// logic in sidepanel.js, so a quick send and a right-click send behave
// identically and show up in the same Log tab the same way.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.kind !== 'koli-send') return false;
  send(msg.type, msg.value, msg.pageTitle, msg.sourceUrl, msg.silent, msg.lockId).then((ok) => sendResponse({ ok }));
  return true; // keep the message channel open for the async response
});
