/**
 * uiHandlers.gs
 * Menu, sidebar/dialog entry points, and the orchestration functions the
 * client-side sidebar JS calls. Channel/Video/Profile each start with one
 * batched prefetch call (parallel network requests, warms the cache), then
 * loop one item at a time so the client can show live, resumable progress.
 */

// Custom add-on menus can't use Google's own colored Material icons (that's
// internal Workspace UI chrome, not exposed via SpreadsheetApp.getUi()); a
// prefixed character is the only icon mechanism the public Menu API
// actually supports, and there's no fixed-width "icon column" the way
// Google's own native menus have — each addItem() caption is just one
// plain-text string. A per-item glyph (◆ ⌕ ▦ ➤ ...) therefore renders at a
// different width per character and leaves every label starting at a
// different x-position ("ragged" alignment). Using the SAME glyph (•)
// everywhere makes the prefix-plus-space pixel-identical across every
// item, which is the only way to actually guarantee aligned labels here.
// ⚡ stays on Attention alone as a deliberate exception, same reasoning as
// ✦ on Intro: both are one-off entries meant to stand out from the aligned
// bullet list, not part of the alignment set. Attention moved below Export
// 2026-09-13 (was the deliberate top item before that -- explicit later
// instruction reversed that placement; Intro takes the top slot instead).
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Koli')
    .addItem('✦ Intro', 'showIntroDialog')
    .addSeparator()
    .addItem('• Console', 'showConsole')
    .addItem('• Dashboard', 'showDashboard')
    .addItem('• Kolindar (free scheduling page)', 'showKolindarSetupDialog')
    .addItem('• Topic Research (search YouTube by topic)', 'showTopicResearchLinkDialog')
    .addItem('• Outreach Pipeline (Kanban) (Premium)', 'showOutreachKanban')
    .addItem('• Campaigns (Premium)', 'showCampaigns')
    .addItem('• Campaigns (Kanban) (Premium)', 'showCampaignsKanban')
    // Google Sheets' custom-menu chrome has no scrollbar of its own, and
    // there's no Apps Script API to add one -- a submenu taller than the
    // browser viewport just clips, full stop, with no way to reach
    // whatever's below the fold. The only real fix is keeping every
    // submenu short enough to never need one: nested sub-submenus below,
    // not a flat 12-item list. (Already tried "just move one item out"
    // once before; both lists grew past that fix again, hence nesting
    // instead of another one-off shuffle.)
    .addSubMenu(SpreadsheetApp.getUi().createMenu('• Brand Intelligence')
      .addItem('• Brand Targets', 'showBrandTargets')
      .addItem('• Add Brand Target...', 'showAddBrandTargetDialog')
      .addSubMenu(SpreadsheetApp.getUi().createMenu('• Discovery')
        .addItem('• Discover New Brands (Premium)', 'showBrandDiscoveryDialog')
        .addItem('• Add Selected Discoveries to Brand Targets', 'addBrandDiscoveriesToBrandTargets')
        .addItem('• Add Selected Sponsors to Brand Targets', 'addSponsorsToBrandTargets')
        .addItem('• Run Gap Analysis (selected Channels row) (Premium)', 'runGapAnalysisForActiveRow'))
      .addSubMenu(SpreadsheetApp.getUi().createMenu('• Research')
        .addItem('• Research Sponsor Contacts (selected Sponsors row(s)) (Premium)', 'researchSponsorContacts')
        .addItem('• Attach Brand Kit (selected Sponsors/Brand Targets row) (Premium)', 'showBrandKitUploadDialog')
        .addItem('• Guess Contact Email (name + domain) (Premium)', 'showContactFinderDialog')
        .addItem('• Normalize Sponsor Names', 'normalizeExistingSponsors')
        .addItem('• Test About-Page Fetch (diagnostic)', 'testAboutPageFetch'))
      .addItem('• Brand Fit Score (selected Channels row(s)) (Premium)', 'showBrandFitScoreDialog')
      .addItem('• Set Up Brand View (for Looker Studio)', 'showBrandView'))
    .addSeparator()
    // Every item under here is premium-gated: marked once on the
    // top-level submenu header rather than repeated on each child.
    .addSubMenu(SpreadsheetApp.getUi().createMenu('• Export (Premium)')
      .addSubMenu(SpreadsheetApp.getUi().createMenu('• Documents')
        .addItem('• Creator One-Pager (selected row)', 'exportCreatorOnePager')
        .addItem('• Creator Shortlist Report (selected rows -- sellable)', 'exportCreatorShortlistReport')
        .addItem('• Draft Deal Memo (selected row)', 'exportDealMemo')
        .addItem('• Performance Report (Channels or Profile row)', 'exportPerformanceReport'))
      .addSubMenu(SpreadsheetApp.getUi().createMenu('• Outreach')
        .addItem('• New Campaign (selected Channels row)', 'showCreateCampaignDialog')
        .addItem('• Open Campaign Record (selected Campaigns row)', 'showCampaignRecordDialogForSelection')
        .addItem('• Draft Outreach Email (selected Channels row)', 'showDraftOutreachEmail')
        .addItem('• Bulk Template / Mail Merge (selected Channels rows)', 'showBulkTemplateDialog')
        .addItem('• Edit Draft (selected Outreach Drafts row)', 'showEditOutreachDraft')
        .addItem('• Draft a Reply (selected Outreach Drafts row)', 'showReplyAssistant')
        .addItem('• Send Approved Drafts (selected Outreach Drafts rows)', 'sendApprovedOutreachDrafts'))
      .addSubMenu(SpreadsheetApp.getUi().createMenu('• Views & Pages')
        .addItem('• Send Selected Profile Rows to Profile View (for Looker Studio)', 'sendProfileSelectionToView')
        .addItem('• Publish Selected Channels as Page (Premium)', 'publishSelectedChannelsAsPage')
        .addItem('• Unpublish a Page...', 'unpublishPageDialog')))
    .addItem('⚡ Attention', 'showAttentionView')
    .addItem('• Refresh Tracked Profiles', 'runRefreshTrackedProfiles')
    .addItem('• Process Prospects', 'processInbox')
    .addSeparator()
    .addItem('• Settings', 'showSettingsDialog')
    .addItem('• Apply Default Formatting (all sheets)', 'runKoliDefaultFormatting')
    .addItem('• Run Diagnostics', 'runDiagnostics')
    .addItem('• Migrate Channels Sheet (v2)', 'migrateChannelsSheetV2')
    .addItem('• Repair Auth Column Dates (one-time fix)', 'repairAuthColumnDates')
    .addItem('• Help', 'showHelp')
    .addToUi();
}

