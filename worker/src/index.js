/**
 * Cloudflare Worker - YouTube Feed & Search API
 * Endpoints:
 *   ?channelId=XXX  → Returns RSS feed for channel
 *   ?search=XXX     → Searches for YouTube channels
 * Configuration via wrangler.toml [vars]
 */

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    
    if (request.method === 'OPTIONS') {
      return handleCORS(request, allowedOrigins);
    }

    const origin = request.headers.get('Origin');
    const isAllowed = !origin || allowedOrigins.includes(origin);
    
    if (!isAllowed) {
      return new Response('Forbidden: Origin not allowed', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    const search = url.searchParams.get('search');

    const corsHeaders = getCORSHeaders(origin || allowedOrigins[0]);

    // Route: Get channel RSS feed
    if (channelId) {
      return handleChannelFeed(channelId, corsHeaders);
    }

    // Route: Search channels
    if (search) {
      return handleChannelSearch(search, corsHeaders);
    }

    return new Response('Missing parameter: channelId or search', {
      status: 400,
      headers: corsHeaders
    });
  }
};

async function handleChannelFeed(channelId, corsHeaders) {
  // Validate channel ID format (YouTube channel IDs start with UC and are 24 chars)
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return new Response('Invalid channelId format', {
      status: 400,
      headers: corsHeaders
    });
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
      return new Response(`YouTube returned ${response.status}`, {
        status: response.status,
        headers: corsHeaders
      });
    }

    return new Response(await response.text(), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, {
      status: 500,
      headers: corsHeaders
    });
  }
}

async function handleChannelSearch(query, corsHeaders) {
  if (!query || query.length < 2 || query.length > 100) {
    return new Response('Invalid search query', {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D&app=desktop&persist_app=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      return new Response(`YouTube returned ${response.status}`, {
        status: response.status,
        headers: corsHeaders
      });
    }

    return new Response(await response.text(), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, {
      status: 500,
      headers: corsHeaders
    });
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
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(allowedOrigin)
  });
}
