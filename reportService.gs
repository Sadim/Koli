/**
 * reportService.gs
 * Creator One-Pager: one Channels row -> a pitch-ready PDF (plus an
 * editable Doc, in case you want to tweak before sending), saved to a
 * "Koli Reports" folder in Drive, linked back into the Report column.
 *
 * Deliberately excludes Outreach status and internal Notes — this
 * document is meant to go to a brand, not stay in-house. If you want an
 * internal-facing version with that data included later, that's a
 * different template, not a toggle on this one.
 */

function exportCreatorOnePager() {
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first (click any cell in that row), then run this again.');
    return;
  }
  try {
    const result = buildCreatorOnePager_(row);
    writeReportLink_(row, result.pdfUrl);
    showLinkDialog_(
      'One-pager ready',
      result.channelName + ' — PDF and an editable Doc were saved to the "Koli Reports" folder in Drive. ' +
      'A link is also in the Report column on this row.',
      result.pdfUrl, 'Open PDF'
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Could not generate the one-pager: ' + e.message);
  }
}

function buildCreatorOnePager_(row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(sheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID — run Channel Analysis on it first.');

  const channel = getChannelData(rowData.channelId); // cache-first, cheap if already analyzed
  const aboutSummary = getChannelAboutSummaryCached_(rowData.channelId, channel.description, channel.recentVideos);
  const sponsors = getSponsorsForChannel(rowData.channelId);

  const folder = getOrCreateReportsFolder_();
  const baseName = rowData.name + ' - Creator Profile';

  const doc = DocumentApp.create(baseName);
  const body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(50).setMarginRight(50);

  body.appendParagraph(rowData.name).setHeading(DocumentApp.ParagraphHeading.TITLE);

  const linkPara = body.appendParagraph(channelUrl_(rowData.channelId));
  linkPara.editAsText().setLinkUrl(channelUrl_(rowData.channelId));

  const datePara = body.appendParagraph('Generated ' + Utilities.formatDate(new Date(), getTimezone_(), 'MMMM d, yyyy'));
  datePara.editAsText().setForegroundColor('#5f6368');

  body.appendParagraph('Overview').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const table = body.appendTable([
    ['Niche', String(rowData.niche || 'n/a')],
    ['Subscribers', String(rowData.subs || 'n/a')],
    ['Posts / Month', String(rowData.postsPerMonth || 'n/a')],
    ['Contact', String(rowData.email || 'n/a')]
  ]);
  for (let i = 0; i < table.getNumRows(); i++) {
    table.getRow(i).getCell(0).getChild(0).asParagraph().editAsText().setBold(true);
  }

  body.appendParagraph('About').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(aboutSummary || 'No summary available yet — run Channel Analysis on this row first.');

  body.appendParagraph('Known Sponsor Activity').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (sponsors.length) {
    sponsors.slice(0, 8).forEach(function (s) {
      body.appendListItem(s.brand + ' — ' + s.mentions + ' mention(s), most recent ' + formatDateShort_(s.lastSeen))
        .setGlyphType(DocumentApp.GlyphType.BULLET);
    });
  } else {
    body.appendParagraph('No sponsor activity detected yet.');
  }

  doc.saveAndClose();
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(folder);

  const pdfBlob = docFile.getAs('application/pdf');
  const pdfFile = folder.createFile(pdfBlob);
  pdfFile.setName(baseName + '.pdf');

  return { channelName: rowData.name, docUrl: docFile.getUrl(), pdfUrl: pdfFile.getUrl() };
}

function exportDealMemo() {
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first (click any cell in that row), then run this again.');
    return;
  }
  try {
    const result = buildDealMemo_(row);
    showLinkDialog_(
      'Draft deal memo ready',
      result.channelName + ' — an editable Doc was saved to the "Koli Reports" folder in Drive. ' +
      'It\'s a starting draft, not a finished contract — have it reviewed before sending.',
      result.docUrl, 'Open Doc'
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Could not generate the deal memo: ' + e.message);
  }
}

function buildDealMemo_(row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(sheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID — run Channel Analysis on it first.');

  const folder = getOrCreateReportsFolder_();
  const baseName = rowData.name + ' - Draft Deal Memo';
  const doc = DocumentApp.create(baseName);
  const body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(50).setMarginRight(50);

  const warningPara = body.appendParagraph('DRAFT — NOT LEGAL ADVICE — HAVE COUNSEL REVIEW BEFORE USE');
  warningPara.editAsText().setBold(true).setForegroundColor('#d93025');

  body.appendParagraph(rowData.name + ' — Creator Partnership Agreement').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Generated ' + Utilities.formatDate(new Date(), getTimezone_(), 'MMMM d, yyyy'))
    .editAsText().setForegroundColor('#5f6368');

  body.appendParagraph('Parties').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Between [Brand/Agency Name] ("Brand") and ' + rowData.name + ' ("Creator"), contactable at ' +
    (rowData.email && rowData.email !== 'Not found' ? rowData.email : '[Creator contact email]') + '.');

  body.appendParagraph('Deliverables').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['[ ] 1x dedicated video', '[ ] 1x integrated mention (60-90 sec)', '[ ] 1x Instagram/social post', '[ ] Other: ____________'].forEach(function (item) {
    body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.HOLLOW_BULLET);
  });

  body.appendParagraph('Rate').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Starting point based on ' + (rowData.subs || 'n/a') +
    ' subscribers and this niche\'s typical rates — a negotiation anchor, not a quote. Final rate: [____].');

  body.appendParagraph('Payment Terms').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('[Default suggestion: 50% upon acceptance of brief, 50% upon publish. Edit as agreed.]');

  body.appendParagraph('Usage Rights').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('[Default suggestion: Brand may repost/boost the content on its own owned social channels for 6 months from publish date. Edit as agreed.]');

  body.appendParagraph('Exclusivity').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('[e.g. Creator agrees not to promote a directly competing brand for 30 days before/after publish. Edit or remove as agreed.]');

  body.appendParagraph('Disclosure Requirement').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Creator must clearly disclose the paid partnership per FTC guidelines (e.g. "#ad" or "Sponsored" ' +
    'stated in the video and/or on-screen, not buried in a description). This is general awareness, not legal advice — confirm current requirements with counsel.');

  doc.saveAndClose();
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(folder);

  return { channelName: rowData.name, docUrl: docFile.getUrl() };
}

