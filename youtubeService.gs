/**
 * youtubeService.gs
 * All direct contact with the YouTube Data API v3.
 *
 * Speed note: getChannelData()/getVideoData() are cache-first (see cache.gs).
 * prefetchChannels()/prefetchVideos() populate that cache for a whole batch
 * in one or two parallel round trips (UrlFetchApp.fetchAll) instead of one
 * round trip per item: call one of these once before looping items.
 */

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

function parseChannelInput_(input) {
  const s = (input || '').trim();
  if (!s) return null;
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(s)) return { type: 'id', value: s };
  if (/^@[\w.-]+$/.test(s)) return { type: 'handle', value: s };

  let m;
  if ((m = s.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/))) return { type: 'id', value: m[1] };
  if ((m = s.match(/youtube\.com\/@([\w.-]+)/))) return { type: 'handle', value: '@' + m[1] };
  if ((m = s.match(/youtube\.com\/c\/([\w.-]+)/))) return { type: 'legacy', value: m[1] };
  if ((m = s.match(/youtube\.com\/user\/([\w.-]+)/))) return { type: 'user', value: m[1] };

  // A pasted VIDEO link/ID resolves to that video's own channel, rather
  // than falling through to 'search' (which would search for a channel
  // literally named after a video URL, and always fail -- this was the
  // actual bug: Profile/Discover/anywhere else that accepts "a channel
  // or video link" only ever handled the channel half).
  const videoId = parseVideoInput_(s);
  if (videoId) return { type: 'video', value: videoId };

  return { type: 'search', value: s.replace(/^@/, '') };
}

function parseVideoInput_(input) {
  const s = (input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let m;
  if ((m = s.match(/[?&]v=([\w-]{11})/))) return m[1];
  if ((m = s.match(/youtu\.be\/([\w-]{11})/))) return m[1];
  if ((m = s.match(/shorts\/([\w-]{11})/))) return m[1];
  if ((m = s.match(/embed\/([\w-]{11})/))) return m[1];
  return null;
}

function ytApiKey_() {
  const key = getProp_(PROP_KEYS.YOUTUBE_API_KEY, '');
  if (!key) throw new Error('YouTube API key is not set. Add it in Koli > Settings.');
  return key;
}

function ytFetch_(url) {
  let attempt = 0, lastError;
  while (attempt < DEFAULTS.YOUTUBE_MAX_RETRIES) {
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = resp.getResponseCode();
      const body = resp.getContentText();
      if (code === 200) return JSON.parse(body);
      if (code === 403 || code >= 500) {
        lastError = new Error('YouTube API ' + code + ': ' + body.slice(0, 300));
        Utilities.sleep(Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 250));
        attempt++;
        continue;
      }
      const parsed = JSON.parse(body || '{}');
      const reason = parsed.error && parsed.error.errors && parsed.error.errors[0] ? parsed.error.errors[0].reason : 'unknown';
      const err = new Error('YouTube API ' + code + ' (' + reason + ')');
      err.notRetryable = true; err.httpCode = code;
      throw err;
    } catch (e) {
      if (e.notRetryable) throw e;
      lastError = e; attempt++;
      Utilities.sleep(Math.pow(2, attempt) * 500);
    }
  }
  throw lastError || new Error('YouTube API request failed after retries');
}

/** Fires several GET requests in parallel and parses each JSON response, tolerant of individual failures. */
function ytFetchAll_(urls) {
  if (!urls.length) return [];
  const requests = urls.map(function (u) { return { url: u, muteHttpExceptions: true }; });
  const responses = UrlFetchApp.fetchAll(requests);
  return responses.map(function (resp) {
    try {
      if (resp.getResponseCode() === 200) return JSON.parse(resp.getContentText());
      return null;
    } catch (e) { return null; }
  });
}