/**
 * Standard Apps Script HtmlService templating idiom: pulls another .html
 * file's content in at <?!= include_('Name'); ?>, for RecordModal.html
 * shared between OutreachKanban.html and CampaignsKanban.html (and the
 * Sidebar's standalone Expand dialog) instead of copy-pasting the same
 * markup/CSS/JS three times.
 */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Returns the currently active sheet/tab's name: powers the sidebar's active-tab indicator. */
function getActiveSheetName() {
  return SpreadsheetApp.getActiveSheet().getName();
}

/**
 * Cheap poll target for the sidebar's selection-reactive card. Reads the
 * CURRENT active selection directly, live, every call -- deliberately NOT
 * a cache populated by an onSelectionChange simple trigger, which is what
 * this used to be. Retired that design after a real, confirmed bug: simple
 * triggers can silently stop firing (or stay bound to a stale copy of the
 * script) after enough live code pushes without the spreadsheet itself
 * being reloaded, which is exactly what a long build session does -- the
 * symptom was the sidebar showing a stale row forever (Channels) or never
 * showing anything at all (Videos), depending on exactly when the trigger
 * stopped updating. A direct read has no such staleness class: it always
 * reflects whatever's actually selected right now, on every poll, at the
 * small cost of a real (but cheap -- selection state, not cell values)
 * SpreadsheetApp call instead of a pure cache lookup. getActiveRange(),
 * not getActiveRangeList(): see getActiveRangesSafe_'s doc comment in
 * constants.gs for why the plural form can throw on a plain row-header
 * click even with real edit rights.
 *
 * Returns "" (nothing selected), "Channels:N", "Videos:N", or "Campaigns:N"
 * (a full bespoke reactive card exists for these three), or "<SheetName>:N"
 * for any other real sheet -- those fall through to getGenericRowPreview,
 * a plain label:value listing of that row's own columns, so every sheet
 * gets a real preview instead of a hand-built card per sheet. Two
 * exclusions: Dashboard (KPI cells, not one-row-one-record) and any hidden
 * control sheet (leading "_", e.g. _EmailOpens) -- neither has a "record"
 * for a row to preview.
 */
function getSelectedRowMarker() {
  try {
    const range = SpreadsheetApp.getActiveRange();
    if (!range) return '';
    const row = range.getRow();
    if (row < 2) return '';
    const sheetName = range.getSheet().getName();
    if (sheetName === SHEET_NAMES.DASHBOARD || sheetName.indexOf('_') === 0) return '';
    return sheetName + ':' + row;
  } catch (e) {
    return '';
  }
}

/**
 * Per-sheet field allowlist for the sidebar's generic row preview, set by
 * the user after seeing the untrimmed dump of every column (see NOTES.md's
 * "trim" addendum): each entry lists exactly which real headers to show, in
 * order, with an optional display `label` override, `block: true` to force
 * the full-width block treatment regardless of value length (Evidence is
 * meant to be read in full, not squeezed into a stat tile), and an optional
 * `sanitize` post-processor (see sanitizeGenericPreviewValue_ below). A
 * sheet with NO entry here (Outreach Drafts, explicitly, plus anything not
 * listed -- Brand Targets, Gap Analysis, Brand Discovery, Discover Results,
 * Prospects, Profile, Profile View, Brand Interest) keeps the untrimmed
 * generic preview, still run through GENERIC_PREVIEW_ALWAYS_HIDDEN below.
 */
const GENERIC_PREVIEW_FIELD_CONFIG = {
  'Sponsors': {
    fields: [
      { header: 'Channel' },
      { header: 'Brand', label: 'Brand Name' },
      { header: 'Mentions', label: 'Mention' },
      { header: 'Sample Video', label: 'Video' },
      { header: 'Timestamp', sanitize: 'sponsorblock' },
      { header: 'Evidence', block: true }
    ]
  },
  'Brand Fit Scores': {
    fields: [
      { header: 'Channel' },
      { header: 'Brand', label: 'Brand Name' },
      { header: 'Score' },
      { header: 'Grade' },
      // The Notes column only ever holds a short one-line reason
      // (scored.notes) -- the real composite breakdown (confidence,
      // per-component weights, estimated CPM) is written as a cell NOTE on
      // the Score column itself (writeBrandFitRow_, brandFitService.gs),
      // invisible unless you hover that specific cell. appendNoteFrom pulls
      // it into this same block so "Score Notes" in the sidebar actually
      // shows the full picture, not just the short summary line.
      { header: 'Notes', label: 'Score Notes', block: true, appendNoteFrom: 'Score', noteSanitize: 'brandFitDisclaimer' }
    ]
  },
  'Brand View': {
    fields: [
      { header: 'Channel' }, { header: 'Niche' }, { header: 'Subs' },
      { header: 'Avg Views' }, { header: 'Posts/Mo' }, { header: 'Grade' }, { header: 'Contact' }
    ]
  },
  // Videos used to have its own bespoke card (getSelectedVideoSummary +
  // renderVideoCard in Sidebar.html) -- retired 2026-09-13. That path went
  // through several rounds of "should be fixed" this session without ever
  // being confirmed actually working, while this generic mechanism has been
  // confirmed working every time it's been tested. Every field it showed
  // (Views/Likes/Comments/Auth/Eng %/Location/Age/Gender) is a real Videos
  // column already -- routing through the same proven path loses only the
  // live SponsorBlock "sponsor detected" check, which wasn't a stored column
  // anyway (a real, deliberate trade-off, not an oversight).
  // User-specified exact layout: Channel (title), Video (subtitle, its own
  // line below), then three explicit stat rows -- Views/Likes/Comments
  // together, Engagement/Authenticity together, Age/Gender together -- and
  // Location on its own row at the end.
  'Videos': {
    fields: [
      { header: 'Channel' }, { header: 'Video' },
      { header: 'Views', row: 1 }, { header: 'Likes', row: 1 }, { header: 'Comments', row: 1 },
      { header: 'Eng %', label: 'Engagement', row: 2 },
      { header: 'Auth', label: 'Authenticity', fixDateLikeScore: true, row: 2 },
      { header: 'Age', row: 3 }, { header: 'Gender', row: 3 },
      { header: 'Location', label: 'Est Audience Location', row: 4 },
      // Real surfacing bug found 2026-09-14: writeVideoRow puts the
      // channel's About summary on the Channel cell's note and the video
      // description's own links on the Views cell's note (extractAllUrls_,
      // sheetWriter.gs) -- neither was ever wired into this config, so the
      // generic preview (this sheet's ONLY sidebar card since addendum #10
      // retired the bespoke one) never showed either, even when the
      // underlying extraction found real links. noteOnly discards the
      // cell's own value (a channel name / a view count) and shows only
      // the note text.
      { header: 'Channel', label: 'About Channel', appendNoteFrom: 'Channel', noteOnly: true, block: true },
      { header: 'Views', label: 'Description & Links', appendNoteFrom: 'Views', noteOnly: true, block: true }
    ]
  }
};

