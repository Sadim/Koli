/**
 * sidepanel.js
 * Rewritten from popup.js for the persistent Chrome side panel (manifest's
 * side_panel.default_path). Storage model is unchanged from the popup era —
 * chrome.storage.sync key `locks`:
 *   { youtube: {locked,url,secret,tab,columnsChannel,columnsVideo,columnsProfile,columnsDiscover},
 *     other: [{id,name,locked,url,secret,tab,columns}] }
 * Activity log still lives in chrome.storage.local (key `koliLog`), written
 * by background.js's send() for right-click/quick-send captures, and
 * directly by this file for Profile/Discover runs (which never go through
 * send() — see the Profile/Discover sections below).
 */

// Kept literally in sync with constants.gs's CHANNEL_HEADERS / VIDEO_HEADERS /
// PROFILE_HEADERS / DISCOVER_HEADERS — the extension has no way to read
// those server-side, so this is a manually-maintained mirror, same as every
// other column name used here.
const CHANNEL_DEFAULT_COLUMNS = [
  'Status', 'Channel', 'ID', 'Niche', 'Posts/Mo', 'Contact', 'Subs', 'Avg Views',
  'Post Times', 'Grade', 'Outreach', 'Last Contact', 'Notes', 'Report'
];
const VIDEO_DEFAULT_COLUMNS = [
  'Status', 'Video', 'ID', 'Channel', 'Views', 'Likes', 'Comments', 'Auth',
  'Eng %', 'Posted', 'Day', 'New Subs', 'Location', 'Age', 'Gender', 'Updated'
];
const PROFILE_DEFAULT_COLUMNS = [
  'Status', 'Channel', 'Video ID', 'Channel ID', 'Video', 'Posted', 'Views',
  'Likes', 'Comments', 'Auth', 'Eng %', 'CPM', 'Sponsor', 'Mention TS',
  'Location', 'Age', 'Gender', 'Sub Δ', 'Updated'
];
const DISCOVER_DEFAULT_COLUMNS = [
  'Type', 'Name', 'Channel', 'Subs/Views', 'Posts/Mo', 'Eng %', 'Match Score', 'Found Via'
];

// Cosmetic-only mirror of background.js's RECOGNIZED_PLATFORMS, used solely
// to label the Home tab's current-page card. background.js re-derives this
// independently at send time for its own mismatch check — this copy never
// decides what actually gets sent, only how the card describes the page
// before you choose.
const RECOGNIZED_PLATFORMS = [
  {
    name: 'YouTube',
    domain: /youtube\.com|youtu\.be/,
    videoPattern: /youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\//,
    channelPattern: /youtube\.com\/(channel\/|@|c\/|user\/)/
  }
];
function classifyUrl(url) {
  if (!url) return 'note';
  for (const platform of RECOGNIZED_PLATFORMS) {
    if (!platform.domain.test(url)) continue;
    if (platform.videoPattern && platform.videoPattern.test(url)) return 'video';
    if (platform.channelPattern && platform.channelPattern.test(url)) return 'channel';
  }
  return 'note';
}
function resolveDisplayName_(pageTitle, value) {
  if (pageTitle) {
    const stripped = pageTitle.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    if (stripped) return stripped;
  }
  return value || 'Untitled';
}

let state = { locks: { youtube: null, other: [] } };
let activeOtherProfileId = null;
let activeColType = 'channel'; // 'channel' | 'video' | 'profile' | 'discover' — which column list/apply-target is showing
let logPage = 0;
const LOG_PAGE_SIZE = 5;
let currentTab = null; // { url, title } of the active tab, refreshed on Home focus

const ICONS = {
  lockOpen: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.3-2.3"/></svg>',
  lockClosed: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>',
  eye: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  checkCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/></svg>',
  errorCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>',
  channel: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  video: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="14" rx="2.5"/><path d="M17 9.5l4-2.5v10l-4-2.5"/></svg>',
  note: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/></svg>'
};

