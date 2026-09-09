/**
 * outreachDraftService.gs
 * Outreach draft generator (Batch 3) — one Channels row -> a short,
 * personalized cold-outreach email, hooked on a specific detail from one
 * of the creator's last 3 videos instead of generic "love your content!"
 * filler.
 *
 * Positioning matters here, stated explicitly since it changes the whole
 * email: this is an agency reaching out to OFFER a creator well-matched
 * sponsor opportunities and handle the relationship long-term — not a
 * brand cold-pitching a creator for a one-off promo. The email leads with
 * what's in it for the creator (a real pain point solved — inconsistent
 * sponsor income, generic deals that don't fit their content, time spent
 * chasing brands instead of making videos) rather than what's being asked
 * of them. Warm and direct, not salesy or needy — see the prompt in
 * draftOutreachEmailCopy_ for the specific tone rules this enforces.
 *
 * "Watching" a video here means the same thing it means everywhere else
 * in Koli: reading its public auto-caption transcript (captionsService.gs
 * — the same best-effort, unofficial endpoint already used for sponsor
 * timestamps) plus its description. Apps Script has no way to actually
 * decode video or audio. Falls back to the description alone when a
 * video has no captions available; a missing transcript never blocks a
 * draft, same fail-soft rule as everywhere else caption-fetching is used.
 *
 * Output lands in a new "Outreach Drafts" sheet, not a Doc — cells are
 * natively editable (the whole point: these are drafts, not a locked
 * export), and the Chars column is a live LEN() formula so it keeps
 * tracking the character limit as you hand-edit the draft afterward.
 */

const OUTREACH_EMAIL_MAX_CHARS = 500; // hard cap on the body — the part a recipient actually reads as "the email"
const OUTREACH_TRANSCRIPT_SAMPLE_CHARS = 900; // per video, prompt budget

function showDraftOutreachEmail() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Draft Outreach Email'); return; }
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first (click any cell in that row), then run this again.');
    return;
  }
  try {
    const result = buildOutreachDraft_(row);
    showLinkDialog_(
      'Outreach draft ready',
      result.channelName + ' — hook: "' + result.hookVideoTitle + '"\n\n' +
      'Subject: ' + result.subject + '\n\n' + result.body +
      '\n\n(' + result.bodyChars + '/' + OUTREACH_EMAIL_MAX_CHARS + ' characters' +
      (result.truncated ? ', trimmed to fit — edit freely in the sheet' : '') + ')',
      result.link, 'Open draft'
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Could not draft an outreach email: ' + e.message);
  }
}

function buildOutreachDraft_(row) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID — run Channel Analysis on it first.');

  const channel = getChannelData(rowData.channelId); // cache-first, cheap if already analyzed
  const last3 = (channel.recentVideos || []).slice(0, 3);
  if (!last3.length) throw new Error('No recent videos found for this channel.');

  const aboutSummary = getChannelAboutSummaryCached_(rowData.channelId, channel.description, channel.recentVideos);
  const videoExcerpts = last3.map(function (v) {
    const lines = fetchCaptionLines_(v.videoId);
    const excerpt = lines.length
      ? sampleTranscriptExcerpt_(lines, OUTREACH_TRANSCRIPT_SAMPLE_CHARS)
      : (v.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    return { videoId: v.videoId, title: v.title, excerpt: excerpt, fromCaptions: lines.length > 0 };
  });

  const draft = draftOutreachEmailCopy_(rowData, aboutSummary, videoExcerpts);
  const enforced = enforceEmailCharLimit_(draft.body);
  const hookVideo = videoExcerpts[draft.referencedVideoIndex] || videoExcerpts[0];

  const sheet = getOrCreateSheet_(SHEET_NAMES.OUTREACH_DRAFTS, OUTREACH_DRAFT_HEADERS);
  ensureOutreachDraftStatusColumn_(sheet);

  const newRow = sheet.getLastRow() + 1;
  const values = [
    '', rowData.channelId, '', sanitizeCellText_(draft.subject), sanitizeCellText_(enforced.body),
    '', 'Draft', new Date()
  ];
  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  sheet.getRange(newRow, 1).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  sheet.getRange(newRow, 3).setFormula(hyperlinkFormula_(videoUrl_(hookVideo.videoId), hookVideo.title));
  sheet.getRange(newRow, 5).setWrap(true);
  sheet.getRange(newRow, 6).setFormula('=LEN(E' + newRow + ')'); // live count — keeps tracking the limit as you hand-edit the draft
  sheet.getRange(newRow, 8).setNumberFormat('yyyy-mm-dd hh:mm');

  const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + newRow;
  return {
    channelName: rowData.name, subject: draft.subject, body: enforced.body,
    bodyChars: enforced.body.length, truncated: enforced.truncated,
    hookVideoTitle: hookVideo.title, link: link
  };
}

/**
 * Evenly-spaced sampling instead of just the first N characters — video
 * intros are almost always generic ("hey guys, welcome back"), so reading
 * only the start would starve Gemini of anything actually specific to
 * hook the email on.
 */
