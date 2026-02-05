/**
 * Cloudflare Worker - YouTube Feed & Search API
 * Endpoints:
 *   ?channelId=XXX  → Returns RSS feed for channel
 *   ?search=XXX     → Searches for YouTube channels (returns JSON)
 * 
 * Features: CORS restriction, rate limiting, caching
 */

// Rate limit: max requests per IP per minute
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW = 60; // seconds

// Cache TTL in seconds
const CACHE_TTL_FEED = 900;    // 15 min for RSS feeds
const CACHE_TTL_SEARCH = 300;  // 5 min for search results

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    const origin = request.headers.get('Origin');
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, allowedOrigins);
    }

    // Check origin - no CORS headers on rejection
    const isAllowed = !origin || allowedOrigins.includes(origin);
    if (!isAllowed) {
      return new Response('Forbidden', { status: 403 });
    }

    // Rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitResult = await checkRateLimit(env, clientIP);
    if (!rateLimitResult.allowed) {
      return new Response('Too many requests', { status: 429 });
    }

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const search = url.searchParams.get('search');
    const corsHeaders = getCORSHeaders(origin || allowedOrigins[0]);

    // Route: Get channel RSS feed
    if (channelId) {
      return handleChannelFeed(channelId, corsHeaders, ctx);
    }

    // Route: Search channels
    if (search) {
      return handleChannelSearch(search, corsHeaders, ctx);
    }

    return new Response('Bad request', { status: 400 });
  }
};

async function checkRateLimit(env, clientIP) {
  // Use Cloudflare KV if available, otherwise allow (stateless fallback)
  if (!env.RATE_LIMIT_KV) {
    return { allowed: true };
  }

  const key = `ratelimit:${clientIP}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    const data = await env.RATE_LIMIT_KV.get(key, 'json') || { requests: [] };
    
    // Filter requests within window
    data.requests = data.requests.filter(t => t > windowStart);
    
    if (data.requests.length >= RATE_LIMIT) {
      return { allowed: false };
    }

    data.requests.push(now);
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(data), { expirationTtl: RATE_LIMIT_WINDOW * 2 });
    
    return { allowed: true };
  } catch (e) {
    // On error, allow request (fail open)
    return { allowed: true };
  }
}

async function handleChannelFeed(channelId, corsHeaders, ctx) {
  // Validate channel ID format
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return new Response('Invalid channelId', { status: 400 });
  }

  const cacheKey = `feed:${channelId}`;
  const cache = caches.default;

  // Check cache
  const cacheUrl = new URL(`https://cache.internal/${cacheKey}`);
  const cachedResponse = await cache.match(cacheUrl);
  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    // Add CORS headers to cached response
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  try {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/xml, text/xml, */*',
      }
    });

    if (!response.ok) {
      return new Response('Channel not found', { status: 404 });
    }

    const xml = await response.text();
    
    // Validate XML response
    if (!xml.includes('<feed') || !xml.includes('</feed>')) {
      return new Response('Invalid response from YouTube', { status: 502 });
    }

    const result = new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Cache-Control': `public, max-age=${CACHE_TTL_FEED}`,
      }
    });

    // Store in cache
    ctx.waitUntil(cache.put(cacheUrl, result.clone()));

    return result;
  } catch (error) {
    return new Response('Service unavailable', { status: 503 });
  }
}

async function handleChannelSearch(query, corsHeaders, ctx) {
  if (!query || query.length < 2 || query.length > 100) {
    return new Response('Invalid query', { status: 400 });
  }

  // Sanitize query
  const sanitizedQuery = query.replace(/[<>]/g, '');

  const cacheKey = `search:${sanitizedQuery.toLowerCase()}`;
  const cache = caches.default;

  // Check cache
  const cacheUrl = new URL(`https://cache.internal/${encodeURIComponent(cacheKey)}`);
  const cachedResponse = await cache.match(cacheUrl);
  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(sanitizedQuery)}&sp=EgIQAg%253D%253D&app=desktop&persist_app=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      return new Response('Search failed', { status: 502 });
    }

    const html = await response.text();
    
    // Parse and extract channel data server-side
    const channels = parseChannelResults(html);
    
    if (channels === null) {
      return new Response('Failed to parse YouTube response', { status: 502 });
    }

    const jsonResult = JSON.stringify(channels);

    const result = new Response(jsonResult, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SEARCH}`,
      }
    });

    // Store in cache
    ctx.waitUntil(cache.put(cacheUrl, result.clone()));

    return result;
  } catch (error) {
    return new Response('Service unavailable', { status: 503 });
  }
}

function parseChannelResults(html) {
  try {
    const dataMatch = html.match(/var ytInitialData = ({.*?});/);
    if (!dataMatch) return null;

    const data = JSON.parse(dataMatch[1]);
    const results = [];

    const items = data.contents?.twoColumnSearchResultsRenderer
      ?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!items) return [];

    for (const item of items) {
      if (item.channelRenderer) {
        results.push({
          channelId: item.channelRenderer.channelId,
          channelName: item.channelRenderer.title?.simpleText || '',
          subscriberCount: item.channelRenderer.subscriberCountText?.simpleText || 'N/A',
          thumbnailUrl: item.channelRenderer.thumbnail?.thumbnails?.[0]?.url || null
        });
        
        if (results.length >= 10) break;
      }
    }

    return results;
  } catch (e) {
    return null;
  }
}

function getCORSHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function handleCORS(request, allowedOrigins) {
  const origin = request.headers.get('Origin');
  if (!allowedOrigins.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(origin)
  });
}
