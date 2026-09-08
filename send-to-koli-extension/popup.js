/**
 * popup.js
 * Storage model (chrome.storage.sync, key `locks`):
 *   { youtube: {locked,url,secret,tab,columns}, other: [{id,name,locked,url,secret,tab,columns}] }
 * Activity log lives separately in chrome.storage.local (key `koliLog`),
 * written by background.js — this file only reads/paginates/deletes it.
 */

const YOUTUBE_DEFAULT_COLUMNS = [
  'Status', 'Channel', 'ID', 'Niche', 'Posts/Mo', 'Contact', 'Subs', 'Avg Views',
  'Post Times', 'Grade', 'Outreach', 'Last Contact', 'Notes', 'Report'
];

let state = { locks: { youtube: null, other: [] } };
let activeOtherProfileId = null;
let logPage = 0;
const LOG_PAGE_SIZE = 5;

async function loadState() {
  const { locks } = await chrome.storage.sync.get('locks');
  state.locks = locks || { youtube: null, other: [] };
  if (!state.locks.youtube) {
    state.locks.youtube = { locked: false, url: '', secret: '', tab: '', columns: YOUTUBE_DEFAULT_COLUMNS.slice() };
  }
  if (!state.locks.other) state.locks.other = [];
}
async function saveLocks() {
  await chrome.storage.sync.set({ locks: state.locks });
}

// ---------- Tab switching ----------
document.querySelectorAll('#mainTabs .tab').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#mainTabs .tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['youtube', 'other', 'log'].forEach((name) => {
      document.getElementById('panel-' + name).style.display = name === btn.dataset.tab ? 'block' : 'none';
    });
    if (btn.dataset.tab === 'log') renderLogTab();
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

// ---------- Column grid rendering with drag-to-reorder ----------
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
    bin.innerHTML = '🗑';
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

// Debounced auto-save — cheap chrome.storage writes, no reason to make
// the person click a button just to persist a drag or a delete. Flashes
// a small "Saved" indicator briefly so the save is still visible without
// needing its own button to compete for attention.
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

// ---------- YouTube tab ----------
function renderYoutubeTab() {
  renderColumnGrid(document.getElementById('youtubeColGrid'), state.locks.youtube.columns, { editable: true, indicatorId: 'youtubeAutosave' });
  updateLockPill(document.getElementById('youtubeLockPill'), state.locks.youtube);
}
document.getElementById('youtubeLockPill').onclick = () => openLockModal('youtube');
document.getElementById('youtubeAddColBtn').onclick = () => {
  state.locks.youtube.columns.push('');
  renderColumnGrid(document.getElementById('youtubeColGrid'), state.locks.youtube.columns, { editable: true, indicatorId: 'youtubeAutosave' });
  autoSave('youtubeAutosave');
};
document.getElementById('youtubeApplyBtn').onclick = () => {
  document.getElementById('applyColumnsStatus').className = 'status';
  document.getElementById('applyColumnsModal').classList.add('open');
};
document.getElementById('applyColumnsCancel').onclick = () => document.getElementById('applyColumnsModal').classList.remove('open');
document.getElementById('applyColumnsConfirm').onclick = async () => {
  const lock = state.locks.youtube;
  const status = document.getElementById('applyColumnsStatus');
  if (!lock.locked || !lock.url || !lock.secret) {
    status.className = 'status err'; status.textContent = 'Lock a worksheet for YouTube first.';
    return;
  }
  status.className = 'status'; status.textContent = 'Applying…'; status.style.display = 'block'; status.style.color = 'var(--text-muted)';
  try {
    const resp = await fetch(lock.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: lock.secret, action: 'apply_channel_columns', columns: lock.columns.filter((c) => c && c.trim()) })
    });
    const data = await resp.json();
    if (!data.ok) { status.className = 'status err'; status.textContent = data.error || 'Could not apply the layout.'; return; }
    status.className = 'status ok'; status.textContent = 'Applied — your worksheet now matches this layout.';
    setTimeout(() => document.getElementById('applyColumnsModal').classList.remove('open'), 1200);
  } catch (e) {
    status.className = 'status err'; status.textContent = 'Could not reach your worksheet: ' + e.message;
  }
};

