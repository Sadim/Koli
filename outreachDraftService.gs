/**
 * outreachDraftService.gs
 * Outreach draft generator (Batch 3): one Channels row -> a short,
 * personalized cold-outreach email, hooked on a specific detail from one
 * of the creator's best-performing RECENT videos (by views, not just
 * whichever is newest: see pickBestPerformingVideos_) instead of generic
 * "love your content!" filler.
 *
 * Positioning matters here, stated explicitly since it changes the whole
 * email: this is an agency reaching out to OFFER a creator well-matched
 * sponsor opportunities and handle the relationship long-term: not a
 * brand cold-pitching a creator for a one-off promo. The email leads with
 * what's in it for the creator (a real pain point solved: inconsistent
 * sponsor income, generic deals that don't fit their content, time spent
 * chasing brands instead of making videos) rather than what's being asked
 * of them.
 *
 * Tone, revised after the first version still read as templated: the goal
 * isn't just "not salesy," it's that the email shouldn't read as
 * AI-written or as a research report on the creator. It should read like
 * it came from someone who actually watches this channel: the specific
 * detail woven in as familiarity, not cited as proof of research, and
 * with no explicit ask for a reply at the end (the specificity is what
 * earns the reply, not a "worth a quick reply?" nudge). See
 * draftOutreachEmailCopy_'s prompt for the full, explicit list of
 * AI-tell phrases/patterns this rejects.
 *
 * "Watching" a video here means the same thing it means everywhere else
 * in Koli: reading its public auto-caption transcript (captionsService.gs
 *: the same best-effort, unofficial endpoint already used for sponsor
 * timestamps) plus its description. Apps Script has no way to actually
 * decode video or audio. Falls back to the description alone when a
 * video has no captions available; a missing transcript never blocks a
 * draft, same fail-soft rule as everywhere else caption-fetching is used.
 *
 * Where available, the hook is pulled from around the exact timestamp the
 * video's own "Most Replayed" heatmap identifies as a real rewatch spike
 * (heatmapService.gs) rather than an evenly-sampled guess at the
 * transcript: a spike is proof something specific landed with viewers,
 * not just Koli's own sampling. Most videos don't have one (YouTube only
 * draws it past a view floor), so this silently falls back to the
 * existing sampled-excerpt approach when it's not available.
 *
 * Output lands in a new "Outreach Drafts" sheet, not a Doc: cells are
 * natively editable (the whole point: these are drafts, not a locked
 * export), and the Chars column is a live LEN() formula so it keeps
 * tracking the character limit as you hand-edit the draft afterward.
 */

const OUTREACH_EMAIL_MAX_CHARS = 500; // hard cap on the body: the part a recipient actually reads as "the email"
const OUTREACH_TRANSCRIPT_SAMPLE_CHARS = 900; // per video, prompt budget

// Cycled through on each "Try a different angle" click, in this order.
// Each name maps to angle-specific guidance injected into the prompt in
// draftOutreachEmailCopy_ -- the goal is a genuinely different email each
// time, not a re-roll of the same instructions hoping for variance.
const OUTREACH_ANGLES = ['auto', 'funny', 'highlight', 'rewatch'];

// Guidance injected into draftReplyCopy_'s prompt per detected reply
// category -- classify-then-draft in ONE Gemini call (not a separate
// classification pass first, the way most reply-bot examples do it):
// the same call can return both a category label and the drafted body,
// so this costs no more than a plain "write a reply" prompt would.
const REPLY_CATEGORY_GUIDANCE = {
  rate_question: 'They are asking about price, budget, or rate. Give a concrete number or range as a starting point open to discussion -- never vague or evasive.',
  objection: 'They are declining, not interested, citing no budget, or bad timing. Keep it short and warm, no pushing, no guilt. Leave the door open for later without begging for a reason or a future date.',
  info_request: 'They are asking for more detail, examples, or how this would work. Answer directly and briefly -- do not repeat the entire original pitch.',
  interested: 'They are positive and open to moving forward. Propose exactly ONE concrete, low-friction next step -- something that takes almost nothing for them to agree to.',
  other: 'Reply naturally to what they actually wrote, in the same spirit as the rules above: brief, human, no filler.'
};

