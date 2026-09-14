/**
 * brandService.gs
 * Canonical Brand directory (People/Opportunities key off Brand ID here,
 * not just a Brand name string) -- a real gap flagged during the CRM
 * data-model scoping pass: Campaigns/Brand Targets/Sponsors have always
 * stored Brand as a bare text column, so a typo ("Acme Corp" vs "Acme
 * Corp.") silently creates a phantom brand with no way to notice. This
 * doesn't migrate those older sheets (a separate, bigger backfill) -- it
 * gives every NEW write path one normalized place to resolve a Brand name
 * against, case/whitespace-insensitively, minting a new Brand row only
 * when nothing close enough already exists.
 */

/** Finds an existing Brand by case-insensitive/trimmed name match, or creates one. Returns {id, name} using the EXISTING row's stored name/casing on a match, not the caller's variant -- "acme corp " and "Acme Corp" converge on whichever spelling was recorded first. */
function resolveBrandId_(rawName) {
  const name = sanitizeCellText_(String(rawName || '').trim());
  if (!name) return { id: '', name: '' };

  const sheet = getOrCreateSheet_(SHEET_NAMES.BRANDS, BRAND_HEADERS);
  const lastRow = sheet.getLastRow();
  const normalized = name.toLowerCase();

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Brand ID, Name
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim().toLowerCase() === normalized) {
        return { id: rows[i][0], name: rows[i][1] };
      }
    }
  }

  const id = Utilities.getUuid();
  sheet.appendRow([id, name, new Date()]);
  return { id: id, name: name };
}

/** Read-only lookup by ID, for anything that already has a Brand ID and needs the display name back. Returns '' on no match rather than throwing -- a stale/deleted Brand row shouldn't break whatever record references it. */
function getBrandName_(brandId) {
  if (!brandId) return '';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BRANDS);
  if (!sheet) return '';
  const row = findRowByKey_(sheet, 1, brandId);
  return row === -1 ? '' : sheet.getRange(row, 2).getValue();
}
