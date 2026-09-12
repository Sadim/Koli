/**
 * sponsorService.gs
 * Sponsors is the only sponsor-detection sheet now: Sponsor Mentions
 * (the old per-mention detail log) is retired; its Posted/Timestamp/
 * Evidence columns live directly on the Sponsors rollup instead. The two
 * sheets were carrying almost the same information twice, so each
 * (channel, brand) row now just holds the LATEST mention's Posted date,
 * timestamp, and evidence text alongside the aggregate First Seen/Last
 * Seen/Mentions/Sample Video fields: full mention-by-mention history is
 * no longer kept, a deliberate simplification, not a bug.
 *
 * Verification tier: for any video, SponsorBlock is checked first (free,
 * crowd-verified, exact timestamps) before falling back to Gemini's
 * text-based guess or the caption-fuzzy-match timestamp. When SponsorBlock
 * confirms a segment but Gemini found no brand name in the description
 * (spoken-only disclosure), that mention is still logged: as
 * "Unknown (SponsorBlock-confirmed)": rather than silently dropped.
 * You can rename the brand manually once you've checked the clip; same
 * manual-entry protection as the Email field applies going forward.
 */

function recordSponsorMentions(channelId, channelName, video, sponsors) {
  const sbSegments = video.videoId ? getSponsorBlockSegments_(video.videoId) : [];
  const effectiveSponsors = (sponsors && sponsors.length) ? sponsors
    : (sbSegments.length ? [{ brand: 'Unknown (SponsorBlock-confirmed)', evidence: 'No brand name found in description/comments: SponsorBlock confirms a sponsor segment exists.' }] : []);

  if (!effectiveSponsors.length) return;

  upsertAggregateSponsors_(channelId, channelName, video, effectiveSponsors, sbSegments);
}

function upsertAggregateSponsors_(channelId, channelName, video, sponsors, sbSegments) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SPONSORS, SPONSOR_HEADERS);
  const data = sheet.getDataRange().getValues();
  const publishedDate = video.publishedAt ? new Date(video.publishedAt) : new Date();
  const safeTitle = sanitizeCellText_(video.title || '').replace(/"/g, "'");
  const sampleVideoValue = video.videoId
    ? '=HYPERLINK("' + videoUrl_(video.videoId) + '","' + safeTitle + '")'
    : safeTitle;

  // SponsorBlock's verified timestamp is free (sbSegments is already
  // fetched above): always attempted. The caption-fuzzy-match fallback
  // costs a real network call, so it stays behind its own Settings
  // toggle, same as before, just written here instead of a separate sheet.
  const sbTimestamp = (sbSegments && sbSegments.length) ? formatSeconds_(sbSegments[0].start) : null;
  const attemptCaptionTimestamp = getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false);

  sponsors.forEach(function (s) {
    const brand = sanitizeCellText_(canonicalBrandName_(s.brand) || s.brand);
    const isUnknown = /^Unknown \(SponsorBlock-confirmed\)/.test(s.brand);
    const rowIndex = findSponsorRow_(data, channelId, s.brand);
    let targetRow;

    let timestamp = '';
    if (sbTimestamp) {
      timestamp = sbTimestamp + ' (verified: SponsorBlock)';
    } else if (attemptCaptionTimestamp && video.videoId) {
      const ts = findSponsorTimestamp_(video.videoId, s.evidence || s.brand);
      timestamp = ts ? (ts + ' (estimated: caption match)') : 'No match found';
    }
    const evidence = sanitizeCellText_(s.evidence || '');

    if (rowIndex === -1) {
      sheet.appendRow([sanitizeCellText_(channelName), channelId, brand, publishedDate, publishedDate, 1, '', publishedDate, timestamp, evidence]);
      targetRow = sheet.getLastRow();
      const sampleCell = sheet.getRange(targetRow, 7);
      video.videoId ? sampleCell.setFormula(sampleVideoValue) : sampleCell.setValue(sampleVideoValue);
      data.push([channelName, channelId, brand, publishedDate, publishedDate, 1, '', publishedDate, timestamp, evidence]);
    } else {
      targetRow = rowIndex + 1; // data[0] is header, so data[i] -> sheet row i+1
      const existingCount = Number(data[rowIndex][5]) || 0;
      const firstSeen = data[rowIndex][3];
      const lastSeen = data[rowIndex][4];
      const isLatest = publishedDate >= lastSeen;

      sheet.getRange(targetRow, 4).setValue(publishedDate < firstSeen ? publishedDate : firstSeen);
      sheet.getRange(targetRow, 5).setValue(publishedDate > lastSeen ? publishedDate : lastSeen);
      sheet.getRange(targetRow, 6).setValue(existingCount + 1);
      data[rowIndex][5] = existingCount + 1;

      // Posted/Timestamp/Evidence track the LATEST mention only: an
      // older re-processed video shouldn't overwrite more recent evidence.
      if (isLatest) {
        sheet.getRange(targetRow, 8, 1, 3).setValues([[publishedDate, timestamp, evidence]]);
      }
    }

    if (sbTimestamp) {
      const brandCell = sheet.getRange(targetRow, 3);
      brandCell.setNote(isUnknown
        ? 'Sponsor not identified from text: jump to ' + sbTimestamp + ' in the video to check manually.'
        : 'SponsorBlock-verified timestamp: ' + sbTimestamp);
    }
  });
}

/**
 * Normalizes a brand name for matching/deduplication: "Nike", "Nike Inc",
 * "NIKE, LLC." all collapse to the same key. Strips common legal suffixes,
 * punctuation, and extra whitespace. Used for MATCHING only: the sheet
 * still displays whatever Gemini actually extracted, so a genuinely new
 * brand name isn't silently rewritten into something it never said.
 */