// Hidden everywhere the generic preview applies, even on sheets with no
// explicit config above: raw ID keys nobody asked to see in a QUICK preview.
const GENERIC_PREVIEW_ALWAYS_HIDDEN = ['ID', 'Channel ID', 'Video ID'];

// sponsorService.gs writes real user-facing values like
// "12:34 (verified: SponsorBlock)" -- accurate for the sheet itself, but the
// user asked the sidebar's quick preview not to name the verification
// mechanism. Display-layer only: the sheet cell keeps the full detail.
function sanitizeGenericPreviewValue_(value, kind) {
  if (kind === 'sponsorblock') return value.replace(/\s*\(verified:\s*SponsorBlock\)\s*$/i, '').trim();
  // brandFitService.gs's composite-breakdown note ends with an internal
  // implementation aside (where the weights live, that it's not a real
  // external metric) -- accurate, but the user asked for it out of the
  // sidebar's display. Sheet cell note keeps it; this only trims the copy
  // shown here.
  if (kind === 'brandFitDisclaimer') return value.replace(/:\s*Koli's own formula, tunable in constants\.gs \(BRAND_FIT_WEIGHTS\)\./, '').trim();
  return value;
}

function formatGenericPreviewValue_(value, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd HH:mm');
  return String(value);
}

/**
 * Attention is not a normal one-header-row sheet: showAttentionView (see
 * attentionService.gs) writes THREE stacked sections, each with its own
 * title and its own 3-column header row at a different position every
 * rebuild -- Stale Outreach (Channel/Status/Last Contact), Recent Sponsor
 * Activity (Channel/Brand/Last Seen), and High-Grade Unclaimed
 * (Channel/Grade/blank). A selected row's real column meaning depends on
 * which section it's in, so this scans upward for the nearest matching
 * header row instead of assuming row 1 like every other sheet.
 */
const ATTENTION_SECTION_HEADER_PAIRS = [['Channel', 'Status'], ['Channel', 'Brand'], ['Channel', 'Grade']];
function getAttentionRowPreview_(sheet, row) {
  const scanFloor = Math.max(1, row - 40);
  let headerRow = null;
  for (let r = row - 1; r >= scanFloor; r--) {
    const rowVals = sheet.getRange(r, 1, 1, 3).getValues()[0].map(function (v) { return String(v).trim(); });
    const isHeader = ATTENTION_SECTION_HEADER_PAIRS.some(function (pair) { return pair[0] === rowVals[0] && pair[1] === rowVals[1]; });
    if (isHeader) { headerRow = rowVals; break; }
  }
  if (!headerRow) return { ok: false, reason: 'Could not find this row\'s section header on Attention -- try reopening it from the Koli menu.' };

  const rowVals = sheet.getRange(row, 1, 1, 3).getValues()[0];
  const tz = getTimezone_();
  const fields = [];
  for (let i = 0; i < 3; i++) {
    const label = headerRow[i];
    const value = rowVals[i];
    if (!label || value === '' || value === null || typeof value === 'undefined') continue;
    fields.push({ label: label, value: formatGenericPreviewValue_(value, tz) });
  }
  if (!fields.length) return { ok: false, reason: 'Row ' + row + ' on Attention looks empty -- select an actual data row, not a title or spacer row.' };
  return { ok: true, sheetName: 'Attention', row: row, fields: fields };
}

/**
 * Generic per-row preview for any sheet without a bespoke card
 * (getSelectedChannelSummary/getSelectedVideoSummary/getSelectedCampaignSummary
 * cover the three that have one). Reads the sheet's ACTUAL header row, same
 * convention as getChannelRowData_/getVideoRowData_ -- works for any sheet
 * Koli has today or adds later. Long values (e.g. Outreach Drafts' Email
 * Body) are truncated: this is a QUICK preview, not a substitute for
 * opening the row itself.
 */
function getGenericRowPreview() {
  const range = SpreadsheetApp.getActiveRange();
  if (!range) return { ok: false };
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const row = range.getRow();
  if (row < 2) return { ok: false };

  if (sheetName === SHEET_NAMES.ATTENTION) return getAttentionRowPreview_(sheet, row);

  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return { ok: false, reason: sheetName + ' has no columns to preview.' };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const tz = getTimezone_();
  const MAX_VALUE_LEN = 180;
  const colOf = function (name) { return headers.indexOf(name); };

  const config = GENERIC_PREVIEW_FIELD_CONFIG[sheetName];
  const fields = [];

  if (config) {
    config.fields.forEach(function (spec) {
      const idx = colOf(spec.header);
      if (idx === -1) return; // schema drift: header no longer exists, skip rather than crash
      let value = values[idx];
      // A row written before the Auth-column plain-text fix (see
      // sheetWriter.gs) still holds a real Date object even though the
      // SHEET itself may display something that looks plausible ("7/10")
      // -- Sheets' own default date rendering and this preview's fuller
      // 'yyyy-MM-dd HH:mm' format can show different-looking results for
      // the exact same underlying corrupted value (a date near midnight
      // can even land on a different calendar day once converted through
      // a different timezone). Recover the real score with the same
      // locale-safe logic the repair menu item uses, rather than
      // formatting the corruption more legibly. This is a display-layer
      // safety net -- it does NOT fix the sheet cell itself; run Koli >
      // Repair Auth Column Dates for that.
      if (spec.fixDateLikeScore && value instanceof Date) {
        const recovered = recoverAuthScoreFromDate_(value);
        value = recovered === null ? '' : recovered + '/10';
      } else {
        value = (value === '' || value === null || typeof value === 'undefined') ? '' : formatGenericPreviewValue_(value, tz);
      }
      if (spec.sanitize) value = sanitizeGenericPreviewValue_(value, spec.sanitize);

      // Some fields' real detail lives in a cell NOTE on a DIFFERENT column
      // (Brand Fit Scores: the composite breakdown is a note on Score, not
      // a value in Notes) -- pull it in and append rather than replace, so
      // a short summary value and the fuller note both survive.
      if (spec.appendNoteFrom) {
        const noteIdx = colOf(spec.appendNoteFrom);
        let note = noteIdx === -1 ? '' : String(sheet.getRange(row, noteIdx + 1).getNote() || '').trim();
        if (note && spec.noteSanitize) note = sanitizeGenericPreviewValue_(note, spec.noteSanitize);
        // noteOnly (2026-09-14): the field exists purely to show a note --
        // e.g. Videos' description-links note lives on the Views cell, but
        // showing "1234\n\n<the note>" under a "Description & Links" label
        // would misleadingly lead with the view count. Discards the cell's
        // own value entirely rather than appending to it.
        if (spec.noteOnly) value = note;
        else if (note) value = value ? value + '\n\n' + note : note;
      }
      if (!value) return;

      if (!spec.block && value.length > MAX_VALUE_LEN) value = value.slice(0, MAX_VALUE_LEN) + '…';
      // spec.row (optional): an explicit row-group number for sheets where
      // the user specified a precise layout (e.g. Videos: Views/Likes/
      // Comments together, Age/Gender together). Fields with no row fall
      // back to the client's old auto stats-grid/blocks split -- adding
      // this didn't have to touch Sponsors/Brand Fit/Brand View's already-
      // confirmed layouts, only Videos opted into it.
      fields.push({ label: spec.label || spec.header, value: value, block: !!spec.block, row: spec.row });
    });
  } else {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header || GENERIC_PREVIEW_ALWAYS_HIDDEN.indexOf(header) !== -1) continue;
      let value = values[i];
      if (value === '' || value === null || typeof value === 'undefined') continue;
      value = formatGenericPreviewValue_(value, tz);
      if (value.length > MAX_VALUE_LEN) value = value.slice(0, MAX_VALUE_LEN) + '…';
      fields.push({ label: String(header), value: value });
    }
  }

  if (!fields.length) return { ok: false, reason: 'Row ' + row + ' on ' + sheetName + ' is empty -- nothing to preview yet.' };

  // Videos' card badge shows the channel's own Grade instead of a plain
  // sheet-initial letter, when it can be found -- "if you can get that, if
  // not leave the circle plain" was the explicit ask, so a lookup miss
  // (name not found in Channels, or Channels/Grade columns missing) just
  // falls through to `grade: null` and the client keeps its plain badge,
  // never an error. Matched by channel NAME, not ID: Videos never stored a
  // channel ID of its own (only the display name), so this is a real,
  // accepted limitation -- two identically-named channels would collide.
  const grade = (sheetName === SHEET_NAMES.VIDEOS && fields[0]) ? findChannelGradeByName_(fields[0].value) : null;

  return { ok: true, sheetName: sheetName, row: row, fields: fields, grade: grade };
}

