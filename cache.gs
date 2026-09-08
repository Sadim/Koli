/**
 * cache.gs
 * Thin wrapper around CacheService so every service reads/writes cache
 * the same way, with JSON handled centrally and a single TTL default.
 *
 * Deliberately script-scoped (getScriptCache()), not document-scoped —
 * everything cached here (YouTube channel/video data, resolved IDs,
 * Gemini-derived niche/about text, SponsorBlock, Reddit signals) is
 * public data about YouTube channels, not anything private to one
 * customer's spreadsheet. Sharing this cache across every document a
 * multi-tenant deployment serves is a genuine efficiency win — two
 * different customers analyzing the same popular channel both benefit
 * from one cached fetch — not a privacy leak. Anything genuinely
 * tenant-specific (settings, secrets, the webhook lockout counter) uses
 * Document Properties/Cache instead — see constants.gs and inboxService.gs.
 */

function cacheGet_(key) {
  const raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cachePut_(key, value, ttlSeconds) {
  const ttl = ttlSeconds || DEFAULTS.CACHE_TTL_SECONDS;
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), Math.min(ttl, 21600));
  } catch (e) {
    // Cache values over 100KB throw — fail silently, caller just refetches next time.
  }
}

function cacheKey_(namespace, id) {
  return namespace + ':' + id;
}

/**
 * Wraps a fetch function with cache-or-fetch-and-store semantics.
 * @param {string} key
 * @param {Function} fetchFn - zero-arg function returning the value to cache
 * @param {number} [ttlSeconds]
 */
function withCache_(key, fetchFn, ttlSeconds) {
  const cached = cacheGet_(key);
  if (cached !== null) return cached;
  const fresh = fetchFn();
  if (fresh !== null && fresh !== undefined) {
    cachePut_(key, fresh, ttlSeconds);
  }
  return fresh;
}