async function loadState() {
  const { locks } = await chrome.storage.sync.get('locks');
  state.locks = locks || { youtube: null, other: [] };
  if (!state.locks.youtube) {
    state.locks.youtube = {
      locked: false, url: '', secret: '', tab: '',
      columnsChannel: CHANNEL_DEFAULT_COLUMNS.slice(), columnsVideo: VIDEO_DEFAULT_COLUMNS.slice(),
      columnsProfile: PROFILE_DEFAULT_COLUMNS.slice(), columnsDiscover: DISCOVER_DEFAULT_COLUMNS.slice()
    };
  } else {
    const yt = state.locks.youtube;
    // Migrate a pre-existing single `columns` list (from before Channels
    // and Videos had separate editors) into columnsChannel.
    if (yt.columns && !yt.columnsChannel) yt.columnsChannel = yt.columns;
    if (!yt.columnsChannel) yt.columnsChannel = CHANNEL_DEFAULT_COLUMNS.slice();
    if (!yt.columnsVideo) yt.columnsVideo = VIDEO_DEFAULT_COLUMNS.slice();
    if (!yt.columnsProfile) yt.columnsProfile = PROFILE_DEFAULT_COLUMNS.slice();
    if (!yt.columnsDiscover) yt.columnsDiscover = DISCOVER_DEFAULT_COLUMNS.slice();
    delete yt.columns;
  }
  if (!state.locks.other) state.locks.other = [];
}
async function saveLocks() {
  await chrome.storage.sync.set({ locks: state.locks });
}

// ---------- Top tab switching ----------
document.querySelectorAll('#mainTabs .tab').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#mainTabs .tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['home', 'columns', 'other', 'log'].forEach((name) => {
      document.getElementById('panel-' + name).style.display = name === btn.dataset.tab ? 'block' : 'none';
    });
    if (btn.dataset.tab === 'log') renderLogTab();
    if (btn.dataset.tab === 'home') refreshHomeTab();
  };
});

// ---------- Home / Settings screen switching ----------
function showScreen(name) {
  document.getElementById('screen-home').classList.toggle('active', name === 'home');
  document.getElementById('screen-settings').classList.toggle('active', name === 'settings');
  if (name === 'settings') renderSettingsScreen();
}
document.getElementById('navHome').onclick = () => showScreen('home');
document.getElementById('navSettings').onclick = () => showScreen('settings');
document.getElementById('navHome2').onclick = () => showScreen('home');
document.getElementById('navSettings2').onclick = () => showScreen('settings');
document.getElementById('pageConnectLink').onclick = () => showScreen('settings');

// ==================================================================
// Home tab — current page, quick send, Profile, Discover
// ==================================================================
async function refreshHomeTab() {
  await refreshCurrentPageCard();
  await refreshStatTiles();
}

async function refreshCurrentPageCard() {
  const titleEl = document.getElementById('pageTitle');
  const badgeEl = document.getElementById('pageBadge');
  const actionsEl = document.getElementById('pageActions');
  const notConnectedEl = document.getElementById('pageNotConnected');

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) { /* no active tab (rare) */ }
  currentTab = tab ? { url: tab.url || '', title: tab.title || '' } : { url: '', title: '' };

  titleEl.textContent = resolveDisplayName_(currentTab.title, currentTab.url) || 'No page detected';
  const kind = classifyUrl(currentTab.url);
  badgeEl.className = 'badge ' + kind;
  badgeEl.innerHTML = ICONS[kind] + '<span>' + (kind === 'channel' ? 'YouTube channel' : kind === 'video' ? 'YouTube video' : 'Not auto-detected') + '</span>';

  const lock = state.locks.youtube;
  const chipStatus = document.getElementById('brandChipStatus');
  chipStatus.textContent = (lock && lock.locked) ? 'locked' : 'not locked';
  chipStatus.classList.toggle('locked', !!(lock && lock.locked));

  actionsEl.innerHTML = '';
  if (!lock || !lock.locked) {
    notConnectedEl.hidden = false;
    return;
  }
  notConnectedEl.hidden = true;

  const makeBtn = (label, cls, onClick) => {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  };
  if (kind === 'channel') {
    actionsEl.appendChild(makeBtn('Send as Channel', 'btn-fill', () => quickSend('channel')));
    actionsEl.appendChild(makeBtn('Send as Note', 'btn-outline', () => quickSend('note')));
  } else if (kind === 'video') {
    actionsEl.appendChild(makeBtn('Send as Video', 'btn-fill', () => quickSend('video')));
    actionsEl.appendChild(makeBtn('Send as Note', 'btn-outline', () => quickSend('note')));
  } else {
    actionsEl.appendChild(makeBtn('Send as Note', 'btn-fill', () => quickSend('note')));
  }
}

async function quickSend(type) {
  if (!currentTab || !currentTab.url) return;
  const resp = await chrome.runtime.sendMessage({
    kind: 'koli-send', type, value: currentTab.url, pageTitle: currentTab.title,
    sourceUrl: currentTab.url, silent: false, lockId: 'youtube'
  });
  await refreshStatTiles();
  return resp;
}