function showDraftOutreachEmail() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Draft Outreach Email'); return; }
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first (click any cell in that row), then run this again.');
    return;
  }
  const t = HtmlService.createTemplateFromFile('DraftOutreachEmailDialog');
  t.row = row;
  t.editMode = false;
  t.existingSubject = '';
  t.existingBody = '';
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(440).setHeight(520), 'Draft Outreach Email');
}

/**
 * The other way into the same dialog: reopens an ALREADY-saved Outreach
 * Drafts row for editing, instead of generating a new one. Skips
 * straight to the result view pre-filled with what's already in the
 * row; Save writes back to that same row (updateOutreachDraft) rather
 * than appending a new one the way a fresh generate does.
 */
function showEditOutreachDraft() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Draft Outreach Email'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.OUTREACH_DRAFTS) {
    ui.alert('Select a row on the Outreach Drafts tab first, then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select a data row on Outreach Drafts first, then run this again.');
    return;
  }
  const row = range.getRow();
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };
  const subject = colOf('Subject') ? String(sheet.getRange(row, colOf('Subject')).getValue() || '') : '';
  const body = colOf('Email Body') ? String(sheet.getRange(row, colOf('Email Body')).getValue() || '') : '';
  if (!subject && !body) {
    ui.alert('This row has no draft content to edit.');
    return;
  }

  const t = HtmlService.createTemplateFromFile('DraftOutreachEmailDialog');
  t.row = row;
  t.editMode = true;
  t.existingSubject = subject;
  t.existingBody = body;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(440).setHeight(520), 'Edit Outreach Draft');
}

/** Writes straight back to an already-existing Outreach Drafts row, instead of appending a new one -- the edit-mode counterpart to commitOutreachDraft. */
function updateOutreachDraft(row, subject, body, bodyRuns) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OUTREACH_DRAFTS);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };
  if (colOf('Subject')) sheet.getRange(row, colOf('Subject')).setValue(sanitizeCellText_(subject));
  const bodyCol = colOf('Email Body');
  if (bodyCol) {
    const cell = sheet.getRange(row, bodyCol);
    if (bodyRuns && bodyRuns.length) applyRichTextToCell_(cell, bodyRuns, body);
    else cell.setValue(sanitizeCellText_(body));
    cell.setWrap(true);
  }
  return { ok: true };
}

/**
 * Called from DraftOutreachEmailDialog for both the first generate and
 * every "Try a different angle" click. Never writes to the Outreach
 * Drafts sheet -- that only happens if/when commitOutreachDraft is
 * called on whatever draft the person actually likes, mirroring the
 * preview/commit split Channel Analysis already uses (see
 * previewChannelOne/commitChannelOne in uiHandlers.gs). Caches the
 * expensive part (caption/heatmap fetches across up to 3 videos) so
 * trying another angle only re-runs the one Gemini call, not the whole
 * fetch pipeline.
 */
function previewOutreachDraft(row, customInstructions, angleIndex) {
  const bundleKey = cacheKey_('outreachBundle', row);
  let bundle = cacheGet_(bundleKey);
  if (!bundle) {
    bundle = buildOutreachBundle_(row);
    cachePut_(bundleKey, bundle, 1800); // 30 min: long enough to cycle through a few angles
  }

  const angle = OUTREACH_ANGLES[angleIndex % OUTREACH_ANGLES.length];
  const draft = draftOutreachEmailCopy_(bundle.rowData, bundle.aboutSummary, bundle.videoExcerpts, customInstructions, angle);
  const enforced = enforceEmailCharLimit_(draft.body);
  const hookVideo = bundle.videoExcerpts[draft.referencedVideoIndex] || bundle.videoExcerpts[0];

  return {
    ok: true, row: row, angleIndex: angleIndex, angle: angle,
    channelName: bundle.rowData.name, subject: draft.subject, body: enforced.body,
    bodyChars: enforced.body.length, truncated: enforced.truncated,
    hookVideoId: hookVideo.videoId, hookVideoTitle: hookVideo.title,
    hasHeatmapPeak: bundle.videoExcerpts.some(function (v) { return v.fromHeatmapPeak; })
  };
}

