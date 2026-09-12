/**
 * publishService.gs
 * Koli's own answer to "publish a canvas without exposing the sheet."
 * Google's own Sheets Canvas (Insert > Create a canvas) does something
 * similar but is paywalled to Business+/AI Pro-Ultra plans, has no
 * documented way to share a canvas without granting spreadsheet access,
 * and has no Apps Script/API surface to control it at all -- so it can't
 * be generated from a menu action or automated the way this is.
 *
 * The mechanism: render selected rows into a real, static HTML page at
 * publish time (a snapshot, not a live query -- nobody who opens the
 * link ever touches the actual spreadsheet), save that page as a file
 * this script creates (drive.file scope, same as every other export),
 * and serve it back through the existing Web App's doGet under an
 * unguessable token. No new infrastructure: reuses the Web App
 * deployment that already exists for the browser extension.
 */

const PUBLISHED_PAGE_HEADERS = ['Token', 'File ID', 'Title', 'Type', 'Created Date', 'Row Count'];

function publishSelectedChannelsAsPage() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Publish as Page'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.CHANNELS) {
    ui.alert('Select one or more rows on the Channels sheet first, then run this again.');
    return;
  }
  const rows = getActiveChannelRows_();
  if (!rows.length) { ui.alert('Select one or more data rows on Channels first, then run this again.'); return; }

  const webAppUrl = getProp_(PROP_KEYS.WEB_APP_URL, '');
  if (!webAppUrl) {
    ui.alert('Set your Web App URL in Koli > Settings first (the same one the browser extension connects to) -- published pages are served through it.');
    return;
  }

  const titleResp = ui.prompt('Publish as Page', 'Title for this page (e.g. "Q1 Skincare Shortlist" or leave blank for a default):', ui.ButtonSet.OK_CANCEL);
  if (titleResp.getSelectedButton() !== ui.Button.OK) return;
  const title = titleResp.getResponseText().trim() || (rows.length === 1 ? 'Creator Profile' : 'Creator Shortlist');

  try {
    const channelsData = rows.map(function (row) { return getChannelRowData_(sheet, row); });
    const html = renderPublishedChannelsPage_(title, channelsData);
    const token = Utilities.getUuid().replace(/-/g, '');
    const fileId = savePublishedPageFile_(token, html, title);
    registerPublishedPage_(token, fileId, title, 'channels', channelsData.length);

    const shareUrl = webAppUrl + (webAppUrl.indexOf('?') === -1 ? '?' : '&') + 'p=' + token;
    showLinkDialog_(
      'Page published',
      '"' + title + '" (' + channelsData.length + ' creator(s)) is live at a link you can share with a brand -- ' +
      'they never see this spreadsheet, only the page itself. Use Koli > Export > Unpublish a Page to take it down later.',
      shareUrl, 'Open Page'
    );
  } catch (e) {
    ui.alert('Could not publish: ' + errMsg_(e));
  }
}

function savePublishedPageFile_(token, html, title) {
  const folderId = getOrCreatePublishedPagesFolder_();
  const blob = Utilities.newBlob(html, 'text/html', token + '.html');
  const file = Drive.Files.create({ name: 'Published: ' + title + ' (' + token.slice(0, 8) + ')', parents: [folderId] }, blob);
  return file.id;
}

function getOrCreatePublishedPagesFolder_() {
  const storedId = getProp_(PROP_KEYS.PUBLISHED_PAGES_FOLDER_ID, '');
  if (storedId) {
    try {
      const existing = Drive.Files.get(storedId, { fields: 'id, trashed' });
      if (!existing.trashed) return existing.id;
    } catch (e) { /* stored folder no longer reachable: fall through and recreate */ }
  }
  const folder = Drive.Files.create({ name: 'Koli Published Pages', mimeType: 'application/vnd.google-apps.folder' });
  PropertiesService.getDocumentProperties().setProperty(PROP_KEYS.PUBLISHED_PAGES_FOLDER_ID, folder.id);
  return folder.id;
}

/** A sheet, not Script Properties, for the token->file lookup: Properties caps out at 500KB total across every key, which a growing list of publishes would eventually hit. A hidden sheet has no such ceiling. */
function registerPublishedPage_(token, fileId, title, type, rowCount) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.PUBLISHED_PAGES, PUBLISHED_PAGE_HEADERS);
  sheet.appendRow([token, fileId, sanitizeCellText_(title), type, new Date(), rowCount]);
}