async function refreshStatTiles() {
  const { koliLog } = await chrome.storage.local.get('koliLog');
  const log = koliLog || [];
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayEntries = log.filter((e) => e.timestamp >= startOfToday.getTime());
  document.getElementById('statSentToday').textContent = String(todayEntries.filter((e) => e.success).length);
  document.getElementById('statErrToday').textContent = String(todayEntries.filter((e) => !e.success).length);
}

// ---------- Profile mini-form ----------
document.getElementById('profileRunBtn').onclick = async () => {
  const lock = state.locks.youtube;
  const btn = document.getElementById('profileRunBtn');
  const result = document.getElementById('profileResult');
  result.className = 'result-card'; result.removeAttribute('style');

  if (!lock || !lock.locked) {
    result.className = 'result-card err'; result.textContent = 'Lock a worksheet for YouTube first (Columns tab, or Settings).';
    return;
  }
  const channelInput = document.getElementById('profileInput').value.trim() || (currentTab && currentTab.url) || '';
  if (!channelInput) {
    result.className = 'result-card err'; result.textContent = 'No channel given, and no channel page is open right now.';
    return;
  }
  const startDate = document.getElementById('profileStart').value;
  const endDate = document.getElementById('profileEnd').value;
  const track = document.getElementById('profileTrack').checked;

  btn.disabled = true; btn.textContent = 'Running…';
  try {
    const resp = await fetch(lock.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: lock.secret, action: 'profile', channelInput, startDate, endDate, mode: 'append', track })
    });
    const data = await resp.json();
    const resolvedName = resolveDisplayName_('', channelInput);
    if (!data.ok) {
      result.className = 'result-card err'; result.textContent = data.error || 'Profile run failed.';
      await logActivityLocal_({ type: 'profile', value: channelInput, resolvedName, profileLabel: 'YouTube Profile', success: false, message: data.error });
    } else {
      const added = typeof data.added === 'number' ? data.added : (typeof data.rowsWritten === 'number' ? data.rowsWritten : null);
      result.className = 'result-card ok';
      result.textContent = (added !== null ? added + ' video row(s) written. ' : 'Done. ') +
        (data.stoppedEarly ? 'Hit the time budget — run it again to pick up where it left off.' : '');
      await logActivityLocal_({ type: 'profile', value: channelInput, resolvedName, profileLabel: 'YouTube Profile', success: true });
    }
    await refreshStatTiles();
  } catch (e) {
    result.className = 'result-card err'; result.textContent = 'Could not reach your worksheet: ' + e.message;
  } finally {
    btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5l13 7.5-13 7.5z"/></svg>Run Profile';
  }
};

// ---------- Discover mini-form ----------
let discoverType = 'channel';
let discoverCount = 5;
document.querySelectorAll('#discoverTypeToggle button').forEach((btn) => {
  btn.onclick = () => {
    discoverType = btn.dataset.dtype;
    document.querySelectorAll('#discoverTypeToggle button').forEach((b) => b.classList.toggle('active', b === btn));
    document.getElementById('discoverPostsRow').style.display = discoverType === 'channel' ? 'flex' : 'none';
  };
});
document.getElementById('discoverCountMinus').onclick = () => {
  discoverCount = Math.max(1, discoverCount - 1);
  document.getElementById('discoverCountDisplay').textContent = String(discoverCount);
};
document.getElementById('discoverCountPlus').onclick = () => {
  discoverCount = Math.min(5, discoverCount + 1);
  document.getElementById('discoverCountDisplay').textContent = String(discoverCount);
};

document.getElementById('discoverRunBtn').onclick = async () => {
  const lock = state.locks.youtube;
  const btn = document.getElementById('discoverRunBtn');
  const result = document.getElementById('discoverResult');
  result.className = 'result-card'; result.removeAttribute('style');

  if (!lock || !lock.locked) {
    result.className = 'result-card err'; result.textContent = 'Lock a worksheet for YouTube first (Columns tab, or Settings).';
    return;
  }
  const seedInput = document.getElementById('discoverInput').value.trim() || (currentTab && currentTab.url) || '';
  if (!seedInput) {
    result.className = 'result-card err'; result.textContent = 'No seed given, and no YouTube page is open right now.';
    return;
  }
  const filters = {
    matchKeywords: document.getElementById('discoverFKeywords').checked,
    matchNiche: document.getElementById('discoverFNiche').checked,
    matchEngagement: document.getElementById('discoverFEngagement').checked,
    matchPostsPerMonth: document.getElementById('discoverFPosts').checked,
    matchViews: document.getElementById('discoverFViews').checked
  };

  btn.disabled = true; btn.textContent = 'Running…';
  try {
    const resp = await fetch(lock.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: lock.secret, action: 'discover', seedInput, searchType: discoverType, resultCount: discoverCount, filters })
    });
    const data = await resp.json();
    const resolvedName = resolveDisplayName_('', seedInput);
    if (!data.ok) {
      result.className = 'result-card err'; result.textContent = data.error || 'Discover run failed.';
      await logActivityLocal_({ type: 'discover', value: seedInput, resolvedName, profileLabel: 'YouTube Discover', success: false, message: data.error });
    } else {
      const found = typeof data.found === 'number' ? data.found : (Array.isArray(data.results) ? data.results.length : null);
      result.className = 'result-card ok';
      result.textContent = found !== null ? found + ' result(s) written to Discover Results.' : 'Done.';
      await logActivityLocal_({ type: 'discover', value: seedInput, resolvedName, profileLabel: 'YouTube Discover', success: true });
    }
    await refreshStatTiles();
  } catch (e) {
    result.className = 'result-card err'; result.textContent = 'Could not reach your worksheet: ' + e.message;
  } finally {
    btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5l13 7.5-13 7.5z"/></svg>Run Discover';
  }
};

