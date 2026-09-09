/**
 * geminiService.gs
 * All calls to the Gemini API. Channel analysis and video analysis each
 * make exactly ONE Gemini call now (previously 1 + up to 5 for channels,
 * and 3 for videos): everything that call used to ask separately is now
 * one JSON schema in one prompt. Estimate fields stay labeled as such
 * downstream in sheetWriter.gs regardless of how the call is shaped.
 */

function geminiApiKey_() {
  const key = getProp_(PROP_KEYS.GEMINI_API_KEY, '');
  if (!key) throw new Error('Gemini API key is not set. Add it in Koli > Settings.');
  return key;
}

/** Gemini 429 responses often include a suggested wait time: use it when present instead of guessing. */
function parseRetryDelayMs_(body) {
  try {
    const parsed = JSON.parse(body);
    const details = parsed.error && parsed.error.details;
    if (!details) return null;
    const retryInfo = details.find(function (d) { return d.retryDelay; });
    if (!retryInfo) return null;
    const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''));
    return isNaN(seconds) ? null : Math.round(seconds * 1000);
  } catch (e) { return null; }
}

/**
 * Public entry point every caller in Koli already uses. Tries Gemini
 * first (with its own internal retry/backoff, unchanged); if that's
 * exhausted, falls through to Mistral, then Groq: only for providers
 * with a key actually configured (BYOK, optional fallback, not
 * required). Transparent to every existing caller: none of them
 * needed to change for this.
 */
function geminiCallJson_(prompt) {
  const errors = [];
  try {
    return callGeminiJson_(prompt);
  } catch (e) {
    errors.push('Gemini: ' + e.message);
  }
  if (getProp_(PROP_KEYS.MISTRAL_API_KEY, '')) {
    try {
      return callMistralJson_(prompt);
    } catch (e) {
      errors.push('Mistral: ' + e.message);
    }
  }
  if (getProp_(PROP_KEYS.GROQ_API_KEY, '')) {
    try {
      return callGroqJson_(prompt);
    } catch (e) {
      errors.push('Groq: ' + e.message);
    }
  }
  throw new Error('All configured AI providers failed:\n' + errors.join('\n'));
}

function callGeminiJson_(prompt) {
  const key = geminiApiKey_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    DEFAULTS.GEMINI_MODEL + ':generateContent?key=' + key;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };

  let attempt = 0, lastError, wasRateLimited = false;
  while (attempt < DEFAULTS.GEMINI_MAX_RETRIES) {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const body = resp.getContentText();

    if (code === 200) {
      try {
        const data = JSON.parse(body);
        const text = data.candidates[0].content.parts[0].text;
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(cleaned);
      } catch (e) {
        lastError = new Error('Gemini returned unparseable JSON: ' + e.message);
        attempt++; Utilities.sleep(Math.pow(2, attempt) * 500); continue;
      }
    }
    if (code === 429 || code >= 500) {
      wasRateLimited = wasRateLimited || code === 429;
      lastError = new Error('Gemini API ' + code);
      const suggested = code === 429 ? parseRetryDelayMs_(body) : null;
      const waitMs = suggested || (Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 300));
      Utilities.sleep(Math.min(waitMs, 20000));
      attempt++; continue;
    }
    throw new Error('Gemini API ' + code + ': ' + body.slice(0, 300));
  }
  if (wasRateLimited) {
    throw new Error('Gemini API rate limit (429): your key\'s quota was still exceeded after retrying. ' +
      'This is common on free-tier Gemini keys under back-to-back requests. Wait a minute and try again, ' +
      'or check your tier at https://aistudio.google.com/apikey.');
  }
  throw lastError || new Error('Gemini API request failed after retries');
}

/** Mistral, OpenAI-compatible chat completions, JSON mode. */
function callMistralJson_(prompt) {
  const key = getProp_(PROP_KEYS.MISTRAL_API_KEY, '');
  if (!key) throw new Error('no key configured');
  const payload = {
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2
  };
  const resp = UrlFetchApp.fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) throw new Error('Mistral API ' + code + ': ' + body.slice(0, 300));
  const data = JSON.parse(body);
  return JSON.parse(data.choices[0].message.content);
}