/**
 * Full read for the sidebar's channel-summary card -- pure read of
 * already-computed cells (Grade, Engagement %, Suggested Rate, etc.),
 * no YouTube/Gemini calls. Re-derives the row from the actual current
 * selection rather than trusting the cached marker, so it can't go
 * stale between a selection change and this call.
 */
function getSelectedChannelSummary() {
  const row = getActiveChannelRow_();
  if (!row) return { ok: false };
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = getChannelRowData_(sheet, row);
  if (!data.channelId) return { ok: false, reason: 'Row ' + row + ' on Channels has no ID value in the ID column -- run Channel Analysis on it first.' };
  // Sparse by design (see getChannelSnapshotHistory_): a real point per
  // past analysis run, not a daily-polled series -- recalibrates every
  // time this card loads, off whatever history actually exists so far.
  const history = getChannelSnapshotHistory_(data.channelId);

  // Real surfacing bug found 2026-09-14: writeChannelRow puts the About
  // summary + social handles (findContact's socials, contactService.gs) on
  // the Contact cell's NOTE, not its value -- getChannelRowData_ (used by
  // this same function, above) only ever reads the VALUE (the email
  // string). Before this, the only place that note was ever visible was
  // Expand's record modal (recordService.gs's getRecordGeneric_ surfaces
  // any schema field's note generically) -- the Sidebar's own default
  // channel card, what almost everyone actually looks at day to day, never
  // read it at all. This is very likely why "we still don't get the social
  // handles" even when the underlying extraction (contactService.gs) is
  // working correctly.
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const contactCol = headers.indexOf('Contact') + 1;
  const contactNote = contactCol ? String(sheet.getRange(row, contactCol).getNote() || '').trim() : '';

  return { ok: true, row: row, data: data, history: history, contactNote: contactNote, outreachStatuses: OUTREACH_STATUSES, outreachTones: OUTREACH_TONES };
}


/**
 * Campaigns-sheet counterpart to getSelectedChannelSummary/
 * getSelectedVideoSummary: a compact preview for the sidebar's card. Full
 * field-by-field editing still goes through the Expand button ->
 * showCampaignRecordDialog (the same RecordModal the Campaigns Kanban
 * uses), not this function -- this only reads what the card actually shows.
 */