function findSponsorRow_(data, channelId, brand) {
  const brandKey = normalizeBrandName_(brand).toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === channelId && normalizeBrandName_(data[i][2]).toLowerCase() === brandKey) return i;
  }
  return -1;
}

/**
 * Deliberately opt-in, not automatic on every sponsor detection: this
 * makes one real Gemini call per brand and asks it to name a specific
 * human decision-maker, which is exactly the kind of question an LLM
 * will confidently answer wrong for a brand it doesn't have reliable
 * knowledge of. The prompt explicitly gives permission to say "unknown"
 * instead of inventing a plausible name, and the note written to the
 * sheet repeats the "unverified, confirm independently" caveat
 * regardless of what comes back -- undermining trust in Koli's outreach
 * with one wrong name would cost more than this feature is worth.
 */
function researchSponsorContacts() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Research Sponsor Contacts'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.SPONSORS) {
    ui.alert('Select one or more rows on the Sponsors sheet first, then run this again.');
    return;
  }
  const ranges = getActiveRangesSafe_();
  const rows = new Set();
  ranges.forEach(function (range) {
    if (!range) return;
    for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) { if (r >= 2) rows.add(r); }
  });
  if (!rows.size) {
    ui.alert('Select one or more data rows on Sponsors first, then run this again.');
    return;
  }

  let done = 0, failed = 0;
  [...rows].sort(function (a, b) { return a - b; }).forEach(function (row) {
    const brand = sheet.getRange(row, 3).getValue();
    if (!brand || /^Unknown \(SponsorBlock-confirmed\)/.test(brand)) { failed++; return; }
    try {
      const research = researchBrandContacts_(brand);
      sheet.getRange(row, 3).setNote(formatBrandContactsNote_(research));
      done++;
    } catch (e) {
      failed++;
    }
  });
  ui.alert('Researched ' + done + ' brand(s)' + (failed ? ', skipped ' + failed + ' (no usable brand name)' : '') + '. Check the note on each Brand cell.');
}

function researchBrandContacts_(brand) {
  const prompt =
    'You are researching public information about a company for a creator-partnerships agency deciding who to ' +
    'contact about a sponsorship opportunity.\n\n' +
    'Brand name: ' + brand + '\n\n' +
    '1. If you have reliable knowledge of this company\'s official website domain, state it. If you are not ' +
    'confident, say "unknown" rather than guessing a plausible-sounding domain.\n' +
    '2. Name the ROLES most likely to own creator/influencer sponsorship decisions at a company like this (e.g. ' +
    'CMO, Head of Marketing, Brand Partnerships Lead, Growth Marketing) -- general guidance for this type of ' +
    'company, not a claim about specific people.\n' +
    '3. ONLY if you have specific, reliable knowledge of a named individual CURRENTLY holding one of these roles ' +
    'at THIS exact company, name them with their title and, if known, a public handle (X/Twitter, LinkedIn, etc) ' +
    'they use professionally. People change jobs; if you are not confident this is current, do not include them. ' +
    'If you have no specific, reliable knowledge of who currently holds these roles at this exact company, return ' +
    'an empty list -- do NOT invent a plausible name.\n\n' +
    'Respond as JSON: {"website": "... or unknown", "targetRoles": ["...", "..."], ' +
    '"namedContacts": [{"name": "...", "title": "...", "handle": "... or none", "confidence": "low, medium, or high"}], ' +
    '"note": "one honest sentence on how confident this information actually is"}';

  const result = geminiCallJson_(prompt);
  return {
    brand: brand,
    website: String(result.website || 'unknown').trim(),
    targetRoles: Array.isArray(result.targetRoles) ? result.targetRoles : [],
    namedContacts: Array.isArray(result.namedContacts) ? result.namedContacts : [],
    note: String(result.note || '').trim()
  };
}

function formatBrandContactsNote_(r) {
  const lines = [];
  lines.push('Website: ' + r.website);
  lines.push('');
  lines.push('Likely decision-maker roles for sponsorship: ' + (r.targetRoles.length ? r.targetRoles.join(', ') : 'n/a'));
  lines.push('');
  if (r.namedContacts.length) {
    lines.push('Possible named contacts (UNVERIFIED -- confirm independently before reaching out):');
    r.namedContacts.forEach(function (c) {
      lines.push('- ' + c.name + ', ' + c.title + ' -- ' + (c.handle && c.handle !== 'none' ? c.handle : 'no public handle found') + ' (confidence: ' + c.confidence + ')');
    });
  } else {
    lines.push('No specific named contact found with reliable confidence. Reach out via the general roles above instead.');
  }
  if (r.note) { lines.push(''); lines.push(r.note); }
  lines.push('');
  lines.push('Generated ' + Utilities.formatDate(new Date(), getTimezone_(), 'MMM d, yyyy') + '. AI-inferred, not sourced from a directory -- treat as a starting point, not a fact.');
  return lines.join('\n');
}

function getSponsorsForChannel(channelId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SPONSORS, SPONSOR_HEADERS);
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .filter(function (row) { return row[1] === channelId; })
    .map(function (row) {
      return {
        brand: row[2], firstSeen: row[3], lastSeen: row[4], mentions: row[5],
        lastPosted: row[7], lastTimestamp: row[8], lastEvidence: row[9]
      };
    })
    .sort(function (a, b) { return b.mentions - a.mentions; });
}
