/**
 * sponsorService.gs
 * Aggregate Sponsors tab always updates (cheap, useful by default).
 * Sponsor Mentions (per-mention detail) and in-video timestamps are each
 * independent Settings checkboxes — see PROP_KEYS.LOG_SPONSOR_MENTIONS
 * and PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP.
 *
 * Verification tier: for any video, SponsorBlock is checked first (free,
 * crowd-verified, exact timestamps) before falling back to Gemini's
 * text-based guess or the caption-fuzzy-match timestamp. When SponsorBlock
 * confirms a segment but Gemini found no brand name in the description
 * (spoken-only disclosure), that mention is still logged — as
 * "Unknown (SponsorBlock-confirmed)" — rather than silently dropped.
 * You can rename the brand manually once you've checked the clip; same
 * manual-entry protection as the Email field applies going forward.
 */

function recordSponsorMentions(channelId, channelName, video, sponsors) {
  const sbSegments = video.videoId ? getSponsorBlockSegments_(video.videoId) : [];
  const effectiveSponsors = (sponsors && sponsors.length) ? sponsors
    : (sbSegments.length ? [{ brand: 'Unknown (SponsorBlock-confirmed)', evidence: 'No brand name found in description/comments — SponsorBlock confirms a sponsor segment exists.' }] : []);

  if (!effectiveSponsors.length) return;

  upsertAggregateSponsors_(channelId, channelName, video, effectiveSponsors, sbSegments);

  if (getBoolProp_(PROP_KEYS.LOG_SPONSOR_MENTIONS, false)) {
    logSponsorMentions_(channelName, video, effectiveSponsors, sbSegments);
  }
}

function upsertAggregateSponsors_(channelId, channelName, video, sponsors, sbSegments) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SPONSORS, SPONSOR_HEADERS);
  const data = sheet.getDataRange().getValues();
  const publishedDate = video.publishedAt ? new Date(video.publishedAt) : new Date();
  const safeTitle = sanitizeCellText_(video.title || '').replace(/"/g, "'");
  const sampleVideoValue = video.videoId
    ? '=HYPERLINK("' + videoUrl_(video.videoId) + '","' + safeTitle + '")'
    : safeTitle;
  const sbTimestamp = (sbSegments && sbSegments.length) ? formatSeconds_(sbSegments[0].start) : null;

  sponsors.forEach(function (s) {
    const brand = sanitizeCellText_(canonicalBrandName_(s.brand) || s.brand);
    const isUnknown = /^Unknown \(SponsorBlock-confirmed\)/.test(s.brand);
    const rowIndex = findSponsorRow_(data, channelId, s.brand);
    let targetRow;

    if (rowIndex === -1) {
      sheet.appendRow([sanitizeCellText_(channelName), channelId, brand, publishedDate, publishedDate, 1, '']);
      targetRow = sheet.getLastRow();
      const sampleCell = sheet.getRange(targetRow, 7);
      video.videoId ? sampleCell.setFormula(sampleVideoValue) : sampleCell.setValue(sampleVideoValue);
      data.push([channelName, channelId, brand, publishedDate, publishedDate, 1, '']);
    } else {
      targetRow = rowIndex + 1; // data[0] is header, so data[i] -> sheet row i+1
      const existingCount = Number(data[rowIndex][5]) || 0;
      const firstSeen = data[rowIndex][3];
      const lastSeen = data[rowIndex][4];

      sheet.getRange(targetRow, 4).setValue(publishedDate < firstSeen ? publishedDate : firstSeen);
      sheet.getRange(targetRow, 5).setValue(publishedDate > lastSeen ? publishedDate : lastSeen);
      sheet.getRange(targetRow, 6).setValue(existingCount + 1);
      data[rowIndex][5] = existingCount + 1;
    }

    if (sbTimestamp) {
      const brandCell = sheet.getRange(targetRow, 3);
      brandCell.setNote(isUnknown
        ? 'Sponsor not identified from text — jump to ' + sbTimestamp + ' in the video to check manually.'
        : 'SponsorBlock-verified timestamp: ' + sbTimestamp);
    }
  });
}

/**
 * Normalizes a brand name for matching/deduplication — "Nike", "Nike Inc",
 * "NIKE, LLC." all collapse to the same key. Strips common legal suffixes,
 * punctuation, and extra whitespace. Used for MATCHING only — the sheet
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

function logSponsorMentions_(channelName, video, sponsors, sbSegments) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SPONSOR_MENTIONS, SPONSOR_MENTION_HEADERS);
  const attemptTimestamp = getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false);
  const publishedDate = video.publishedAt ? new Date(video.publishedAt) : new Date();
  const safeTitle = sanitizeCellText_(video.title || '').replace(/"/g, "'");
  const videoValue = video.videoId
    ? '=HYPERLINK("' + videoUrl_(video.videoId) + '","' + safeTitle + '")'
    : safeTitle;
  const sbBest = (sbSegments && sbSegments.length) ? formatSeconds_(sbSegments[0].start) : null;

  sponsors.forEach(function (s) {
    let timestamp = '';
    if (sbBest) {
      timestamp = sbBest + ' (verified — SponsorBlock)';
    } else if (attemptTimestamp && video.videoId) {
      const ts = findSponsorTimestamp_(video.videoId, s.evidence || s.brand);
      timestamp = ts ? (ts + ' (estimated — caption match)') : 'No match found';
    }
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 6).setValues([[
      sanitizeCellText_(channelName), '', sanitizeCellText_(canonicalBrandName_(s.brand) || s.brand), publishedDate, timestamp, sanitizeCellText_(s.evidence || '')
    ]]);
    const videoCell = sheet.getRange(row, 2);
    video.videoId ? videoCell.setFormula(videoValue) : videoCell.setValue(videoValue);
  });
}

function getSponsorsForChannel(channelId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SPONSORS, SPONSOR_HEADERS);
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .filter(function (row) { return row[1] === channelId; })
    .map(function (row) { return { brand: row[2], firstSeen: row[3], lastSeen: row[4], mentions: row[5] }; })
    .sort(function (a, b) { return b.mentions - a.mentions; });
}