/** Writes the currently-shown draft (and only that one) to the Outreach Drafts sheet -- the actual commit half of the preview/commit split above. bodyRuns (optional) carries the Bold/Italic/Underline formatting from the dialog's editable body into a real Sheets RichTextValue, not just plain text. */
function commitOutreachDraft(row, subject, body, hookVideoId, hookVideoTitle, bodyRuns) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID: run Channel Analysis on it first.');

  const sheet = getOrCreateSheet_(SHEET_NAMES.OUTREACH_DRAFTS, OUTREACH_DRAFT_HEADERS);
  ensureOutreachDraftStatusColumn_(sheet);

  const newRow = sheet.getLastRow() + 1;
  const values = [
    '', rowData.channelId, '', sanitizeCellText_(subject), '',
    '', 'Draft', new Date()
  ];
  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  sheet.getRange(newRow, 1).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  sheet.getRange(newRow, 3).setFormula(hyperlinkFormula_(videoUrl_(hookVideoId), hookVideoTitle));

  const bodyCell = sheet.getRange(newRow, 5);
  if (bodyRuns && bodyRuns.length) {
    applyRichTextToCell_(bodyCell, bodyRuns, body);
  } else {
    bodyCell.setValue(sanitizeCellText_(body));
  }
  bodyCell.setWrap(true);
  sheet.getRange(newRow, 6).setFormula('=LEN(E' + newRow + ')'); // live count: keeps tracking the limit as you hand-edit the draft
  sheet.getRange(newRow, 8).setNumberFormat('yyyy-mm-dd hh:mm');

  const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + newRow;
  return { ok: true, link: link };
}

/**
 * Applies Bold/Italic/Underline runs (from the outreach dialog's
 * contenteditable body) as a real Sheets RichTextValue, so formatting
 * chosen in the dialog survives into the actual cell -- not just visual
 * in the popup. Falls back to plain text on any error (e.g. a malformed
 * run list) rather than losing the draft entirely.
 */
function applyRichTextToCell_(cell, runs, fallbackPlainText) {
  try {
    let effectiveRuns = runs;
    const rawText = runs.map(function (r) { return r.text; }).join('');
    if (/^[=+\-@]/.test(rawText)) {
      // Same formula-injection guard as sanitizeCellText_, applied as its
      // own leading unstyled run so it doesn't shift the other runs' offsets.
      effectiveRuns = [{ text: "'", bold: false, italic: false, underline: false }].concat(runs);
    }
    const fullText = effectiveRuns.map(function (r) { return r.text; }).join('');
    if (!fullText) throw new Error('empty body');

    const builder = SpreadsheetApp.newRichTextValue().setText(fullText);
    let offset = 0;
    effectiveRuns.forEach(function (r) {
      const len = r.text.length;
      if (len > 0 && (r.bold || r.italic || r.underline)) {
        const style = SpreadsheetApp.newTextStyle().setBold(!!r.bold).setItalic(!!r.italic).setUnderline(!!r.underline).build();
        builder.setTextStyle(offset, offset + len, style);
      }
      offset += len;
    });
    cell.setRichTextValue(builder.build());
  } catch (e) {
    cell.setValue(sanitizeCellText_(fallbackPlainText));
  }
}

/** The expensive, angle-independent half: channel data, best videos, captions, heatmaps. Cached by previewOutreachDraft so re-running with a different angle skips straight to the Gemini call. */
function buildOutreachBundle_(row) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID: run Channel Analysis on it first.');

  const channel = getChannelData(rowData.channelId); // cache-first, cheap if already analyzed
  const topVideos = pickBestPerformingVideos_(channel.recentVideos || [], 3);
  if (!topVideos.length) throw new Error('No recent videos found for this channel.');

  const aboutSummary = getChannelAboutSummaryCached_(rowData.channelId, channel.description, channel.recentVideos);
  const videoExcerpts = topVideos.map(function (v) {
    const lines = fetchCaptionLines_(v.videoId);

    // Prefer the exact moment the "Most Replayed" heatmap identifies as a
    // real rewatch spike over an evenly-sampled guess at what's worth
    // referencing: a spike is proof something specific landed, not just
    // Koli's own sampling. Falls back to the old sampling when a video
    // has no heatmap (most don't: it only shows up past a view floor).
    const heatmap = fetchVideoHeatmap_(v.videoId);
    const peak = heatmap.length ? findHeatmapPeak_(heatmap) : null;
    const usingPeak = !!(peak && lines.length);

    const excerpt = usingPeak
      ? excerptAroundTimestamp_(lines, peak.startMillis / 1000, 20, OUTREACH_TRANSCRIPT_SAMPLE_CHARS)
      : lines.length
        ? sampleTranscriptExcerpt_(lines, OUTREACH_TRANSCRIPT_SAMPLE_CHARS)
        : (v.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);

    return {
      videoId: v.videoId, title: v.title, excerpt: excerpt, fromCaptions: lines.length > 0, views: v.views,
      fromHeatmapPeak: usingPeak, peakTimestamp: usingPeak ? formatSeconds_(peak.startMillis / 1000) : null
    };
  });

  return { rowData: rowData, aboutSummary: aboutSummary, videoExcerpts: videoExcerpts };
}