// Profile/Discover runs never go through background.js's send() (different
// body shape entirely — no `secret,type,value` capture envelope), so they
// log to koliLog directly here, same shape send()'s logActivity_ writes,
// so the Log tab renders both kinds identically.
async function logActivityLocal_(entry) {
  const { koliLog } = await chrome.storage.local.get('koliLog');
  const log = koliLog || [];
  log.unshift(Object.assign({ timestamp: Date.now() }, entry));
  if (log.length > 500) log.length = 500;
  await chrome.storage.local.set({ koliLog: log });
}

// ==================================================================
// Columns tab (Channels / Videos / Profile / Discover column editors)
// ==================================================================
function renderColumnGrid(gridEl, columns, opts) {
  gridEl.innerHTML = '';
  columns.forEach((col, i) => {
    const item = document.createElement('div');
    item.className = 'col-item';
    item.draggable = true;
    item.dataset.index = i;

    const num = document.createElement('b');
    num.textContent = (i + 1) + '.';
    item.appendChild(num);

    if (opts.editable) {
      const input = document.createElement('input');
      input.placeholder = 'Add a title…';
      input.value = col || '';
      input.oninput = () => { columns[i] = input.value; autoSave(opts.indicatorId); };
      item.appendChild(input);
    } else {
      const span = document.createElement('span');
      span.textContent = col;
      item.appendChild(span);
    }

    const bin = document.createElement('button');
    bin.className = 'bin';
    bin.innerHTML = ICONS.trash;
    bin.onclick = (e) => {
      e.stopPropagation();
      columns.splice(i, 1);
      renderColumnGrid(gridEl, columns, opts);
      autoSave(opts.indicatorId);
    };
    item.appendChild(bin);

    item.ondragstart = () => { item.classList.add('dragging'); item.dataset.dragIndex = i; };
    item.ondragend = () => item.classList.remove('dragging');
    item.ondragover = (e) => { e.preventDefault(); item.classList.add('drag-over'); };
    item.ondragleave = () => item.classList.remove('drag-over');
    item.ondrop = (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIndex = Number(gridEl.querySelector('.dragging').dataset.dragIndex);
      const toIndex = i;
      if (fromIndex === toIndex) return;
      const [moved] = columns.splice(fromIndex, 1);
      columns.splice(toIndex, 0, moved);
      renderColumnGrid(gridEl, columns, opts);
      autoSave(opts.indicatorId);
    };

    gridEl.appendChild(item);
  });
}

let autoSaveTimer = null;
function autoSave(indicatorId) {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await saveLocks();
    if (indicatorId) {
      const el = document.getElementById(indicatorId);
      if (el) {
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 1400);
      }
    }
  }, 400);
}

// Channels/Videos/Profile/Discover are genuinely different sheets with
// different headers — this switcher edits one list at a time, never a
// blended list. Which one a send actually becomes is chosen from the Home
// tab or the right-click menu, not here.
function columnsKeyFor_(type) {
  return { video: 'columnsVideo', profile: 'columnsProfile', discover: 'columnsDiscover' }[type] || 'columnsChannel';
}
function applyActionFor_(type) {
  return { video: 'apply_video_columns', profile: 'apply_profile_columns', discover: 'apply_discover_columns' }[type] || 'apply_channel_columns';
}
function sheetLabelFor_(type) {
  return { video: 'Videos', profile: 'Profile', discover: 'Discover Results' }[type] || 'Channels';
}

