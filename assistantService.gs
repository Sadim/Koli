/**
 * assistantService.gs
 * Plain-English command box, scoped entirely to Koli's own actions. This
 * is deliberately NOT a general agent — Gemini can only pick from the
 * tools declared below, and every tool maps to an already-vetted Koli
 * function. No arbitrary code execution, no access outside this
 * spreadsheet. That scoping is the point, not a limitation.
 */

const ASSISTANT_TOOLS = [
  {
    name: 'analyze_channel',
    description: 'Runs full channel analysis (niche, posting cadence, contact email, subscriber count, ' +
      'CPM estimate) on a YouTube channel and writes it to the Channels sheet.',
    parameters: {
      type: 'OBJECT',
      properties: { channelInput: { type: 'STRING', description: 'A channel URL, @handle, or channel ID' } },
      required: ['channelInput']
    }
  },
  {
    name: 'analyze_video',
    description: 'Runs full video analysis (views, engagement, comment authenticity, audience estimate) ' +
      'on a YouTube video and writes it to the Videos sheet.',
    parameters: {
      type: 'OBJECT',
      properties: { videoInput: { type: 'STRING', description: 'A video URL or video ID' } },
      required: ['videoInput']
    }
  },
  {
    name: 'discover_similar',
    description: 'Finds up to 5 channels or videos similar to a seed channel/video, matched by keywords and niche.',
    parameters: {
      type: 'OBJECT',
      properties: {
        seedInput: { type: 'STRING', description: 'A channel or video URL to base the search on' },
        searchType: { type: 'STRING', enum: ['channel', 'video'], description: 'Find similar channels or similar videos' },
        resultCount: { type: 'INTEGER', description: 'How many results to return, 1-5' }
      },
      required: ['seedInput', 'searchType']
    }
  },
  {
    name: 'export_one_pager',
    description: 'Generates a pitch-ready PDF one-pager for a channel that has ALREADY been analyzed and exists on the Channels sheet.',
    parameters: {
      type: 'OBJECT',
      properties: { channelInput: { type: 'STRING', description: 'A channel URL, @handle, or channel ID' } },
      required: ['channelInput']
    }
  },
  {
    name: 'check_brand_safety',
    description: 'Checks recent Reddit mentions of a creator or brand name for controversy or reputational red flags.',
    parameters: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING', description: 'A creator or brand name, or a channel URL' } },
      required: ['name']
    }
  }
];

function runAssistantCommand(userText) {
  try {
    const decision = geminiCallWithTools_(userText, ASSISTANT_TOOLS);

    if (decision.type === 'text') {
      return {
        ok: true,
        summary: decision.text ||
          'Not sure which Koli action that maps to. Try being specific, e.g. ' +
          '"analyze this channel: <link>" or "find channels similar to <link>".'
      };
    }
    return executeAssistantTool_(decision.name, decision.args);
  } catch (e) {
    return { ok: false, summary: 'Assistant error: ' + e.message };
  }
}

function executeAssistantTool_(name, args) {
  switch (name) {
    case 'analyze_channel': {
      const result = analyzeChannelOne(args.channelInput);
      return {
        ok: result.ok,
        summary: result.ok ? ('Analyzed ' + result.name + ' — see the Channels sheet.') : ('Could not analyze: ' + result.message)
      };
    }
    case 'analyze_video': {
      const result = analyzeVideoOne(args.videoInput);
      return {
        ok: result.ok,
        summary: result.ok ? ('Analyzed "' + result.title + '" — see the Videos sheet.') : ('Could not analyze: ' + result.message)
      };
    }
    case 'discover_similar': {
      const filters = { matchKeywords: true, matchNiche: true, matchEngagement: false, matchPostsPerMonth: false, matchViews: false };
      const result = runDiscoverOne(args.seedInput, args.searchType || 'channel', args.resultCount || 5, filters);
      return { ok: result.ok, summary: result.ok ? result.message : ('Discover failed: ' + result.message) };
    }
    case 'export_one_pager': {
      try {
        const channelId = resolveChannelId(args.channelInput);
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
        const row = sheet ? findRowByKey_(sheet, 3, channelId) : -1;
        if (row === -1) return { ok: false, summary: 'That channel hasn\'t been analyzed yet — ask me to analyze it first.' };
        const result = buildCreatorOnePager_(row);
        writeReportLink_(row, result.pdfUrl);
        return { ok: true, summary: 'One-pager ready for ' + result.channelName + ' — check the Report column on Channels.' };
      } catch (e) {
        return { ok: false, summary: 'Could not export: ' + e.message };
      }
    }
    case 'check_brand_safety': {
      const result = checkBrandSafety(args.name);
      return { ok: true, summary: result.summary };
    }
    default:
      return { ok: false, summary: 'Unknown tool requested: ' + name };
  }
}