/**
 * Evenly-spaced sampling instead of just the first N characters: video
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

/**
 * Best-performing, not just most-recent: a creator's newest upload might
 * be an off week; the video that actually landed with their audience is
 * better proof the hook came from real familiarity, and more likely to
 * be something worth referencing at all. Sampled from up to
 * RECENT_VIDEOS_FOR_METRICS (channelMetricsService.gs) recent uploads,
 * not their whole catalog: recent enough that referencing it doesn't
 * feel like digging up something old. Fails soft to most-recent if the
 * stats fetch comes back empty (API hiccup) rather than blocking the
 * whole draft over it.
 */
function pickBestPerformingVideos_(recentVideos, count) {
  const stats = fetchRecentVideoStats_(recentVideos);
  if (!stats.length) return recentVideos.slice(0, count);
  return stats.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, count);
}

// Angle-specific instruction injected right where the model picks its
// hook: same source material (videoExcerpts), different lens each time,
// so "try again" produces a genuinely different email instead of a
// re-roll of the same prompt. 'rewatch' is skipped by the caller when no
// video actually has heatmap data (nothing to force).
const OUTREACH_ANGLE_GUIDANCE = {
  auto: '',
  funny: 'This time, specifically look for a moment that\'s funny, a bit, a joke, or genuinely entertaining -- not just informative or impressive. Build the email around that.',
  highlight: 'This time, specifically look for a moment that showcases real skill, a strong opinion, a clever choice, or a standout result -- not a funny moment, an impressive one. Build the email around that.',
  rewatch: 'Build the email specifically around an excerpt marked as a real rewatch-spike moment below (their own audience\'s proof something landed), not an evenly-sampled one, even if another excerpt seems more talkable.'
};