function getSelectedCampaignSummary() {
  const range = SpreadsheetApp.getActiveRange();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!range || sheet.getName() !== SHEET_NAMES.CAMPAIGNS) return { ok: false };
  const row = range.getRow();
  if (row < 2) return { ok: false };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = function (name) { const idx = headers.indexOf(name); return idx === -1 ? '' : values[idx]; };

  const campaignId = get('Campaign ID');
  if (!campaignId) return { ok: false, reason: 'Row ' + row + ' on Campaigns has no Campaign ID -- older rows are backfilled automatically, but a brand-new blank row won\'t have one until saved.' };

  let deadline = get('Deadline');
  if (deadline instanceof Date) deadline = Utilities.formatDate(deadline, getTimezone_(), 'yyyy-MM-dd');

  return {
    ok: true, row: row,
    data: {
      campaignId: campaignId, channel: get('Channel'), brand: get('Brand'),
      stage: get('Stage'), value: get('Value'), deadline: deadline
    }
  };
}

function showAddBrandTargetDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AddBrandTargetDialog').setWidth(420).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Add Brand Target');
}

/** One-click check of everything that commonly breaks: API keys and Drive/Docs access. */
function runDiagnostics() {
  const ui = SpreadsheetApp.getUi();
  const results = ['Koli v' + KOLI_VERSION];

  try {
    const key = getProp_(PROP_KEYS.YOUTUBE_API_KEY, '');
    if (!key) throw new Error('not set');
    ytFetch_(YT_API_BASE + '/videos?part=id&id=dQw4w9WgXcQ&key=' + key);
    results.push('✓ YouTube API key: working');
  } catch (e) {
    results.push('✗ YouTube API key: ' + e.message);
  }

  try {
    const key = getProp_(PROP_KEYS.GEMINI_API_KEY, '');
    if (!key) throw new Error('not set');
    geminiCallJson_('Respond with exactly this JSON and nothing else: {"ok": true}');
    results.push('✓ Gemini API key: working');
  } catch (e) {
    results.push('✗ Gemini API key: ' + e.message);
  }

  try {
    getOrCreateReportsFolder_();
    results.push('✓ Drive/Docs permission: granted (Koli Reports folder reachable)');
  } catch (e) {
    // e.message alone is often just "You do not have permission to perform
    // that action" (Apps Script's generic wrapper); e.toString() sometimes
    // carries the real underlying reason (e.g. "Drive API has not been used
    // in project ... or it is disabled") which is what actually points at a
    // fix, so surface both rather than the generic text alone.
    results.push('✗ Drive/Docs permission: ' + e.message + '\n   Raw: ' + e.toString());
  }

  try {
    const effectiveUser = Session.getEffectiveUser().getEmail() || '(unknown -- email not shared with this script)';
    results.push('Running as: ' + effectiveUser);
  } catch (e) {
    results.push('Running as: (could not read -- ' + e.message + ')');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lockedSheets = [];
    ss.getSheets().forEach(function (sh) {
      const sheetProts = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      const rangeProts = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      sheetProts.concat(rangeProts).forEach(function (p) {
        if (!p.canEdit()) {
          lockedSheets.push(sh.getName() + (p.getRange ? ' (' + p.getRange().getA1Notation() + ')' : ''));
        }
      });
    });
    results.push(lockedSheets.length
      ? '✗ Protected ranges blocking edits: ' + lockedSheets.join(', ') + ' -- remove or add yourself as an editor via Data > Protected sheets and ranges'
      : '✓ Sheet protections: none block the current user');
  } catch (e) {
    results.push('Sheet protection check: ' + e.message);
  }

  ui.alert('Koli Diagnostics', results.join('\n\n'), ui.ButtonSet.OK);
}

function showProfileSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'profile';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli: Profile'));
}

function showDiscoverSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'discover';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli: Discover'));
}

/**
 * The menu's single sidebar entry point, replacing the separate Profile/
 * Discover menu items -- the sidebar itself is unchanged, still has both
 * tabs, still defaults to Profile. setTitle() only controls the native
 * panel title bar text; that bar is Google Sheets' own UI chrome, not part
 * of Sidebar.html, so its font can't be restyled from here -- the styled
 * "Console" wordmark lives inside the sidebar's own header instead (see
 * .console-wordmark, Sidebar.html).
 */
function showConsole() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'profile';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Console'));
}

function showIntroDialog() {
  const html = HtmlService.createHtmlOutputFromFile('IntroDialog').setWidth(400).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, 'Koli');
}

function showSettingsDialog() {
  const html = HtmlService.createHtmlOutputFromFile('SettingsDialog').setWidth(420).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'Koli Settings');
}