/** Keeps report files next to the spreadsheet in Drive rather than scattered in "My Drive" root. */
/**
 * Creates the Reports folder once, remembers its ID, reuses it after —
 * avoids repeatedly searching Drive for it. On full `drive` scope for
 * now (a `drive.file` attempt broke live — DriveApp forces full `drive`
 * for most of its methods regardless of manifest scope; see ROADMAP.md).
 * Lands in the user's root Drive rather than next to the spreadsheet.
 */
function getOrCreateReportsFolder_() {
  const storedId = getProp_(PROP_KEYS.REPORTS_FOLDER_ID, '');
  if (storedId) {
    try { return DriveApp.getFolderById(storedId); }
    catch (e) { /* stored folder no longer reachable — fall through and recreate */ }
  }
  const folder = DriveApp.createFolder('Koli Reports');
  PropertiesService.getDocumentProperties().setProperty(PROP_KEYS.REPORTS_FOLDER_ID, folder.getId());
  return folder;
}

function formatDateShort_(date) {
  try { return Utilities.formatDate(new Date(date), getTimezone_(), 'MMM d, yyyy'); }
  catch (e) { return String(date); }
}

/**
 * A small modal with a real "Open" button (opens the document in a new
 * tab) alongside Close — SpreadsheetApp.getUi().alert() can't do this,
 * its button sets are fixed (OK/Cancel/Yes/No), no way to attach a URL
 * to one. Used anywhere a generated file's link should be one click away
 * instead of "close this, then go find it."
 */
function showLinkDialog_(title, message, url, buttonLabel) {
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const html =
    '<!DOCTYPE html><html><head><style>' +
    'body{font-family:\'Google Sans\',Roboto,Arial,sans-serif;padding:18px 20px;color:#202124;font-size:13px;margin:0;}' +
    'p{color:#5f6368;line-height:1.5;margin:0 0 20px 0;}' +
    '.actions{display:flex;gap:10px;justify-content:flex-end;}' +
    'a.btn-primary{background:#188038;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-weight:600;display:inline-block;}' +
    'a.btn-primary:hover{background:#0d652d;}' +
    'button.btn-secondary{background:#fff;border:1px solid #dadce0;color:#202124;padding:9px 18px;border-radius:8px;font-weight:600;cursor:pointer;}' +
    '</style></head><body>' +
    '<p>' + esc(message) + '</p>' +
    '<div class="actions">' +
    '<button class="btn-secondary" onclick="google.script.host.close()">Close</button>' +
    '<a class="btn-primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(buttonLabel || 'Open') + '</a>' +
    '</div></body></html>';
  const output = HtmlService.createHtmlOutput(html).setWidth(420).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(output, title);
}