function renderColumnsTab() {
  document.querySelectorAll('#youtubeTypeToggle .profile-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.coltype === activeColType);
  });
  const columns = state.locks.youtube[columnsKeyFor_(activeColType)];
  renderColumnGrid(document.getElementById('youtubeColGrid'), columns, { editable: true, indicatorId: 'youtubeAutosave' });
  updateLockPill(document.getElementById('youtubeLockPill'), state.locks.youtube, sheetLabelFor_(activeColType));
  document.getElementById('youtubeSheetLabel').textContent = sheetLabelFor_(activeColType);
  document.getElementById('youtubeApplyBtn').textContent = 'Apply to ' + sheetLabelFor_(activeColType) + ' sheet';
}
document.querySelectorAll('#youtubeTypeToggle .profile-chip').forEach((btn) => {
  btn.onclick = () => { activeColType = btn.dataset.coltype; renderColumnsTab(); };
});
document.getElementById('youtubeLockPill').onclick = () => openLockModal('youtube');
document.getElementById('youtubeAddColBtn').onclick = () => {
  const key = columnsKeyFor_(activeColType);
  state.locks.youtube[key].push('');
  renderColumnGrid(document.getElementById('youtubeColGrid'), state.locks.youtube[key], { editable: true, indicatorId: 'youtubeAutosave' });
  autoSave('youtubeAutosave');
};
document.getElementById('youtubeApplyBtn').onclick = () => {
  document.getElementById('applyColumnsStatus').className = 'status';
  document.getElementById('applyColumnsHint').textContent =
    'This reorders your real ' + sheetLabelFor_(activeColType) + ' sheet\'s columns to match what\'s shown here, ' +
    'and hides any column you removed (nothing is deleted — hidden columns can be unhidden anytime in Sheets). ' +
    'Anyone else viewing this sheet will see the new layout too.';
  document.getElementById('applyColumnsModal').classList.add('open');
};
document.getElementById('applyColumnsCancel').onclick = () => document.getElementById('applyColumnsModal').classList.remove('open');
document.getElementById('applyColumnsConfirm').onclick = async () => {
  const lock = state.locks.youtube;
  const type = activeColType;
  const status = document.getElementById('applyColumnsStatus');
  if (!lock.locked || !lock.url || !lock.secret) {
    status.className = 'status err'; status.textContent = 'Lock a worksheet for YouTube first.';
    return;
  }
  status.className = 'status'; status.textContent = 'Applying…'; status.style.display = 'block'; status.style.color = 'var(--ink-500)';
  try {
    const resp = await fetch(lock.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: lock.secret, action: applyActionFor_(type), columns: lock[columnsKeyFor_(type)].filter((c) => c && c.trim()) })
    });
    const data = await resp.json();
    if (!data.ok) { status.className = 'status err'; status.textContent = data.error || 'Could not apply the layout.'; return; }
    status.className = 'status ok'; status.textContent = 'Applied — your ' + sheetLabelFor_(type) + ' sheet now matches this layout.';
    setTimeout(() => document.getElementById('applyColumnsModal').classList.remove('open'), 1200);
  } catch (e) {
    status.className = 'status err'; status.textContent = 'Could not reach your worksheet: ' + e.message;
  }
};

function updateLockPill(pillEl, lock, defaultLabel) {
  const icon = pillEl.querySelector('.lock-icon');
  const label = pillEl.querySelector('.lock-label');
  pillEl.classList.toggle('locked', !!lock.locked);
  if (lock.locked) {
    icon.innerHTML = ICONS.lockClosed;
    label.textContent = (lock.name ? lock.name + ': ' : '') + (lock.tab || defaultLabel || 'Prospects');
  } else {
    icon.innerHTML = ICONS.lockOpen;
    label.textContent = 'Choose worksheet';
  }
}