function lookupPublishedPage_(token) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PUBLISHED_PAGES);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLISHED_PAGE_HEADERS.length).getValues();
  const match = data.find(function (r) { return r[0] === token; });
  return match ? { token: match[0], fileId: match[1], title: match[2], type: match[3] } : null;
}

function unpublishPageDialog() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PUBLISHED_PAGES);
  if (!sheet || sheet.getLastRow() < 2) { ui.alert('No published pages yet.'); return; }
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLISHED_PAGE_HEADERS.length).getValues();
  const list = data.map(function (r, i) {
    return (i + 1) + '. ' + r[2] + ' (' + r[3] + ', ' + r[5] + ' row(s), published ' + Utilities.formatDate(new Date(r[4]), getTimezone_(), 'MMM d') + ')';
  }).join('\n');
  const resp = ui.prompt('Unpublish a Page', 'Which one? Enter its number:\n\n' + list, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const idx = parseInt(resp.getResponseText().trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= data.length) { ui.alert('Not a valid number from the list.'); return; }

  try {
    Drive.Files.remove(data[idx][1]);
  } catch (e) { /* file already gone: still remove the lookup row below */ }
  sheet.deleteRow(idx + 2);
  ui.alert('Unpublished: the link no longer works.');
}

/**
 * Client-facing, brand-safe fields only -- same exclusion rule every
 * other brand-facing export in Koli already follows (Creator One-Pager,
 * Brand View): no Outreach status, no internal Notes, no IDs.
 */
function renderPublishedChannelsPage_(title, channels) {
  const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const cards = channels.map(function (c) {
    return '<div class="card">' +
      '<div class="card-head"><div class="grade grade-' + esc((c.grade || '?').toLowerCase()) + '">' + esc(c.grade || '?') + '</div>' +
      '<div><div class="name">' + esc(c.name) + '</div><div class="niche">' + esc(c.niche) + '</div></div></div>' +
      '<div class="stats">' +
      '<div><b>' + esc(c.subs) + '</b><span>Subscribers</span></div>' +
      '<div><b>' + esc(typeof c.avgViews === 'number' ? c.avgViews.toLocaleString() : c.avgViews) + '</b><span>Avg views</span></div>' +
      '<div><b>' + esc(c.engagementPct || 'N/A') + '</b><span>Engagement</span></div>' +
      '<div><b>' + esc(typeof c.postsPerMonth === 'number' ? c.postsPerMonth.toFixed(1) : c.postsPerMonth) + '</b><span>Posts/mo</span></div>' +
      '</div>' +
      (c.suggestedRate ? '<div class="rate">Suggested rate: <b>' + esc(c.suggestedRate) + '</b></div>' : '') +
      '</div>';
  }).join('\n');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title><style>' +
    'body{font-family:"Google Sans",Roboto,Arial,sans-serif;background:#F7F6F3;color:#202124;margin:0;padding:40px 20px;}' +
    '.wrap{max-width:960px;margin:0 auto;}' +
    'h1{font-size:26px;margin:0 0 6px;}' +
    '.sub{color:#5f6368;font-size:13px;margin-bottom:32px;}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}' +
    '.card{background:#fff;border:1px solid #e4e1d8;border-radius:14px;padding:18px;}' +
    '.card-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;}' +
    '.grade{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;background:#2E9A52;flex-shrink:0;}' +
    '.grade-d,.grade-f{background:#D93025;}.grade-c{background:#F9AB00;}' +
    '.name{font-weight:700;font-size:15px;}.niche{color:#5f6368;font-size:12px;}' +
    '.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px dashed #e4e1d8;padding-top:12px;}' +
    '.stats div{display:flex;flex-direction:column;}.stats b{font-size:15px;}.stats span{font-size:10.5px;color:#5f6368;}' +
    '.rate{margin-top:12px;padding-top:12px;border-top:1px dashed #e4e1d8;font-size:12.5px;}.rate b{color:#188038;}' +
    '.foot{margin-top:40px;font-size:11px;color:#9a9c8d;text-align:center;}' +
    '</style></head><body><div class="wrap">' +
    '<h1>' + esc(title) + '</h1>' +
    '<div class="sub">' + channels.length + ' creator(s) &middot; ' + Utilities.formatDate(new Date(), 'Etc/UTC', 'MMM d, yyyy') + '</div>' +
    '<div class="grid">' + cards + '</div>' +
    '<div class="foot">Shared via Koli</div>' +
    '</div></body></html>';
}
