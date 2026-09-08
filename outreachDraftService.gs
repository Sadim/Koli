/**
 * outreachDraftService.gs
 * Outreach draft generator (Batch 3) — one Channels row -> a short,
 * personalized cold-outreach email, hooked on a specific detail from one
 * of the creator's last 3 videos instead of generic "love your content!"
 * filler.
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
    'You are drafting a short, cold outreach email from an influencer-marketing agency to a YouTube ' +
    'creator, proposing a brand-partnership conversation. Business-oriented tone: professional and direct, ' +
    'no gushing fan language, no generic filler like "I hope this finds you well."\n\n' +
    'Creator: ' + rowData.name + '\nNiche: ' + (rowData.niche || 'unknown') + '\n' +
    'About: ' + (aboutSummary || 'n/a') + '\n\n' +
    'Below are excerpts from their 3 most recent videos. Pick exactly ONE specific, concrete detail — a ' +
    'moment, technique, opinion, or result — from ONE excerpt to build the whole email around. Ignore ' +
    'generic intro greetings and generic subscribe/outro requests; the point is proof this was actually ' +
    'watched, not a template. If an excerpt is description-only (no transcript), you may reference its ' +
    'stated topic, just don\'t claim to quote a specific line from it.\n\n' +
    videoBlock + '\n\n' +
    'Respond as JSON: {"subject": "...", "body": "...", "referencedVideoIndex": <0, 1, or 2>}\n' +
    '- "subject": references the specific detail you picked. Under 70 characters.\n' +
    '- "body": opens with one sentence hooked on that specific detail (this is the personalization — no ' +
    '"great content!"), states the partnership interest in one sentence, ends with one clear call to ' +
    'action, signs off with "[Your name]" on its own line. HARD LIMIT ' + OUTREACH_EMAIL_MAX_CHARS + ' ' +
    'characters total, no exceptions — count as you write and stop well under the limit rather than ' +
    'padding to it.\n' +
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