// ==================================================================
// Other Platforms tab
// ==================================================================
function renderOtherTab() {
  const row = document.getElementById('profileRow');
  row.innerHTML = '';
  state.locks.other.forEach((p) => {
    const chip = document.createElement('button');
    chip.className = 'profile-chip' + (p.id === activeOtherProfileId ? ' active' : '');
    chip.textContent = p.name;
    chip.onclick = () => { activeOtherProfileId = p.id; renderOtherTab(); };
    row.appendChild(chip);
  });
  const addChip = document.createElement('button');
  addChip.className = 'profile-chip add-new';
  addChip.textContent = '+ Add platform';
  addChip.onclick = () => openAddPlatformModal();
  row.appendChild(addChip);

  const hasProfiles = state.locks.other.length > 0;
  document.getElementById('otherEmptyState').style.display = hasProfiles ? 'none' : 'block';
  row.style.display = hasProfiles ? 'flex' : 'none';

  if (hasProfiles && !state.locks.other.find((p) => p.id === activeOtherProfileId)) {
    activeOtherProfileId = state.locks.other[0].id;
  }
  const profile = state.locks.other.find((p) => p.id === activeOtherProfileId);
  document.getElementById('otherProfileBody').style.display = profile ? 'block' : 'none';
  if (!profile) return;

  document.getElementById('otherProfileNameLabel').textContent = profile.name;
  renderColumnGrid(document.getElementById('otherColGrid'), profile.columns, { editable: true, indicatorId: 'otherAutosave' });
  updateLockPill(document.getElementById('otherLockPill'), profile, 'Prospects');
}
document.getElementById('addFirstProfileBtn').onclick = () => openAddPlatformModal();
document.getElementById('otherLockPill').onclick = () => openLockModal(activeOtherProfileId);
document.getElementById('otherAddColBtn').onclick = () => {
  const profile = state.locks.other.find((p) => p.id === activeOtherProfileId);
  profile.columns.push('');
  renderColumnGrid(document.getElementById('otherColGrid'), profile.columns, { editable: true, indicatorId: 'otherAutosave' });
  autoSave('otherAutosave');
};
document.getElementById('deleteProfileLink').onclick = async () => {
  if (!confirm('Delete this platform? Its column setup and worksheet lock will be removed.')) return;
  state.locks.other = state.locks.other.filter((p) => p.id !== activeOtherProfileId);
  activeOtherProfileId = null;
  await saveLocks();
  renderOtherTab();
};

function openAddPlatformModal() {
  document.getElementById('newPlatformName').value = '';
  document.getElementById('addPlatformStatus').className = 'status';
  document.getElementById('addPlatformModal').classList.add('open');
}
document.getElementById('addPlatformCancel').onclick = () => document.getElementById('addPlatformModal').classList.remove('open');
document.getElementById('addPlatformConfirm').onclick = async () => {
  const name = document.getElementById('newPlatformName').value.trim();
  const status = document.getElementById('addPlatformStatus');
  if (!name) { status.className = 'status err'; status.textContent = 'Give it a name first.'; return; }
  if (state.locks.other.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    status.className = 'status err'; status.textContent = 'A platform with that name already exists.'; return;
  }
  const profile = {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, locked: false, url: '', secret: '', tab: '', columns: CHANNEL_DEFAULT_COLUMNS.slice()
  };
  state.locks.other.push(profile);
  activeOtherProfileId = profile.id;
  await saveLocks();
  document.getElementById('addPlatformModal').classList.remove('open');
  renderOtherTab();
};

// ==================================================================
// Lock target modal (shared by YouTube + each Other-Platform profile)
// ==================================================================
let lockModalTarget = null; // 'youtube' or a profile id

function getLockObject(target) {
  return target === 'youtube' ? state.locks.youtube : state.locks.other.find((p) => p.id === target);
}

function openLockModal(target) {
  lockModalTarget = target;
  const lock = getLockObject(target);
  document.getElementById('lockModalTitle').textContent = lock.locked ? 'Change worksheet' : 'Choose worksheet';
  document.getElementById('lockCode').value = '';
  document.getElementById('lockUrl').value = lock.url || '';
  document.getElementById('lockSecret').value = lock.secret || '';
  document.getElementById('lockTabSelect').innerHTML = '<option value="">Prospects (default)</option>';
  document.getElementById('lockTabHint').textContent = target === 'youtube'
    ? 'Only applies to notes and unrecognized links. Channel and video links always go straight to your Channels/Videos sheets, never here.'
    : 'Everything captured under this platform lands here, since there\'s no analysis pipeline yet to route it anywhere else.';
  document.getElementById('lockModalStatus').className = 'status';
  document.getElementById('lockModalConfirm').textContent = lock.locked ? 'Unlock' : 'Test & Lock';
  document.getElementById('lockModal').classList.add('open');
}
document.getElementById('lockModalCancel').onclick = () => document.getElementById('lockModal').classList.remove('open');

// Connection-code paste — decodes Koli Settings' single generated string
// (base64 JSON {u,s}) into the URL + secret fields, so most people never
// type either one by hand.
document.getElementById('lockCodeDecode').onclick = () => {
  const status = document.getElementById('lockModalStatus');
  const raw = document.getElementById('lockCode').value.trim();
  if (!raw) { status.className = 'status err'; status.textContent = 'Paste a connection code first.'; return; }
  try {
    const decoded = JSON.parse(atob(raw));
    if (!decoded.u || !decoded.s) throw new Error('missing fields');
    document.getElementById('lockUrl').value = decoded.u;
    document.getElementById('lockSecret').value = decoded.s;
    status.className = 'status ok'; status.textContent = 'Filled in — review below, then Test & Lock.';
  } catch (e) {
    status.className = 'status err'; status.textContent = 'That doesn\'t look like a valid connection code.';
  }
};