function draftOutreachEmailCopy_(rowData, aboutSummary, videoExcerpts, customInstructions, angle) {
  const videoBlock = videoExcerpts.map(function (v, i) {
    const performanceNote = typeof v.views === 'number' ? ': one of their best-performing recent uploads' : '';
    const sourceNote = v.fromHeatmapPeak
      ? 'the exact moment (' + v.peakTimestamp + ') their own audience rewatched most: a real engagement spike, not a guess'
      : (v.fromCaptions ? 'transcript excerpt, evenly sampled: no rewatch-spike data available for this one' : 'description only, no captions available');
    return (i + 1) + '. "' + v.title + '"' + performanceNote + ' (' + sourceNote + '):\n' + v.excerpt;
  }).join('\n\n');
  const anyHeatmapPeaks = videoExcerpts.some(function (v) { return v.fromHeatmapPeak; });
  const angleGuidance = OUTREACH_ANGLE_GUIDANCE[angle] || '';

  const prompt =
    'You work at a boutique creator-partnerships agency. Draft a short outreach email to a YouTube ' +
    'creator. You are NOT a brand cold-pitching for a promo, and this is NOT a generic sponsorship ' +
    'request: you represent brands and bring the creator well-matched sponsor opportunities, handling ' +
    'the vetting and negotiation so they don\'t have to chase deals themselves. You\'re offering to build ' +
    'an ongoing relationship, not close a one-off transaction. The email is never selling the agency or ' +
    'its service -- it\'s about what it does for THEM: real income from brand deals, without the chasing. ' +
    'The ask on their side should be as close to zero as possible: nothing to set up, decide, or commit to ' +
    'just by reading this.\n\n' +
    (angleGuidance ? angleGuidance + '\n\n' : '') +
    'The single most important thing: write like someone who actually watches this creator\'s videos, ' +
    'not like someone who researched them for this email. Do not narrate that you watched or noticed ' +
    'something: never "I noticed...", "I saw...", "I came across...", "I was watching...", or any ' +
    'variant. Reference the specific detail the way you\'d bring it up mid-conversation with someone ' +
    'whose work you already know, not the way you\'d cite a source. The detail should feel incidental to ' +
    'the email, not the reason you\'re allowed to send it.\n\n' +
    'This draft will be rejected if it uses any of these: they\'re the tells that make an email read as ' +
    'AI-written or templated: em dashes used as sentence connectors; "I hope this email finds you well"; ' +
    '"I wanted to reach out" or any "reaching out" phrasing; "resonate(s/d)"; "elevate"; "unlock"; ' +
    '"seamless"; "delve"; "leverage"; "in today\'s [landscape/world/climate]"; "not only... but also" ' +
    'constructions; opening with "As a [creator/YouTuber/content creator]..."; superlatives like ' +
    '"incredible/amazing/phenomenal/huge"; a neatly parallel three-item list; exclamation points; or a ' +
    'closing line that explicitly asks for a reply ("worth a quick reply?", "let me know your thoughts", ' +
    '"would love to hear from you", "interested in chatting?"). Use contractions. Vary sentence length: ' +
    'a real email doesn\'t have uniform, polished rhythm; a short blunt sentence next to a longer one ' +
    'reads more human than three sentences of the same shape in a row.\n\n' +
    'Mandatory tone rules:\n' +
    '- Open on the specific detail itself: no greeting, no "great video" framing, no compliment first.\n' +
    '- Frame this as the start of a long-term relationship, not a single deal.\n' +
    '- Name ONE real, specific pain point this creator likely has: inconsistent sponsor income, generic ' +
    'brand deals that don\'t fit their content, time spent pitching brands instead of making videos, or ' +
    'negotiating alone with no agent: and speak directly to that one, not a list of several.\n' +
    '- Do not end with a direct ask for a reply (see the rejected list above). End on something specific ' +
    'enough that replying is the obvious next move without asking for it: trail off on the offer itself, ' +
    'or a genuine, specific observation about their work. Never a scheduling or "are you interested" ' +
    'question.\n' +
    '- No corporate jargon, no "synergy," no filler.\n\n' +
    'Creator: ' + rowData.name + '\nNiche: ' + (rowData.niche || 'unknown') + '\n' +
    'About: ' + (aboutSummary || 'n/a') + '\n\n' +
    'Below are excerpts from ' + videoExcerpts.length + ' of this creator\'s best-performing RECENT videos ' +
    '(by views, not just whichever is newest). Pick exactly ONE specific, concrete detail: a moment, ' +
    'technique, opinion, choice, or result: from ONE excerpt to build the email around.' +
    (anyHeatmapPeaks
      ? ' At least one excerpt below is the exact moment that video\'s own audience rewatched most (a real ' +
        'engagement spike, not a sample): strongly prefer building the email around one of those over an ' +
        'evenly-sampled excerpt when you have the choice; a real spike is proof something specific landed, ' +
        'an even sample is just Koli\'s guess.'
      : '') +
    ' Ignore generic intro greetings and generic subscribe/outro requests. If an excerpt is description-' +
    'only (no transcript), you may reference its stated topic, just don\'t claim to quote a specific line ' +
    'from it. Never state or imply a view count, a rewatch spike, or any statistic in the email itself: ' +
    'knowing it performed well (or got rewatched) is context for you to pick a good hook, not something to ' +
    'mention; stating it would read as a research report, not familiarity.\n\n' +
    videoBlock + '\n\n' +
    (customInstructions
      ? 'The person requesting this draft added these preferences for this specific email: "' +
        customInstructions.replace(/"/g, '\'') + '". Follow them where they don\'t conflict with the rules ' +
        'above; they win on tone, length, emphasis, or what to mention/avoid. They do NOT override the hard ' +
        'character limit below or bring back any of the explicitly rejected phrases/patterns above.\n\n'
      : '') +
    'Respond as JSON: {"subject": "...", "body": "...", "referencedVideoIndex": <0-based index into the ' +
    'excerpts above>}\n' +
    '- "subject": must be built from the same specific detail as the body: never a generic line about ' +
    'sponsorship or opportunity. Understated. Under 70 characters. Reads like a real subject line from a ' +
    'person, not a pitch headline.\n' +
    '- "body": opens on the specific detail (no "I noticed" framing), then in one sentence connects that ' +
    'detail to the pain point and what you\'re offering to solve it (well-matched, long-term sponsor ' +
    'opportunities you\'d bring and manage, not "we want to sponsor you"). The connection should feel ' +
    'earned by the detail, not bolted on after it. Closes without an explicit ask for a reply. Signs off with ' +
    '"[Your name]" on its own line. HARD LIMIT ' + OUTREACH_EMAIL_MAX_CHARS + ' characters total, no ' +
    'exceptions: count as you write and stop well under the limit rather than padding to it.\n' +
    '- "referencedVideoIndex": which excerpt the hook came from.';

  const result = geminiCallJson_(prompt);
  const idx = Number(result.referencedVideoIndex);
  const validIdx = Number.isInteger(idx) && idx >= 0 && idx < videoExcerpts.length;
  return {
    subject: String(result.subject || '').trim(),
    body: String(result.body || '').trim(),
    referencedVideoIndex: validIdx ? idx : 0
  };
}

/**
 * Backstop, not the primary control: the prompt already asks Gemini to
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

// ---------------------------------------------------------------
// Reply Assistant -- the "what happens after the first email" gap:
// drafts a response to what a brand/creator actually wrote back,
// instead of leaving the user to improvise the scariest part of sales
// on their own. Triggered from a specific Outreach Drafts row (the
// email this is a reply to), so the model has the original pitch as
// real context, not just the reply in isolation.
// ---------------------------------------------------------------

function showReplyAssistant() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Draft a Reply'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.OUTREACH_DRAFTS) {
    ui.alert('Select a row on the Outreach Drafts tab first (the draft this reply is responding to), then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select a data row on Outreach Drafts first, then run this again.');
    return;
  }
  const t = HtmlService.createTemplateFromFile('ReplyAssistantDialog');
  t.row = range.getRow();
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(440).setHeight(560), 'Draft a Reply');
}

/** Pure preview: classifies + drafts, writes nothing. Re-runnable (the dialog's "Regenerate" button) without re-reading the sheet each time. */
function previewReplyDraft(row, incomingReply, customInstructions) {
  if (!incomingReply || !incomingReply.trim()) throw new Error('Paste what they wrote back first.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OUTREACH_DRAFTS);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };
  const get = function (name) { const c = colOf(name); return c ? sheet.getRange(row, c).getValue() : ''; };

  const channelId = get('Channel ID');
  const originalSubject = String(get('Subject') || '');
  const originalBody = String(get('Email Body') || '');
  if (!channelId) throw new Error('This row has no Channel ID.');

  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const channelIdCol = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0].indexOf('ID') + 1;
  const channelRow = channelIdCol ? findRowByKey_(channelsSheet, channelIdCol, channelId) : -1;
  const channelData = channelRow !== -1 ? getChannelRowData_(channelsSheet, channelRow) : {};

  const draft = draftReplyCopy_(channelData, originalSubject, originalBody, incomingReply, customInstructions);
  const enforced = enforceEmailCharLimit_(draft.body);
  return {
    ok: true, row: row, category: draft.category, subject: draft.subject, body: enforced.body,
    bodyChars: enforced.body.length, truncated: enforced.truncated
  };
}

/** Writes the incoming reply and the chosen response back onto the same Outreach Drafts row -- keeps the whole thread on one row rather than spawning a parallel table. */
function commitReplyDraft(row, incomingReply, replyBody, replyBodyRuns) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OUTREACH_DRAFTS);
  ensureExtraColumns_(sheet, ['Last Reply', 'Reply Category', 'Reply Draft']);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };

  if (colOf('Last Reply')) sheet.getRange(row, colOf('Last Reply')).setValue(sanitizeCellText_(incomingReply));
  const replyCol = colOf('Reply Draft');
  if (replyCol) {
    const cell = sheet.getRange(row, replyCol);
    if (replyBodyRuns && replyBodyRuns.length) applyRichTextToCell_(cell, replyBodyRuns, replyBody);
    else cell.setValue(sanitizeCellText_(replyBody));
    cell.setWrap(true);
  }
  return { ok: true };
}