function showDashboard() {
  const sheet = ensureDashboardSheet_();
  refreshAuthenticityAverage_(sheet);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

function showHelp() {
  SpreadsheetApp.getUi().alert(
    'Koli',
    'Attention: start here. Stale Outreach follow-ups, recent sponsor activity, and high-grade ' +
    'channels with no sponsor history yet: what actually needs you today, not another table to skim.\n' +
    'Analyze Channels / Analyze Videos: bulk metadata enrichment.\n' +
    'Profile: full per-video history for one channel over a date range, trackable going forward.\n' +
    'Discover: find channels/videos similar to a seed link.\n' +
    'Refresh Tracked Profiles: pulls new videos for every channel you\'ve tagged as tracked.\n' +
    'Export > Creator One-Pager: pitch-ready PDF for the selected Channels row.\n' +
    'Export > Draft Outreach Email: personalized cold-email draft hooked on a specific ' +
    'detail from the creator\'s last 3 videos, editable in the Outreach Drafts sheet.\n' +
    'Brand Intelligence > Discover New Brands: search YouTube directly for a niche/keyword and ' +
    'surface brands you don\'t already know about, not just ones that already sponsor a tracked channel.\n' +
    'Brand Intelligence > Brand Fit Score: score one or more selected Channels rows against ' +
    'a specific brand brief (niche, audience, budget), not just Grade\'s general quality score.\n' +
    'Export > Set Up Brand View: a live, brand-safe Channels view for connecting Looker Studio ' +
    'and sharing a presentation link with a brand, without giving them access to this spreadsheet.\n' +
    'Export > Send Selected Profile Rows to Profile View: same idea, for whichever Profile rows ' +
    'you\'ve selected.\n' +
    'Run Diagnostics: checks your API keys and Drive permissions in one click.\n' +
    'Set your YouTube and Gemini API keys first under Settings.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function runRefreshTrackedProfiles() {
  const results = refreshTrackedProfiles();
  const ui = SpreadsheetApp.getUi();
  if (!results.length) {
    ui.alert('No tracked profiles yet. Tag a channel as tracked from the Profile sidebar first.');
    return;
  }
  const lines = results.map(function (r) {
    return r.error ? (r.channel + ': error: ' + r.error) : (r.channel + ': ' + r.newVideos + ' new video(s)');
  });
  ui.alert('Refresh Tracked Profiles', lines.join('\n'), ui.ButtonSet.OK);
}

// ---------- Settings ----------

function getSettings() {
  const props = PropertiesService.getDocumentProperties();
  const mask = function (v) { return v ? '••••••••' + v.slice(-4) : ''; };
  return {
    version: KOLI_VERSION,
    youtubeKeySet: !!props.getProperty(PROP_KEYS.YOUTUBE_API_KEY),
    youtubeKeyMasked: mask(props.getProperty(PROP_KEYS.YOUTUBE_API_KEY)),
    geminiKeySet: !!props.getProperty(PROP_KEYS.GEMINI_API_KEY),
    geminiKeyMasked: mask(props.getProperty(PROP_KEYS.GEMINI_API_KEY)),
    mistralKeySet: !!props.getProperty(PROP_KEYS.MISTRAL_API_KEY),
    mistralKeyMasked: mask(props.getProperty(PROP_KEYS.MISTRAL_API_KEY)),
    groqKeySet: !!props.getProperty(PROP_KEYS.GROQ_API_KEY),
    groqKeyMasked: mask(props.getProperty(PROP_KEYS.GROQ_API_KEY)),
    pickerApiKeySet: !!props.getProperty(PROP_KEYS.PICKER_API_KEY),
    pickerApiKeyMasked: mask(props.getProperty(PROP_KEYS.PICKER_API_KEY)),
    lookbackDays: Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS)),
    commentSampleSize: Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE)),
    scanChannelSponsors: getBoolProp_(PROP_KEYS.SCAN_CHANNEL_SPONSORS, true),
    attemptSponsorTimestamp: getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false),
    inboxSecretSet: !!props.getProperty(PROP_KEYS.INBOX_SHARED_SECRET),
    webAppUrl: getProp_(PROP_KEYS.WEB_APP_URL, ''),
    accessCodeSet: !!props.getProperty(PROP_KEYS.ACCESS_CODE),
    premiumUnlocked: hasPremiumAccess_(),
    timezone: getTimezone_(),
    defaultTargetRegions: getProp_(PROP_KEYS.DEFAULT_TARGET_REGIONS, '')
  };
}

/**
 * One paste instead of two: bundles the deployed Web App URL and the
 * shared secret into a single opaque string the extension can decode
 * client-side (plain base64, not encryption: the secret inside is
 * still the real security boundary, this just saves a second copy-paste
 * round trip and a chance to mismatch the wrong URL with the wrong
 * secret). The URL comes from the WEB_APP_URL property, set explicitly
 * in Settings, rather than ScriptApp.getService().getUrl() — that call
 * is ambiguous the moment a second Web App deployment exists for this
 * script (e.g. the auto-created @HEAD one from `clasp create`), and can
 * silently resolve to a stale, unconfigured deployment instead of the
 * one actually meant to serve the extension.
 */
function getConnectionCode_() {
  const secret = getProp_(PROP_KEYS.INBOX_SHARED_SECRET, '');
  if (!secret) throw new Error('Set a shared secret above first, then generate a connection code.');
  const url = getProp_(PROP_KEYS.WEB_APP_URL, '');
  if (!url) throw new Error('Set the Web App URL above first (paste it from Deploy > Manage deployments > the "Web app" one, ending in /exec), then generate a connection code.');
  return Utilities.base64Encode(JSON.stringify({ u: url, s: secret }));
}

function generateConnectionCode() {
  try { return { ok: true, code: getConnectionCode_() }; }
  catch (e) { return { ok: false, message: e.message }; }
}

function saveSettings(settings) {
  const props = PropertiesService.getDocumentProperties();
  if (settings.youtubeApiKey) props.setProperty(PROP_KEYS.YOUTUBE_API_KEY, settings.youtubeApiKey.trim());
  if (settings.geminiApiKey) props.setProperty(PROP_KEYS.GEMINI_API_KEY, settings.geminiApiKey.trim());
  if (settings.mistralApiKey) props.setProperty(PROP_KEYS.MISTRAL_API_KEY, settings.mistralApiKey.trim());
  if (settings.groqApiKey) props.setProperty(PROP_KEYS.GROQ_API_KEY, settings.groqApiKey.trim());
  if (settings.pickerApiKey) props.setProperty(PROP_KEYS.PICKER_API_KEY, settings.pickerApiKey.trim());
  if (settings.lookbackDays) props.setProperty(PROP_KEYS.LOOKBACK_DAYS, String(settings.lookbackDays));
  if (settings.commentSampleSize) props.setProperty(PROP_KEYS.COMMENT_SAMPLE_SIZE, String(settings.commentSampleSize));
  if (settings.inboxSecret) props.setProperty(PROP_KEYS.INBOX_SHARED_SECRET, settings.inboxSecret.trim());
  if (settings.webAppUrl) props.setProperty(PROP_KEYS.WEB_APP_URL, settings.webAppUrl.trim());
  if (settings.accessCode) props.setProperty(PROP_KEYS.ACCESS_CODE, settings.accessCode.trim());
  if (settings.timezone) props.setProperty(PROP_KEYS.TIMEZONE, settings.timezone.trim());
  props.setProperty(PROP_KEYS.SCAN_CHANNEL_SPONSORS, String(!!settings.scanChannelSponsors));
  props.setProperty(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, String(!!settings.attemptSponsorTimestamp));
  // Unconditional (unlike the API-key fields above): this is a normal
  // editable value, not a write-only masked secret, so clearing every
  // checkbox and the custom field must actually clear the stored default,
  // not silently keep whatever was set last time.
  props.setProperty(PROP_KEYS.DEFAULT_TARGET_REGIONS, String(settings.defaultTargetRegions || '').toUpperCase());
  return { ok: true };
}

