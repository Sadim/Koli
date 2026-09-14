/**
 * dislikeService.gs
 * YouTube killed public dislike counts in 2021 -- no official source
 * exists. Wired to the free, community-run "Return YouTube Dislike" API
 * (returnyoutubedislike.com) as a clearly-labeled ESTIMATE, never claimed
 * as real YouTube data.
 *
 * Revived 2026-09-14 after being fully removed earlier this project's life
 * (a stat tile + its own column) -- this time stored as a cell NOTE on
 * Likes instead, per the founder's explicit ask, on every sheet that has
 * a Likes column (Videos, Profile). Learned directly from a real bug
 * found THIS session (the social-handle surfacing fix): a note only helps
 * if something actually reads it back, so the two write sites below are
 * paired with real surfacing changes in uiHandlers.gs (Videos' curated
 * config gets a dedicated noteOnly field; the untrimmed fallback path
 * that every uncurated sheet like Profile uses now checks for a Likes
 * note generically) -- not left to repeat the exact same gap.
 */

function fetchDislikeEstimate_(videoId) {
  try {
    const resp = UrlFetchApp.fetch(
      'https://returnyoutubedislike.com/votes?videoId=' + encodeURIComponent(videoId),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    const data = JSON.parse(resp.getContentText());
    return (typeof data.dislikes === 'number') ? data.dislikes : null;
  } catch (e) {
    return null; // best-effort, same fail-soft convention as every other external-lookup signal in Koli (fetchAboutPageLinks_, captionsService.gs, etc.)
  }
}

/** Appends (never overwrites -- appendNote_, sheetWriter.gs) a dislike-estimate note onto whichever cell the caller is already writing a Likes value into. Silent no-op when the estimate can't be fetched. */
function appendDislikeEstimateNote_(cell, videoId) {
  const dislikes = fetchDislikeEstimate_(videoId);
  if (dislikes === null) return;
  appendNote_(cell,
    'Estimated dislikes: ' + dislikes.toLocaleString() +
    ' (community estimate via Return YouTube Dislike -- not real YouTube data; YouTube removed public dislike counts in 2021).'
  );
}
