/**
 * activityLogService.gs
 * One shared, append-only timeline across every CRM entity (Channel,
 * Opportunity, Campaign, Person) -- generalizes the existing Snapshots
 * pattern (recordSubscriberSnapshot_/getChannelSnapshotHistory_,
 * sheetWriter.gs) instead of building a fourth bespoke per-entity log.
 * A call transcript summary is just a row with type 'Transcript Summary'
 * and the text in Detail -- same shape as a plain Email/Note/Meeting
 * entry, no schema variant needed. The actual capture mechanism (mic/
 * tab-audio + speech-to-text) is separate, later scope: this only defines
 * where the result lands once it exists.
 */

function recordActivity_(entityType, entityId, type, summary, detail, relatedLink) {
  if (ACTIVITY_ENTITY_TYPES.indexOf(entityType) === -1) throw new Error('Unknown entity type: ' + entityType);
  if (ACTIVITY_TYPES.indexOf(type) === -1) throw new Error('Unknown activity type: ' + type);
  const sheet = getOrCreateSheet_(SHEET_NAMES.ACTIVITY_LOG, ACTIVITY_LOG_HEADERS);
  sheet.appendRow([entityType, entityId, type, new Date(), sanitizeCellText_(summary || ''), sanitizeCellText_(detail || ''), relatedLink || '']);
}

/** Mirrors getChannelSnapshotHistory_ (sheetWriter.gs) exactly: full-sheet scan filtered by key, sorted oldest-first. Same brute-force shape -- fine at this scale, same as Snapshots. */
function getEntityTimeline_(entityType, entityId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.ACTIVITY_LOG, ACTIVITY_LOG_HEADERS);
  const data = sheet.getDataRange().getValues().slice(1);
  return data
    .filter(function (r) { return r[0] === entityType && r[1] === entityId; })
    .map(function (r) {
      return { type: r[2], timestamp: r[3] instanceof Date ? r[3].toISOString() : String(r[3]), summary: r[4], detail: r[5], relatedLink: r[6] };
    })
    .sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
}

/** Web-App-reachable wrapper -- logs a manual note/call/meeting/transcript-summary against any entity. Kept generic (one function, an entityType param) rather than one per entity, matching the generalized get_record/set_record actions in inboxService.gs/recordService.gs. */
function logActivityForEntity(entityType, entityId, type, summary, detail) {
  recordActivity_(entityType, entityId, type, summary, detail, '');
  return { ok: true };
}