function draftReplyCopy_(channelData, originalSubject, originalBody, incomingReply, customInstructions) {
  const rateContext = channelData.suggestedRate
    ? 'Their estimated rate range on file is ' + channelData.suggestedRate + ': use this as the concrete number to offer if they ask about price.'
    : 'No rate estimate is on file for this creator: if they ask about price, ask what budget range they had in mind rather than inventing a number.';

  const prompt =
    'You work at a boutique creator-partnerships agency. You already sent the outreach email below to a creator ' +
    'on behalf of a brand-matching service, and they replied. Draft a short, human reply to what they actually said.\n\n' +
    'Original email sent:\nSubject: ' + originalSubject + '\nBody: ' + originalBody + '\n\n' +
    'Their reply:\n"' + incomingReply + '"\n\n' +
    rateContext + '\n\n' +
    'First, classify their reply into exactly one category: rate_question, objection, info_request, interested, or other.\n\n' +
    'Then follow the guidance for that category:\n' +
    Object.keys(REPLY_CATEGORY_GUIDANCE).map(function (k) { return '- ' + k + ': ' + REPLY_CATEGORY_GUIDANCE[k]; }).join('\n') + '\n\n' +
    'The same rules as any outreach email still apply: never sell the agency itself, this is always about ' +
    'supporting the creator and getting them brand deals, not about the service. The reply should feel like it came ' +
    'from a real person who already read what they wrote, not a bot picking a template. ' +
    'This draft will be rejected if it uses any of these AI tells: em dashes as sentence connectors; ' +
    '"I hope this email finds you well"; "I wanted to reach out"; "resonate(s/d)"; "elevate"; "unlock"; "seamless"; ' +
    '"delve"; "leverage"; superlatives like "incredible/amazing/phenomenal"; exclamation points; or a closing line ' +
    'that explicitly begs for a reply. Use contractions. Keep it short: a reply is not a second cold email.\n\n' +
    (customInstructions
      ? 'Additional preferences for this reply: "' + customInstructions.replace(/"/g, "'") + '". Follow them where ' +
        'they do not conflict with the rules above.\n\n'
      : '') +
    'Respond as JSON: {"category": "...", "subject": "...", "body": "..."}\n' +
    '- "subject": "Re: ' + originalSubject.replace(/"/g, "'") + '" unless a different subject genuinely fits better.\n' +
    '- "body": the reply itself. HARD LIMIT ' + OUTREACH_EMAIL_MAX_CHARS + ' characters, no exceptions. Signs off with "[Your name]" on its own line.';

  const result = geminiCallJson_(prompt);
  const validCategories = Object.keys(REPLY_CATEGORY_GUIDANCE);
  const category = validCategories.indexOf(result.category) !== -1 ? result.category : 'other';
  return {
    category: category,
    subject: String(result.subject || ('Re: ' + originalSubject)).trim(),
    body: String(result.body || '').trim()
  };
}

/** Native dropdown for Status, same pattern as Outreach's and Campaigns' Stage column. */
function ensureOutreachDraftStatusColumn_(sheet) {
  const statusCol = OUTREACH_DRAFT_HEADERS.indexOf('Status') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_DRAFT_STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
}

/**
 * Bulk-sends the currently-selected Outreach Drafts rows as real emails,
 * via MailApp (sends as the Sheet owner's own Gmail address -- the
 * script.send_mail scope, not full Gmail access: Koli only ever sends,
 * never reads or manages the inbox). Deliberately NOT a one-click
 * action: always shows exactly who it's about to email and why before
 * anything goes out, and any row already marked Sent is called out by
 * name so a re-send is a decision, not an accident.
 */
function sendApprovedOutreachDrafts() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Send Outreach Drafts'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.OUTREACH_DRAFTS) {
    ui.alert('Select one or more rows on the Outreach Drafts tab first, then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select one or more data rows on Outreach Drafts first, then run this again.');
    return;
  }

  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);

  const startRow = range.getRow(), numRows = range.getNumRows();
  const rows = [];
  for (let r = startRow; r < startRow + numRows; r++) {
    const channelId = colOf('Channel ID') ? sheet.getRange(r, colOf('Channel ID')).getValue() : '';
    const subject = colOf('Subject') ? sheet.getRange(r, colOf('Subject')).getValue() : '';
    const body = colOf('Email Body') ? sheet.getRange(r, colOf('Email Body')).getValue() : '';
    const status = colOf('Status') ? sheet.getRange(r, colOf('Status')).getValue() : '';
    const sentDate = colOf('Sent Date') ? sheet.getRange(r, colOf('Sent Date')).getValue() : '';
    if (!channelId || !subject || !body) continue; // blank row caught in the selection

    let contact = '';
    if (channelsSheet) {
      const idCol = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0].indexOf('ID') + 1;
      const channelRow = idCol ? findRowByKey_(channelsSheet, idCol, channelId) : -1;
      if (channelRow !== -1) contact = getChannelRowData_(channelsSheet, channelRow).email || '';
    }
    rows.push({ row: r, channelId: channelId, subject: subject, body: body, contact: contact, alreadySent: status === 'Sent', sentDate: sentDate });
  }
  if (!rows.length) { ui.alert('No usable draft rows in that selection.'); return; }

  const sendable = rows.filter(function (r) { return r.contact && r.contact !== 'Not found'; });
  const noContact = rows.filter(function (r) { return !r.contact || r.contact === 'Not found'; });
  if (!sendable.length) {
    ui.alert('None of the selected rows have a usable contact email on their Channels row. Nothing to send.');
    return;
  }

  const quota = MailApp.getRemainingDailyQuota();
  if (quota < sendable.length) {
    ui.alert('Not enough email quota left today: ' + quota + ' remaining, ' + sendable.length + ' selected. Send fewer, or try again tomorrow.');
    return;
  }

  const lines = [];
  lines.push('About to send ' + sendable.length + ' email(s):');
  sendable.forEach(function (r) {
    lines.push('- ' + r.contact + ' (' + r.subject + ')' + (r.alreadySent ? '  [ALREADY MARKED SENT on ' + r.sentDate + ' -- this will send again]' : ''));
  });
  if (noContact.length) {
    lines.push('', 'Skipping ' + noContact.length + ' row(s) with no usable contact email: ' + noContact.map(function (r) { return r.channelId; }).join(', '));
  }
  lines.push('', 'This actually sends real email from your own account. Continue?');

  const resp = ui.alert('Confirm send', lines.join('\n'), ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  const statusCol = colOf('Status'), sentDateCol = colOf('Sent Date');
  // Open tracking is best-effort and opt-in-by-availability: it only
  // activates when a Web App URL is actually configured (Settings), same
  // gate publishSelectedChannelsAsPage_ uses -- no Web App URL just means
  // no pixel gets embedded, never a broken send.
  const webAppUrl = getProp_(PROP_KEYS.WEB_APP_URL, '');
  let sentCount = 0, failCount = 0;
  sendable.forEach(function (r) {
    try {
      if (webAppUrl) {
        const channelId = r.channelId;
        const token = registerEmailTracking_(r.row, channelId);
        const htmlBody = String(r.body).split('\n').map(function (line) { return line || '&nbsp;'; }).join('<br>') +
          buildTrackingPixelTag_(webAppUrl, token);
        MailApp.sendEmail(r.contact, r.subject, r.body, { htmlBody: htmlBody });
      } else {
        MailApp.sendEmail(r.contact, r.subject, r.body);
      }
      if (statusCol) sheet.getRange(r.row, statusCol).setValue('Sent');
      if (sentDateCol) { sheet.getRange(r.row, sentDateCol).setValue(new Date()); sheet.getRange(r.row, sentDateCol).setNumberFormat('yyyy-mm-dd hh:mm'); }
      sentCount++;
    } catch (e) {
      failCount++;
    }
  });

  ui.alert('Sent ' + sentCount + ' email(s)' + (failCount ? ', ' + failCount + ' failed' : '') + (noContact.length ? ', ' + noContact.length + ' skipped (no contact email)' : '') + '.');
}