// ---------- Prefetch (call once before the per-item loop) ----------

function prefetchChannelBatch(rawInputs) {
  try { return prefetchChannels(rawInputs); }
  catch (e) { return { resolved: {}, errors: {}, fatalError: e.message }; }
}

function prefetchVideoBatch(rawInputs) {
  try {
    const sampleSize = Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE));
    return prefetchVideos(rawInputs, sampleSize);
  } catch (e) { return { resolved: {}, errors: {}, fatalError: e.message }; }
}

// ---------- Channel analysis (one input line per call; cache already warmed by prefetch) ----------

/**
 * Pure analysis: fetches + computes everything a channel row needs, but
 * writes nothing. Returns a bundle carrying both the display-ready
 * `preview` object and everything commitChannelAnalysis_ needs to write
 * the real row later, without re-fetching or re-running Gemini. Split out
 * of analyzeChannelOne specifically so the extension's Home tab can offer
 * a real "pull stats first, decide, then add to sheet" flow — Koli's
 * pipeline never had a preview-without-committing mode before this.
 */
function analyzeChannelCore_(channelId, domSocials) {
  const data = getChannelData(channelId);

  const lookback = Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS));
  const avgPosts = computeAvgPostsPerMonth_(data.recentVideos, lookback);
  const contact = findContact(data.description, channelId, domSocials);
  const commentSample = getChannelCommentSample_(data.recentVideos);
  // Enrichment is the slowest single step (the one Gemini call): cache
  // it per channel so resending the same channel within the cache
  // window (a very normal thing to do while testing, or if a link
  // gets captured twice) skips it entirely instead of re-running a
  // full Gemini call for an answer that hasn't changed.
  const enrichment = withCache_(cacheKey_('enrichment', channelId), function () {
    return enrichChannel_(data.description, data.recentVideos, commentSample);
  }, 21600); // 6h: matches the existing raw-data cache TTL
  const aggregates = computeChannelAggregates_(data.recentVideos);
  const cpm = estimateCPM(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);

  const grade = computeGrade_(channelId, aggregates.growthScore, enrichment.authenticity,
    aggregates.engagementRatio, enrichment.audience.location, data.recentVideos);
  const cpmRaw = estimateCPMRaw_(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);
  const preview = {
    subCount: data.subCount, avgViews: aggregates.avgViews, engagementRatio: aggregates.engagementRatio,
    avgPostsPerMonth: avgPosts, mainNiche: enrichment.mainNiche,
    gradeLetter: grade.letter, gradeScore: grade.score, gradeConfidence: grade.confidence,
    suggestedRateLow: Math.round(cpmRaw.low * aggregates.avgViews / 1000),
    suggestedRateHigh: Math.round(cpmRaw.high * aggregates.avgViews / 1000),
    contactEmail: (contact && contact.email) || ''
  };

  return {
    channelId: channelId, name: data.name, data: data, avgPosts: avgPosts, contact: contact,
    enrichment: enrichment, aggregates: aggregates, cpm: cpm, preview: preview
  };
}

/** The actual sheet-mutating half of what analyzeChannelOne used to do in one step — writes the Channels row and records any sponsor mentions found. */
function commitChannelAnalysis_(bundle) {
  const data = bundle.data, enrichment = bundle.enrichment, aggregates = bundle.aggregates;

  writeChannelRow({
    channelId: bundle.channelId, name: data.name, mainNiche: enrichment.mainNiche, subNiches: enrichment.subNiches,
    avgPostsPerMonth: bundle.avgPosts, contact: bundle.contact, subCount: data.subCount, cpm: bundle.cpm,
    aboutSummary: enrichment.aboutSummary, avgViews: aggregates.avgViews, avgLikes: aggregates.avgLikes,
    avgComments: aggregates.avgComments, engagementRatio: aggregates.engagementRatio,
    postingPattern: aggregates.postingPattern, growthScore: aggregates.growthScore,
    authenticity: enrichment.authenticity, audience: enrichment.audience, recentVideos: data.recentVideos,
    suggestedRateLow: bundle.preview.suggestedRateLow, suggestedRateHigh: bundle.preview.suggestedRateHigh
  });

  if (getBoolProp_(PROP_KEYS.SCAN_CHANNEL_SPONSORS, true)) {
    const sponsorVideos = data.recentVideos.slice(0, 5);
    enrichment.sponsorsByVideo.forEach(function (entry) {
      const v = sponsorVideos[entry.index];
      if (v && entry.sponsors && entry.sponsors.length) {
        recordSponsorMentions(bundle.channelId, data.name, { videoId: v.videoId, title: v.title, publishedAt: v.publishedAt }, entry.sponsors);
      }
    });
  }
}