function updateLockPill(pillEl, lock) {
  const icon = pillEl.querySelector('.lock-icon');
  const label = pillEl.querySelector('.lock-label');
  pillEl.classList.toggle('locked', !!lock.locked);
  if (lock.locked) {
    icon.textContent = '🔒';
    label.textContent = (lock.name ? lock.name + ': ' : '') + (lock.tab || 'Prospects');
  } else {
    icon.textContent = '🔓';
    label.textContent = 'Choose worksheet';
  }
}

// ---------- Other Platforms tab ----------
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
  updateLockPill(document.getElementById('otherLockPill'), profile);
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

// ---------- Add Platform modal ----------
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
    name, locked: false, url: '', secret: '', tab: '', columns: YOUTUBE_DEFAULT_COLUMNS.slice()
  };
  state.locks.other.push(profile);
  activeOtherProfileId = profile.id;
  await saveLocks();
  document.getElementById('addPlatformModal').classList.remove('open');
  renderOtherTab();
};

// ---------- Lock target modal (shared by YouTube + each Other-Platform profile) ----------
let lockModalTarget = null; // 'youtube' or a profile id

function getLockObject(target) {
  return target === 'youtube' ? state.locks.youtube : state.locks.other.find((p) => p.id === target);
}

function openLockModal(target) {
  lockModalTarget = target;
  const lock = getLockObject(target);
  document.getElementById('lockModalTitle').textContent = lock.locked ? 'Change worksheet' : 'Choose worksheet';
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
  status.className = 'status'; status.textContent = 'Testing…'; status.style.display = 'block'; status.style.color = 'var(--text-muted)';
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
      // TEMPORARY — shows exactly what was sent and exactly what came back,
      // so this is diagnosable by reading the screen, no DevTools needed.
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

// Populate the tab dropdown once a URL+secret are entered, same pattern as options.html.
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
      status.innerHTML = 'Could not load real tab names \u2014 dropdown will stay on the default. Got back: <code>' + escapeHtml(rawText) + '</code>';
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

// ---------- Settings screen ----------
function renderSettingsScreen() {
  const yt = state.locks.youtube;
  document.getElementById('ytSummaryTarget').textContent = yt.locked ? (yt.tab || 'Prospects') : 'Not connected';
  document.getElementById('ytSummaryEdit').onclick = () => { showScreen('home'); document.querySelector('.tab[data-tab="youtube"]').click(); openLockModal('youtube'); };

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

// ---------- Log tab ----------
async function renderLogTab() {
  const { koliLog } = await chrome.storage.local.get('koliLog');
  const log = koliLog || [];
  const listEl = document.getElementById('logList');
  const pagerEl = document.getElementById('pager');

  if (!log.length) {
    listEl.innerHTML = '<div class="log-empty">Nothing sent yet — right-click a link or selection on any page to get started.</div>';
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
    const viewBtn = (entry.success && entry.link) ? '<button class="log-view" data-idx="' + globalIndex + '" title="Open">👁</button>' : '';
    const errorLine = (!entry.success && entry.message)
      ? '<div style="font-size:10.5px;color:var(--error);margin-top:2px;">' + escapeHtml(entry.message) + '</div>'
      : (!entry.success ? '<div style="font-size:10.5px;color:var(--error);margin-top:2px;font-style:italic;">No error message was returned</div>' : '');
    return '<div class="lrow ' + rowClass + '">' +
      '<div class="lrow-l" style="flex-direction:column;align-items:flex-start;">' +
      '<div><span>' + (entry.success ? '✅' : '❌') + '</span> <b>' + escapeHtml(name) + '</b><span> ' + escapeHtml(sub) + '</span></div>' +
      errorLine +
      '</div>' +
      '<div class="lrow-r">' + viewBtn + '<button class="log-del" data-idx="' + globalIndex + '" title="Delete">🗑</button></div>' +
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
  renderYoutubeTab();
  renderOtherTab();
}

// ---------- Init ----------
(async () => {
  await loadState();
  refreshAllPanels();
})();