/** Groq, OpenAI-compatible chat completions, JSON mode. */
function callGroqJson_(prompt) {
  const key = getProp_(PROP_KEYS.GROQ_API_KEY, '');
  if (!key) throw new Error('no key configured');
  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2
  };
  const resp = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) throw new Error('Groq API ' + code + ': ' + body.slice(0, 300));
  const data = JSON.parse(body);
  return JSON.parse(data.choices[0].message.content);
}

/**
 * ONE call for the whole Channel analysis: niche keywords, a 300-char
 * About/content-type summary (for the Channel cell note), and sponsor
 * detection scanned across up to 5 recent videos (Feature 4 signal).
 */
/**
 * Gemini is asked for an int 1-10, but nothing enforces that on its end:
 * an occasional out-of-range or malformed value flowing through
 * unclamped was the actual cause of a real bug (a negative authenticity
 * score pushed Grade's composite below every band's threshold, so
 * GRADE_BANDS.find() returned undefined and the whole analysis crashed).
 * Never trust an LLM's numeric output against a stated range without
 * checking it.
 */
function clampAuthenticityScore_(rawScore) {
  // Number(null) is 0, not NaN: without this explicit check, a genuine
  // "no comment sample" null (returned on purpose when there's nothing to
  // score) silently became a real score of 1, the worst possible value,
  // instead of staying null. That defeated the neutral-50 fallback
  // computeEngagementQualityScore_ specifically has for this case (see
  // channelMetricsService.gs): a channel with no data was scoring as if
  // its comments looked bot-farmed.
  if (rawScore === null || rawScore === undefined || rawScore === '') return null;
  const n = Number(rawScore);
  if (isNaN(n)) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function enrichChannel_(description, recentVideos, commentSample) {
  const sponsorScanVideos = recentVideos.slice(0, 5);
  const titleList = recentVideos.slice(0, 20).map(function (v) { return v.title; });
  const commentText = (commentSample || []).slice(0, 20).map(function (c) { return c.text; }).join('\n---\n');

  const prompt =
    'You are analyzing a YouTube channel for an influencer-marketing agency. Given the ' +
    'channel description and recent video titles/descriptions below, return JSON with:\n' +
    '1. "mainNiche": one short main niche/category.\n' +
    '2. "subNiches": up to 5 short sub-niche keywords/phrases, most to least central.\n' +
    '3. "aboutSummary": a plain-English summary (300 characters MAX, hard limit) of what the ' +
    'channel is about and what kinds of videos it posts, based on the description and titles.\n' +
    '4. "sponsorsByVideo": for EACH of the numbered recent videos below (use its index, 0-based), ' +
    'any brand sponsorships/paid promotions/affiliate deals mentioned in that video\'s own description ' +
    '(phrases like "sponsored by", "thanks to X for supporting", branded discount codes, "#ad"). ' +
    'Do not guess brands only mentioned in passing. Use [] for a video with no sponsor found.\n' +
    '5. "audience": {"topLocations": ["Country1","Country2"], "genderSplit": "e.g. 65% M / 35% F", ' +
    '"ageBracket": "e.g. 18-24"}: an ESTIMATE from description/titles/comment-language signals, not ' +
    'real analytics.\n' +
    '6. "authenticity": {"score": <int 1-10, 1=bot/spam-farmed comments, 10=genuine organic>} based on ' +
    'the comment sample below (from the channel\'s most recent video with comments). If no comment ' +
    'sample given, score: null.\n\n' +
    'Respond as JSON: {"mainNiche": "...", "subNiches": ["...", ...], "aboutSummary": "...", ' +
    '"sponsorsByVideo": [{"index": 0, "sponsors": [{"brand": "...", "evidence": "..."}]}, ...], ' +
    '"audience": {...}, "authenticity": {...}}\n\n' +
    'Channel description:\n' + description.slice(0, 1500) + '\n\n' +
    'Recent video titles (for niche only):\n' + titleList.join('\n') + '\n\n' +
    'Recent videos (for sponsor scan, indexed):\n' +
    sponsorScanVideos.map(function (v, i) { return i + ': ' + v.title + ': ' + v.description.slice(0, 500); }).join('\n---\n') +
    (commentText ? '\n\nComment sample (for authenticity only):\n' + commentText.slice(0, 3000) : '');

  const result = geminiCallJson_(prompt);
  const audience = result.audience || {};
  return {
    mainNiche: result.mainNiche || '',
    subNiches: (result.subNiches || []).slice(0, 5),
    aboutSummary: (result.aboutSummary || '').slice(0, 300),
    sponsorsByVideo: result.sponsorsByVideo || [],
    audience: {
      location: (audience.topLocations || []).join(', ') || 'Insufficient signal',
      gender: audience.genderSplit || 'Insufficient signal',
      age: audience.ageBracket || 'Insufficient signal'
    },
    authenticity: clampAuthenticityScore_(result.authenticity && result.authenticity.score)
  };
}

/**
 * ONE call for the whole Video analysis: comment authenticity, audience
 * estimate, and sponsor detection from this video's own description + comments.
 */
function enrichVideo_(video) {
  const commentText = (video.comments || []).slice(0, 40).map(function (c) { return c.text; }).join('\n---\n');

  const prompt =
    'You are analyzing one YouTube video for an influencer-marketing agency. Return JSON with:\n' +
    '1. "authenticity": {"score": <int 1-10, 1=bot/spam-farmed comments, 10=genuine organic>, ' +
    '"justification": "<one sentence>"} based on the comment sample below. If no comments, score: null.\n' +
    '2. "audience": {"topLocations": ["Country1","Country2"], "genderSplit": "e.g. 65% M / 35% F", ' +
    '"ageBracket": "e.g. 18-24"}: an ESTIMATE from title/description/niche/comment-language signals only, ' +
    'not real analytics.\n' +
    '3. "sponsors": [{"brand": "...", "evidence": "short quote or paraphrase"}]: any brand sponsorships/' +
    'paid promotions/affiliate deals/discount codes/#ad mentioned in the description or comments below. ' +
    '[] if none found.\n\n' +
    'Respond as JSON: {"authenticity": {...}, "audience": {...}, "sponsors": [...]}\n\n' +
    'Title: ' + video.title + '\nDescription:\n' + video.description.slice(0, 2000) +
    '\n\nComment sample:\n' + commentText.slice(0, 6000);

  const result = geminiCallJson_(prompt);
  const authenticity = result.authenticity || {};
  const audience = result.audience || {};

  return {
    authenticity: {
      score: (video.comments && video.comments.length) ? clampAuthenticityScore_(authenticity.score) : null,
      justification: authenticity.justification || (video.comments && video.comments.length ? '' : 'No comments available to sample.')
    },
    audience: {
      location: (audience.topLocations || []).join(', ') || 'Insufficient signal',
      gender: audience.genderSplit || 'Insufficient signal',
      age: audience.ageBracket || 'Insufficient signal'
    },
    sponsors: result.sponsors || []
  };
}

/**
 * Standalone 300-char About/content-type summary, cached per channel so
 * multiple videos from the same channel (Video analysis) don't re-trigger
 * this: see cacheKey_('aboutSummary', channelId) in sheetWriter.gs.
 */
function deriveAboutSummary_(description, recentTitles) {
  const prompt =
    'Summarize in plain English what this YouTube channel is about and what kinds of videos ' +
    'it posts, based on its description and recent video titles. Hard limit: 300 characters. ' +
    'Respond as JSON: {"summary": "..."}\n\n' +
    'Description:\n' + description.slice(0, 1200) + '\n\nRecent titles:\n' + (recentTitles || []).slice(0, 10).join('\n');
  const result = geminiCallJson_(prompt);
  return (result.summary || '').slice(0, 300);
}

/**
 * Discover feature: expands a seed channel/video's description into search
 * keywords to feed search.list, and separately into a coarse niche label
 * used for scoring candidate matches.
 */
function deriveSearchKeywords_(seedDescription, seedTitles) {
  const prompt =
    'Given this YouTube channel/video description and recent titles, return JSON: ' +
    '{"searchKeywords": ["kw1","kw2","kw3"], "niche": "short niche label"}. ' +
    'searchKeywords should be terms a person would type into YouTube search to find similar content ' +
    '(3-5 words total across the array, not full sentences).\n\n' +
    'Description:\n' + seedDescription.slice(0, 1200) + '\n\nTitles:\n' + (seedTitles || []).join('\n');

  const result = geminiCallJson_(prompt);
  return {
    searchKeywords: result.searchKeywords || [],
    niche: result.niche || ''
  };
}