/** Unchanged public behavior: analyze AND commit in one step — used by bulk Channel Analysis, Process Prospects, and anything that doesn't need a look-first-decide-later flow. */
function analyzeChannelOne(rawInput, domSocials) {
  try {
    const channelId = resolveChannelId(rawInput);
    const bundle = analyzeChannelCore_(channelId, domSocials);
    commitChannelAnalysis_(bundle);
    return { ok: true, name: bundle.name, preview: bundle.preview };
  } catch (e) {
    if (e.skip) {
      writeChannelError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeChannelError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

/**
 * Analyzes without writing anything to the sheet — the actual "pull
 * stats first" half of the extension's Home-tab flow. Caches the full
 * bundle (30 min: long enough to look at the card and decide, short
 * enough not to go stale) so a follow-up commitChannelOne can write the
 * exact thing that was previewed without re-fetching YouTube or
 * re-running the Gemini call. If the bundle is too large for
 * CacheService's per-key limit, cachePut_ already fails silently by
 * design (see cache.gs) — commitChannelOne falls back to a fresh
 * analysis rather than erroring, so this never blocks the flow, it just
 * occasionally costs a re-fetch.
 */
function previewChannelOne(rawInput) {
  try {
    const channelId = resolveChannelId(rawInput);
    const bundle = analyzeChannelCore_(channelId);
    cachePut_(cacheKey_('pendingCommit', channelId), bundle, 1800);
    // Same Snapshots-sheet history the Sidebar's channel card charts —
    // sparse by design, real data only if this channel's been analyzed
    // before (a first-ever preview has none yet, same as the Sidebar).
    const history = getChannelSnapshotHistory_(channelId);
    return { ok: true, channelId: channelId, name: bundle.name, preview: bundle.preview, history: history };
  } catch (e) {
    console.error('[Koli] previewChannelOne failed for "' + rawInput + '": ' + errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

/** Commits a previously-previewed channel — reuses the cached bundle when it's still there, otherwise re-analyzes fresh (fail-soft, not an error) so a slow decision never just breaks. */
function commitChannelOne(channelId) {
  try {
    const cached = cacheGet_(cacheKey_('pendingCommit', channelId));
    const bundle = cached || analyzeChannelCore_(channelId);
    commitChannelAnalysis_(bundle);
    const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS).getSheetId();
    return { ok: true, name: bundle.name, link: link };
  } catch (e) {
    writeChannelError_(channelId, errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

// ---------- Video analysis ----------

/** The analyze-without-writing half — everything analyzeVideoOne used to do in one step, minus the sheet write. Shared by the preview/commit split (extension's "Pull Stats" on a video page) and the one-step path bulk callers still use. */
function analyzeVideoCore_(rawInput) {
  const videoId = parseVideoInput_(rawInput);
  if (!videoId) throw new Error('Could not parse a video ID from "' + rawInput + '"');

  const sampleSize = Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE));
  const video = getVideoData(videoId, sampleSize);
  const enrichment = enrichVideo_(video);

  let newSubs = 'n/a', aboutSummary = '';
  try {
    const channelData = getChannelData(video.channelId);
    recordSubscriberSnapshot_(video.channelId, channelData.subCount);
    newSubs = getNewSubscribersSince_(video.channelId, channelData.subCount);
    aboutSummary = getChannelAboutSummaryCached_(video.channelId, channelData.description, channelData.recentVideos);
  } catch (e) {
    newSubs = 'Channel unavailable';
  }

  const engagementRatio = video.views > 0 ? Math.round(((video.likes + video.commentCount) / video.views) * 1000) / 10 : 0;
  const preview = {
    title: video.title, views: video.views, likes: video.likes, commentCount: video.commentCount,
    engagementRatio: engagementRatio,
    authScore: (enrichment.authenticity.score === null || enrichment.authenticity.score === undefined) ? null : enrichment.authenticity.score,
    publishedAt: video.publishedAt, newSubscribers: newSubs,
    location: enrichment.audience.location, age: enrichment.audience.age, gender: enrichment.audience.gender
  };

  return { videoId: videoId, video: video, enrichment: enrichment, newSubs: newSubs, aboutSummary: aboutSummary, preview: preview };
}

/** The actual sheet-mutating half — writes the Videos row and records any sponsor mentions found. */
function commitVideoAnalysis_(bundle) {
  const video = bundle.video, enrichment = bundle.enrichment;

  writeVideoRow({
    videoId: bundle.videoId, title: video.title, channelId: video.channelId, channelTitle: video.channelTitle,
    publishedAt: video.publishedAt, views: video.views, likes: video.likes, commentCount: video.commentCount,
    authenticity: enrichment.authenticity, audience: enrichment.audience, newSubscribers: bundle.newSubs,
    channelAboutSummary: bundle.aboutSummary
  });

  if (enrichment.sponsors.length) {
    recordSponsorMentions(video.channelId, video.channelTitle, video, enrichment.sponsors);
  }
}

/** Unchanged public behavior: analyze AND commit in one step — used by bulk Video Analysis and anything that doesn't need a look-first-decide-later flow. */
function analyzeVideoOne(rawInput) {
  try {
    const bundle = analyzeVideoCore_(rawInput);
    commitVideoAnalysis_(bundle);
    return { ok: true, title: bundle.video.title };
  } catch (e) {
    if (e.skip) {
      writeVideoError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeVideoError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

/** "Pull stats" for a video page — analyzes WITHOUT writing anything to the Sheet, mirroring previewChannelOne. Caches the full bundle (30 min) so a follow-up commitVideoOne writes the exact thing that was previewed without re-fetching YouTube or re-running Gemini. */
function previewVideoOne(rawInput) {
  try {
    const bundle = analyzeVideoCore_(rawInput);
    cachePut_(cacheKey_('pendingCommitVideo', bundle.videoId), bundle, 1800);
    return { ok: true, videoId: bundle.videoId, title: bundle.video.title, preview: bundle.preview };
  } catch (e) {
    console.error('[Koli] previewVideoOne failed for "' + rawInput + '": ' + errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

/** Commits a previously-previewed video — reuses the cached bundle when it's still there, otherwise re-analyzes fresh (fail-soft, same pattern as commitChannelOne). */
function commitVideoOne(videoId) {
  try {
    const cached = cacheGet_(cacheKey_('pendingCommitVideo', videoId));
    const bundle = cached || analyzeVideoCore_(videoId);
    commitVideoAnalysis_(bundle);
    const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VIDEOS).getSheetId();
    return { ok: true, title: bundle.video.title, link: link };
  } catch (e) {
    writeVideoError_(videoId, errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

// ---------- Profile ----------

function runProfileOne(rawInput, startDate, endDate, mode, track) {
  try {
    const result = runProfile(rawInput, startDate, endDate, mode, track);
    const stopNote = result.stoppedEarly ? ': stopped early (approaching Apps Script\'s time limit); re-run the same request to continue from here' : '';
    return {
      ok: true, name: result.channelName + stopNote,
      written: result.written, errors: result.errors, total: result.total,
      skippedAlreadyDone: result.skippedAlreadyDone
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ---------- Discover ----------

function runDiscoverOne(seedInput, searchType, resultCount, filters) {
  try {
    const result = runDiscover(seedInput, searchType, resultCount, filters);
    return { ok: true, message: result.message, count: result.count };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ---------- Input gathering ----------

function getSelectedRangeValues() {
  const range = SpreadsheetApp.getActiveRange();
  if (!range) return [];
  return range.getValues()
    .reduce(function (acc, row) { return acc.concat(row); }, [])
    .map(function (v) { return String(v).trim(); })
    .filter(function (v) { return v.length > 0; });
}