function chunk_(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function resolveChannelId(rawInput) {
  const parsed = parseChannelInput_(rawInput);
  if (!parsed) throw new Error('Empty channel input');
  const cacheK = cacheKey_('resolve', parsed.type + ':' + parsed.value);
  return withCache_(cacheK, function () {
    const key = ytApiKey_();
    let url;
    if (parsed.type === 'id') return parsed.value;
    if (parsed.type === 'video') {
      url = YT_API_BASE + '/videos?part=snippet&id=' + encodeURIComponent(parsed.value) + '&key=' + key;
      const videoData = ytFetch_(url);
      if (!videoData.items || !videoData.items.length) throw new Error('Video not found for "' + rawInput + '"');
      return videoData.items[0].snippet.channelId;
    }
    if (parsed.type === 'handle') {
      url = YT_API_BASE + '/channels?part=id&forHandle=' + encodeURIComponent(parsed.value.replace(/^@/, '')) + '&key=' + key;
    } else if (parsed.type === 'user') {
      url = YT_API_BASE + '/channels?part=id&forUsername=' + encodeURIComponent(parsed.value) + '&key=' + key;
    } else {
      url = YT_API_BASE + '/search?part=snippet&type=channel&maxResults=1&q=' + encodeURIComponent(parsed.value) + '&key=' + key;
    }
    const data = ytFetch_(url);
    if (!data.items || !data.items.length) throw new Error('Channel not found for "' + rawInput + '"');
    if (parsed.type === 'handle' || parsed.type === 'user') return data.items[0].id;
    return data.items[0].id.channelId || data.items[0].id;
  }, 86400);
}

/**
 * Resolves + batch-fetches (channels.list, up to 50 IDs per call, run in
 * parallel via fetchAll) every input in one go, warming the cache that
 * getChannelData() reads from. Handle/legacy/search inputs still resolve
 * one at a time first (no batch endpoint for that): only the actual
 * channels.list + playlistItems.list calls get batched/parallelized.
 * Returns { resolved: {input: channelId}, errors: {input: message} }.
 */
function prefetchChannels(rawInputs) {
  const resolved = {}, errors = {};
  rawInputs.forEach(function (input) {
    try { resolved[input] = resolveChannelId(input); }
    catch (e) { errors[input] = e.message; }
  });

  const ids = Object.keys(resolved).map(function (k) { return resolved[k]; });
  const uniqueIds = Array.from(new Set(ids));
  const key = ytApiKey_();

  const chunks = chunk_(uniqueIds, DEFAULTS.MAX_BATCH_ITEMS);
  const listUrls = chunks.map(function (c) {
    return YT_API_BASE + '/channels?part=snippet,statistics,contentDetails&id=' + c.join(',') + '&key=' + key;
  });
  const listResults = ytFetchAll_(listUrls);

  const uploadsPlaylistByChannel = {};
  const baseByChannel = {};
  listResults.forEach(function (data) {
    if (!data || !data.items) return;
    data.items.forEach(function (item) {
      baseByChannel[item.id] = item;
      uploadsPlaylistByChannel[item.id] = item.contentDetails.relatedPlaylists.uploads;
    });
  });

  const idsWithUploads = uniqueIds.filter(function (id) { return uploadsPlaylistByChannel[id]; });
  const playlistUrls = idsWithUploads.map(function (id) {
    return YT_API_BASE + '/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' +
      uploadsPlaylistByChannel[id] + '&key=' + key;
  });
  const playlistResults = ytFetchAll_(playlistUrls);
  const uploadsByChannel = {};
  idsWithUploads.forEach(function (id, i) {
    const data = playlistResults[i];
    uploadsByChannel[id] = (data && data.items) ? data.items.map(function (it) {
      return {
        videoId: it.contentDetails.videoId, title: it.snippet.title,
        description: it.snippet.description || '',
        publishedAt: it.contentDetails.videoPublishedAt || it.snippet.publishedAt
      };
    }) : [];
  });

  uniqueIds.forEach(function (id) {
    const item = baseByChannel[id];
    if (!item) { errors[id] = 'Channel unavailable (private, terminated, or deleted)'; return; }
    const channelData = {
      channelId: id, name: item.snippet.title, description: item.snippet.description || '',
      subCount: item.statistics.hiddenSubscriberCount ? null : Number(item.statistics.subscriberCount || 0),
      videoCount: Number(item.statistics.videoCount || 0), recentVideos: uploadsByChannel[id] || [],
      country: item.snippet.country || '' // self-declared by the channel owner, often unset: free from the same part=snippet call, no extra API cost
    };
    cachePut_(cacheKey_('channel', id), channelData, DEFAULTS.CACHE_TTL_SECONDS);
  });

  return { resolved: resolved, errors: errors };
}

function getChannelData(channelId) {
  const cacheK = cacheKey_('channel', channelId);
  return withCache_(cacheK, function () {
    const key = ytApiKey_();
    const url = YT_API_BASE + '/channels?part=snippet,statistics,contentDetails&id=' + channelId + '&key=' + key;
    const data = ytFetch_(url);
    if (!data.items || !data.items.length) {
      const err = new Error('Channel unavailable (private, terminated, or deleted)');
      err.skip = true; throw err;
    }
    const item = data.items[0];
    const uploadsPlaylistId = item.contentDetails.relatedPlaylists.uploads;
    const recentVideos = getRecentUploads_(uploadsPlaylistId, key);
    return {
      channelId: channelId, name: item.snippet.title, description: item.snippet.description || '',
      subCount: item.statistics.hiddenSubscriberCount ? null : Number(item.statistics.subscriberCount || 0),
      videoCount: Number(item.statistics.videoCount || 0), recentVideos: recentVideos,
      country: item.snippet.country || '' // self-declared by the channel owner, often unset: free from the same part=snippet call, no extra API cost
    };
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

function getRecentUploads_(uploadsPlaylistId, key) {
  const url = YT_API_BASE + '/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + uploadsPlaylistId + '&key=' + key;
  const data = ytFetch_(url);
  if (!data.items) return [];
  return data.items.map(function (it) {
    return {
      videoId: it.contentDetails.videoId, title: it.snippet.title,
      description: it.snippet.description || '',
      publishedAt: it.contentDetails.videoPublishedAt || it.snippet.publishedAt
    };
  });
}

function computeAvgPostsPerMonth_(recentVideos, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const inWindow = recentVideos.filter(function (v) { return new Date(v.publishedAt) >= cutoff; });
  const months = days / 30;
  return months > 0 ? Math.round((inWindow.length / months) * 10) / 10 : 0;
}

/**
 * Same idea as prefetchChannels: resolve video IDs, then videos.list in
 * batches of 50 (parallel), then per-video commentThreads.list in parallel
 * (no batch endpoint for comments). Warms getVideoData()'s cache.
 */
function prefetchVideos(rawInputs, commentSampleSize) {
  const idByInput = {}, errors = {};
  rawInputs.forEach(function (input) {
    const id = parseVideoInput_(input);
    if (!id) { errors[input] = 'Could not parse a video ID from "' + input + '"'; return; }
    idByInput[input] = id;
  });

  const uniqueIds = Array.from(new Set(Object.keys(idByInput).map(function (k) { return idByInput[k]; })));
  const key = ytApiKey_();

  const chunks = chunk_(uniqueIds, DEFAULTS.MAX_BATCH_ITEMS);
  const listUrls = chunks.map(function (c) {
    return YT_API_BASE + '/videos?part=snippet,statistics&id=' + c.join(',') + '&key=' + key;
  });
  const listResults = ytFetchAll_(listUrls);
  const baseByVideo = {};
  listResults.forEach(function (data) {
    if (!data || !data.items) return;
    data.items.forEach(function (item) { baseByVideo[item.id] = item; });
  });

  const idsWithBase = uniqueIds.filter(function (id) { return baseByVideo[id]; });
  const commentUrls = idsWithBase.map(function (id) {
    return YT_API_BASE + '/commentThreads?part=snippet&videoId=' + id +
      '&maxResults=' + Math.min(commentSampleSize || DEFAULTS.COMMENT_SAMPLE_SIZE, 100) + '&order=relevance&key=' + key;
  });
  const commentResults = ytFetchAll_(commentUrls);
  const commentsByVideo = {};
  idsWithBase.forEach(function (id, i) {
    const data = commentResults[i];
    commentsByVideo[id] = (data && data.items) ? data.items.map(function (it) {
      const top = it.snippet.topLevelComment.snippet;
      return { text: top.textDisplay, author: top.authorDisplayName };
    }) : []; // empty = comments disabled or fetch failed, not fatal
  });

  uniqueIds.forEach(function (id) {
    const item = baseByVideo[id];
    if (!item) { errors[id] = 'Video unavailable (private or deleted)'; return; }
    const videoData = {
      videoId: id, title: item.snippet.title, description: item.snippet.description || '',
      channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt, views: Number(item.statistics.viewCount || 0),
      likes: Number(item.statistics.likeCount || 0), commentCount: Number(item.statistics.commentCount || 0),
      comments: commentsByVideo[id] || []
    };
    cachePut_(cacheKey_('video', id + ':' + (commentSampleSize || DEFAULTS.COMMENT_SAMPLE_SIZE)), videoData, DEFAULTS.CACHE_TTL_SECONDS);
  });

  return { resolved: idByInput, errors: errors };
}

function getVideoData(videoId, commentSampleSize) {
  const cacheK = cacheKey_('video', videoId + ':' + commentSampleSize);
  return withCache_(cacheK, function () {
    const key = ytApiKey_();
    const url = YT_API_BASE + '/videos?part=snippet,statistics&id=' + videoId + '&key=' + key;
    const data = ytFetch_(url);
    if (!data.items || !data.items.length) {
      const err = new Error('Video unavailable (private or deleted)');
      err.skip = true; throw err;
    }
    const item = data.items[0];
    const comments = getCommentSample_(videoId, key, commentSampleSize);
    return {
      videoId: videoId, title: item.snippet.title, description: item.snippet.description || '',
      channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt, views: Number(item.statistics.viewCount || 0),
      likes: Number(item.statistics.likeCount || 0), commentCount: Number(item.statistics.commentCount || 0),
      comments: comments
    };
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

function getCommentSample_(videoId, key, sampleSize) {
  try {
    const url = YT_API_BASE + '/commentThreads?part=snippet&videoId=' + videoId +
      '&maxResults=' + Math.min(sampleSize || DEFAULTS.COMMENT_SAMPLE_SIZE, 100) + '&order=relevance&key=' + key;
    const data = ytFetch_(url);
    if (!data.items) return [];
    return data.items.map(function (it) {
      const top = it.snippet.topLevelComment.snippet;
      return { text: top.textDisplay, author: top.authorDisplayName };
    });
  } catch (e) { return []; }
}

/**
 * For channel-level authenticity scoring: tries the 2 most recent
 * videos in turn (some have comments disabled) and returns the first
 * non-empty sample. Fed into enrichChannel_'s single call as extra
 * context rather than triggering a separate Gemini call.
 */
function getChannelCommentSample_(recentVideos) {
  const key = ytApiKey_();
  for (let i = 0; i < Math.min(2, recentVideos.length); i++) {
    const sample = getCommentSample_(recentVideos[i].videoId, key, 20);
    if (sample.length) return sample;
  }
  return [];
}

/**
 * Videos published by `channelId` between startDate and endDate (inclusive),
 * newest first: used by Feature "Profile". Pages through the uploads
 * playlist since search.list-by-date costs far more quota per result.
 */
function getVideosInDateRange(channelId, startDate, endDate) {
  const key = ytApiKey_();
  const channelResp = ytFetch_(YT_API_BASE + '/channels?part=contentDetails&id=' + channelId + '&key=' + key);
  if (!channelResp.items || !channelResp.items.length) throw new Error('Channel not found');
  const uploadsPlaylistId = channelResp.items[0].contentDetails.relatedPlaylists.uploads;

  const start = new Date(startDate), end = new Date(endDate);
  const results = [];
  let pageToken = '';
  let keepPaging = true;

  while (keepPaging) {
    const url = YT_API_BASE + '/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' +
      uploadsPlaylistId + (pageToken ? '&pageToken=' + pageToken : '') + '&key=' + key;
    const data = ytFetch_(url);
    if (!data.items || !data.items.length) break;

    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      const published = new Date(it.contentDetails.videoPublishedAt || it.snippet.publishedAt);
      if (published > end) continue; // newer than range, keep paging (list is newest-first)
      if (published < start) { keepPaging = false; break; } // reached older than range, stop
      results.push({
        videoId: it.contentDetails.videoId, title: it.snippet.title,
        description: it.snippet.description || '', publishedAt: published.toISOString()
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return results;
}

/** Discover feature: search.list by keyword, type channel or video. */
function searchByKeywords_(keywords, type, maxResults) {
  const key = ytApiKey_();
  const q = keywords.join(' ');
  const url = YT_API_BASE + '/search?part=snippet&type=' + type + '&maxResults=' +
    Math.min(maxResults, 50) + '&q=' + encodeURIComponent(q) + '&key=' + key;
  const data = ytFetch_(url);
  if (!data.items) return [];
  return data.items.map(function (it) {
    return type === 'channel' ? it.id.channelId : it.id.videoId;
  }).filter(Boolean);
}