function sampleTranscriptExcerpt_(lines, maxChars) {
  const full = lines.map(function (l) { return l.text; }).join(' ').replace(/\s+/g, ' ').trim();
  if (full.length <= maxChars) return full;
  const windowSize = Math.floor(maxChars / 3);
  return [0.1, 0.45, 0.8]
    .map(function (p) {
      const start = Math.floor(full.length * p);
      return full.slice(start, start + windowSize);
    })
    .join(' ... ');
}

function draftOutreachEmailCopy_(rowData, aboutSummary, videoExcerpts) {
  const videoBlock = videoExcerpts.map(function (v, i) {
    return (i + 1) + '. "' + v.title + '" (' +
      (v.fromCaptions ? 'transcript excerpt' : 'description only, no captions available') + '):\n' + v.excerpt;
  }).join('\n\n');

  const prompt =
    'You work at a boutique creator-partnerships agency. Draft a short outreach email to a YouTube ' +
    'creator. You are NOT a brand cold-pitching for a promo, and this is NOT a generic sponsorship ' +
    'request — you represent brands and bring the creator well-matched sponsor opportunities, handling ' +
    'the vetting and negotiation so they don\'t have to chase deals themselves. You\'re offering to build ' +
    'an ongoing relationship, not close a one-off transaction. The email should read like it\'s about what ' +
    'you\'re bringing THEM, not what you want FROM them.\n\n' +
    'Mandatory tone rules:\n' +
    '- Write like one person emailing another, not a company emailing an audience. Plain, warm, direct.\n' +
    '- Lead with value. Never open with a request — earn the reply before you ask for anything.\n' +
    '- Frame this as the start of a long-term, mutually beneficial relationship, not a single deal.\n' +
    '- Do not sound needy, eager, or salesy. No exclamation points. Never use "would love to," ' +
    '"amazing/incredible/huge opportunity," "reaching out to explore," or "brand-partnership conversation." ' +
    'Write like someone who already has good opportunities to offer, not someone hoping to be picked.\n' +
    '- Name ONE real, specific pain point this creator likely has — inconsistent sponsor income, generic ' +
    'brand deals that don\'t fit their content, time spent pitching brands instead of making videos, or ' +
    'negotiating alone with no agent — and speak directly to that one, not a list of several.\n' +
    '- No corporate jargon, no "synergy," no filler like "I hope this finds you well."\n\n' +
    'Creator: ' + rowData.name + '\nNiche: ' + (rowData.niche || 'unknown') + '\n' +
    'About: ' + (aboutSummary || 'n/a') + '\n\n' +
    'Below are excerpts from their 3 most recent videos. Pick exactly ONE specific, concrete detail — a ' +
    'moment, technique, opinion, or result — from ONE excerpt to open the email with, as proof this was ' +
    'actually watched, not a template. Ignore generic intro greetings and generic subscribe/outro ' +
    'requests. If an excerpt is description-only (no transcript), you may reference its stated topic, ' +
    'just don\'t claim to quote a specific line from it.\n\n' +
    videoBlock + '\n\n' +
    'Respond as JSON: {"subject": "...", "body": "...", "referencedVideoIndex": <0, 1, or 2>}\n' +
    '- "subject": references the specific detail you picked. Under 70 characters. Curious, not salesy — ' +
    'not a pitch line.\n' +
    '- "body": one sentence hooked on that specific detail, one sentence naming the pain point and what ' +
    'you\'re offering to solve it (well-matched, long-term sponsor opportunities you\'d bring and manage ' +
    '— not "we want to sponsor you"), one low-pressure closing question (e.g. "worth a quick reply?" — ' +
    'not "let\'s schedule a call to discuss deliverables"), signs off with "[Your name]" on its own line. ' +
    'HARD LIMIT ' + OUTREACH_EMAIL_MAX_CHARS + ' characters total, no exceptions — count as you write and ' +
    'stop well under the limit rather than padding to it.\n' +
    '- "referencedVideoIndex": which excerpt (0, 1, or 2) the hook came from.';

  const result = geminiCallJson_(prompt);
  const idx = Number(result.referencedVideoIndex);
  return {
    subject: String(result.subject || '').trim(),
    body: String(result.body || '').trim(),
    referencedVideoIndex: [0, 1, 2].indexOf(idx) !== -1 ? idx : 0
  };
}

/**
 * Backstop, not the primary control — the prompt already asks Gemini to
 * self-limit, but nothing on its end enforces that (same reasoning as
 * clampAuthenticityScore_ in geminiService.gs: never trust an LLM's stated
 * constraint without checking it). Trims at the last whole word inside the
 * budget rather than a mid-word cut.
 */
function enforceEmailCharLimit_(body) {
  if (body.length <= OUTREACH_EMAIL_MAX_CHARS) return { body: body, truncated: false };
  const cut = body.slice(0, OUTREACH_EMAIL_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  return { body: trimmed, truncated: true };
}

/** Native dropdown for Status, same pattern as Outreach's and Campaigns' Stage column. */
function ensureOutreachDraftStatusColumn_(sheet) {
  const statusCol = OUTREACH_DRAFT_HEADERS.indexOf('Status') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_DRAFT_STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
}