document.getElementById('lockModalConfirm').onclick = async () => {
  const lock = getLockObject(lockModalTarget);
  const status = document.getElementById('lockModalStatus');

  if (lock.locked) {
    lock.locked = false;
    await saveLocks();
    document.getElementById('lockModal').classList.remove('open');
    refreshAllPanels();
    return;
  }

  const url = document.getElementById('lockUrl').value.trim();
  const secret = document.getElementById('lockSecret').value.trim();
  const tab = document.getElementById('lockTabSelect').value;
  if (!url || !secret) { status.className = 'status err'; status.textContent = 'URL and secret are both required.'; return; }

  const requestBody = { secret, action: 'list_tabs' };
  status.className = 'status'; status.textContent = 'Testing…'; status.style.display = 'block'; status.style.color = 'var(--ink-500)';
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(requestBody) });
    const rawText = await resp.text();
    let data;
    try { data = JSON.parse(rawText); } catch (parseErr) {
      status.className = 'status err';
      status.innerHTML = 'Got a non-JSON response (likely an error page, not Koli):<br><textarea readonly style="width:100%;height:70px;margin-top:6px;font-size:10px;">' + escapeHtml(rawText.slice(0, 500)) + '</textarea>';
      return;
    }
    if (!data.ok) {
      status.className = 'status err';
      status.innerHTML = 'Sent: <code>' + escapeHtml(JSON.stringify(requestBody)) + '</code><br>Got back: <code>' + escapeHtml(rawText) + '</code>';
      return;
    }

    lock.url = url; lock.secret = secret; lock.tab = tab; lock.locked = true;
    await saveLocks();
    status.className = 'status ok'; status.textContent = 'Locked.';
    setTimeout(() => document.getElementById('lockModal').classList.remove('open'), 500);
    refreshAllPanels();
  } catch (e) {
    status.className = 'status err'; status.textContent = 'Could not reach that URL: ' + e.message;
  }
};

document.getElementById('lockSecret').addEventListener('blur', async () => {
  const url = document.getElementById('lockUrl').value.trim();
  const secret = document.getElementById('lockSecret').value.trim();
  const status = document.getElementById('lockModalStatus');
  if (!url || !secret) return;
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret, action: 'list_tabs' }) });
    const rawText = await resp.text();
    const data = JSON.parse(rawText);
    if (!data.ok || !Array.isArray(data.tabs)) {
      status.className = 'status err';
      status.innerHTML = 'Could not load real tab names — dropdown will stay on the default. Got back: <code>' + escapeHtml(rawText) + '</code>';
      return;
    }
    const select = document.getElementById('lockTabSelect');
    const current = select.value;
    select.innerHTML = '<option value="">Prospects (default)</option>';
    data.tabs.filter((t) => t !== 'Prospects').forEach((t) => {
      const opt = document.createElement('option'); opt.value = t; opt.textContent = t; select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  } catch (e) {
    status.className = 'status err';
    status.textContent = 'Could not check tab names: ' + e.message;
  }
});

// ==================================================================
// Settings screen
// ==================================================================
function renderSettingsScreen() {
  const yt = state.locks.youtube;
  document.getElementById('ytSummaryTarget').textContent = yt.locked ? (yt.tab || 'Channels/Videos') : 'Not connected';
  document.getElementById('ytSummaryEdit').onclick = () => {
    showScreen('home');
    document.querySelector('.tab[data-tab="columns"]').click();
    openLockModal('youtube');
  };

  const wrap = document.getElementById('otherLocksSummary');
  wrap.innerHTML = '';
  state.locks.other.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'lock-summary-row';
    row.innerHTML = '<div><div class="name">' + escapeHtml(p.name) + '</div><div class="target">' +
      (p.locked ? escapeHtml(p.tab || 'Prospects') : 'Not connected') + '</div></div>';
    const btn = document.createElement('button');
    btn.textContent = 'Edit';
    btn.onclick = () => { showScreen('home'); document.querySelector('.tab[data-tab="other"]').click(); activeOtherProfileId = p.id; renderOtherTab(); openLockModal(p.id); };
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}