/**
 * Performance Report: per-video Views/Likes/Eng%/Location/Age/Gender for
 * one channel, pulled from whatever's already in the Profile tab. This
 * is an internal decision-making document — "is this creator worth
 * pursuing" — not the pitch document the One-Pager is. Triggerable from
 * either the Channels row or a Profile row for that channel.
 */
function exportPerformanceReport() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  let channelId, channelName;

  if (sheet.getName() === SHEET_NAMES.PROFILE) {
    const range = SpreadsheetApp.getActiveRange();
    if (!range || range.getRow() < 2) { ui.alert('Select a row in the Profile tab first.'); return; }
    const values = sheet.getRange(range.getRow(), 1, 1, PROFILE_HEADERS.length).getValues()[0];
    channelId = values[PROFILE_HEADERS.indexOf('Channel ID')];
    channelName = values[PROFILE_HEADERS.indexOf('Channel')];
  } else {
    const row = getActiveChannelRow_();
    if (!row) { ui.alert('Select a row on Channels or Profile first, then run this again.'); return; }
    const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
    const rowData = getChannelRowData_(channelsSheet, row);
    channelId = rowData.channelId;
    channelName = rowData.name;
  }

  if (!channelId) { ui.alert('No Channel ID found on this row.'); return; }

  try {
    const result = buildPerformanceReport_(channelId, channelName);
    if (!result) {
      ui.alert('No Profile data found for this channel yet — run Profile on it first (Koli > Profile), then try again.');
      return;
    }
    showLinkDialog_('Performance report ready', channelName + ' — Doc saved to the "Koli Reports" folder in Drive, based on ' + result.videoCount + ' tracked video(s).', result.docUrl, 'Open Doc');
  } catch (e) {
    ui.alert('Could not generate the performance report: ' + e.message);
  }
}

function buildPerformanceReport_(channelId, channelName) {
  const profileSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PROFILE);
  if (!profileSheet || profileSheet.getLastRow() < 2) return null;

  const allRows = profileSheet.getRange(2, 1, profileSheet.getLastRow() - 1, PROFILE_HEADERS.length).getValues();
  const idCol = PROFILE_HEADERS.indexOf('Channel ID');
  const rows = allRows.filter(function (r) { return r[idCol] === channelId; });
  if (!rows.length) return null;

  const col = function (name) { return PROFILE_HEADERS.indexOf(name); };
  rows.sort(function (a, b) { return new Date(b[col('Posted')]) - new Date(a[col('Posted')]); });

  const folder = getOrCreateReportsFolder_();
  const baseName = channelName + ' - Performance Report';
  const doc = DocumentApp.create(baseName);
  const body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(50).setMarginRight(50);

  body.appendParagraph(channelName + ' — Performance Report').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Generated ' + Utilities.formatDate(new Date(), getTimezone_(), 'MMMM d, yyyy') +
    ' — ' + rows.length + ' video(s) tracked').editAsText().setForegroundColor('#5f6368');

  const avg = function (name) {
    const sum = rows.reduce(function (s, r) { return s + (Number(r[col(name)]) || 0); }, 0);
    return Math.round((sum / rows.length) * 10) / 10;
  };
  body.appendParagraph('Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Avg views: ' + avg('Views') + '  |  Avg likes: ' + avg('Likes') + '  |  Avg engagement: ' + avg('Eng %') + '%');

  body.appendParagraph('Per-Video Detail').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const tableData = [['Video', 'Posted', 'Views', 'Likes', 'Eng %', 'Location', 'Age', 'Gender']];
  rows.forEach(function (r) {
    tableData.push([
      String(r[col('Video')]).slice(0, 55),
      formatDateShort_(r[col('Posted')]),
      String(r[col('Views')]), String(r[col('Likes')]),
      r[col('Eng %')] + '%',
      String(r[col('Location')]), String(r[col('Age')]), String(r[col('Gender')])
    ]);
  });
  const table = body.appendTable(tableData);
  const headerRow = table.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) {
    headerRow.getCell(c).getChild(0).asParagraph().editAsText().setBold(true);
  }

  doc.saveAndClose();
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(folder);
  return { docUrl: docFile.getUrl(), videoCount: rows.length };
}
