/**
 * sponsorService.gs
 * Sponsors is the only sponsor-detection sheet now — Sponsor Mentions
 * (the old per-mention detail log) is retired; its Posted/Timestamp/
 * Evidence columns live directly on the Sponsors rollup instead. The two
 * sheets were carrying almost the same information twice, so each
 * (channel, brand) row now just holds the LATEST mention's Posted date,
 * timestamp, and evidence text alongside the aggregate First Seen/Last
 * Seen/Mentions/Sample Video fields — full mention-by-mention history is
 * no longer kept, a deliberate simplification, not a bug.
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
  // fetched above) — always attempted. The caption-fuzzy-match fallback
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
      timestamp = sbTimestamp + ' (verified — SponsorBlock)';
    } else if (attemptCaptionTimestamp && video.videoId) {
      const ts = findSponsorTimestamp_(video.videoId, s.evidence || s.brand);
      timestamp = ts ? (ts + ' (estimated — caption match)') : 'No match found';
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

      // Posted/Timestamp/Evidence track the LATEST mention only — an
      // older re-processed video shouldn't overwrite more recent evidence.
      if (isLatest) {
        sheet.getRange(targetRow, 8, 1, 3).setValues([[publishedDate, timestamp, evidence]]);
      }
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