// ==================================================================
// Log (Activity) tab
// ==================================================================
async function renderLogTab() {
  const { koliLog } = await chrome.storage.local.get('koliLog');
  const log = koliLog || [];
  const listEl = document.getElementById('logList');
  const pagerEl = document.getElementById('pager');

  if (!log.length) {
    listEl.innerHTML = '<div class="log-empty">Nothing sent yet — right-click a link or selection on any page, or use Home\'s quick-send/Profile/Discover.</div>';
    pagerEl.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(log.length / LOG_PAGE_SIZE);
  logPage = Math.min(logPage, totalPages - 1);
  const pageItems = log.slice(logPage * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE + LOG_PAGE_SIZE);

  listEl.innerHTML = pageItems.map((entry, i) => {
    const globalIndex = logPage * LOG_PAGE_SIZE + i;
    const name = entry.resolvedName || entry.pageTitle || entry.value || 'Untitled';
    const sub = (entry.profileLabel || entry.type || '') + ' · ' + timeAgo(entry.timestamp);
    const rowClass = entry.success ? '' : 'err';
    const viewBtn = (entry.success && entry.link) ? '<button class="log-view" data-idx="' + globalIndex + '" title="Open">' + ICONS.eye + '</button>' : '';
    const errorLine = (!entry.success && entry.message)
      ? '<div style="font-size:10.5px;color:var(--error);margin-top:2px;">' + escapeHtml(entry.message) + '</div>'
      : (!entry.success ? '<div style="font-size:10.5px;color:var(--error);margin-top:2px;font-style:italic;">No error message was returned</div>' : '');
    const statusIcon = '<span class="lrow-status ' + (entry.success ? 'ok' : 'err') + '">' + (entry.success ? ICONS.checkCircle : ICONS.errorCircle) + '</span>';
    return '<div class="lrow ' + rowClass + '">' +
      '<div class="lrow-l" style="flex-direction:column;align-items:flex-start;">' +
      '<div style="display:flex;align-items:center;gap:6px;">' + statusIcon + '<b>' + escapeHtml(name) + '</b><span> ' + escapeHtml(sub) + '</span></div>' +
      errorLine +
      '</div>' +
      '<div class="lrow-r">' + viewBtn + '<button class="log-del" data-idx="' + globalIndex + '" title="Delete">' + ICONS.trash + '</button></div>' +
      '</div>';
  }).join('');

  listEl.querySelectorAll('.log-view').forEach((btn) => {
    btn.onclick = async () => {
      const { koliLog } = await chrome.storage.local.get('koliLog');
      chrome.tabs.create({ url: koliLog[Number(btn.dataset.idx)].link });
    };
  });
  listEl.querySelectorAll('.log-del').forEach((btn) => {
    btn.onclick = async () => {
      const { koliLog } = await chrome.storage.local.get('koliLog');
      koliLog.splice(Number(btn.dataset.idx), 1);
      await chrome.storage.local.set({ koliLog });
      renderLogTab();
    };
  });

  if (totalPages <= 1) { pagerEl.style.display = 'none'; return; }
  pagerEl.style.display = 'flex';
  pagerEl.innerHTML = '';
  const addPageBtn = (label, page, disabled) => {
    const span = document.createElement('span');
    span.textContent = label;
    span.className = disabled ? 'pge-disabled' : (page === logPage ? 'pga' : '');
    if (!disabled && page !== logPage) span.onclick = () => { logPage = page; renderLogTab(); };
    pagerEl.appendChild(span);
  };
  addPageBtn('«', logPage - 1, logPage === 0);
  const pages = pageNumbersToShow(logPage, totalPages);
  pages.forEach((p) => p === '…' ? pagerEl.appendChild(Object.assign(document.createElement('span'), { textContent: '…' })) : addPageBtn(String(p + 1), p, false));
  addPageBtn('»', logPage + 1, logPage >= totalPages - 1);
}

function pageNumbersToShow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current]);
  if (current > 0) pages.add(current - 1);
  if (current < total - 1) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push('…');
    withGaps.push(p);
  });
  return withGaps;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function refreshAllPanels() {
  renderColumnsTab();
  renderOtherTab();
  refreshHomeTab();
}

// React live as the person switches or navigates tabs while the panel
// stays open — this is the whole point of a persistent side panel over a
// popup that closed (and lost this state) on every focus change.
chrome.tabs.onActivated.addListener(() => {
  if (document.getElementById('screen-home').classList.contains('active') &&
      document.getElementById('panel-home').style.display !== 'none') {
    refreshCurrentPageCard();
  }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.active) return;
  if (document.getElementById('screen-home').classList.contains('active') &&
      document.getElementById('panel-home').style.display !== 'none') {
    refreshCurrentPageCard();
  }
});

// ---------- Init ----------
(async () => {
  await loadState();
  refreshAllPanels();
})();
