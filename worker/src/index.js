/**
 * Cloudflare Worker - CORS Proxy for YouTube feeds
 * Configuration via wrangler.toml [vars]
 */

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    
    // Handle CORS preflight
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

    // Get the target URL from query parameter
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing "url" query parameter', {
        status: 400,
        headers: getCORSHeaders(origin || allowedOrigins[0])
      });
    }

    // Validate target URL (only allow YouTube domains)
    try {
      const target = new URL(targetUrl);
      const allowedHosts = ['youtube.com', 'www.youtube.com', 'i.ytimg.com'];
      if (!allowedHosts.some(host => target.hostname === host || target.hostname.endsWith('.' + host))) {
        return new Response('Only YouTube URLs are allowed', {
          status: 403,
          headers: getCORSHeaders(origin || allowedOrigins[0])
        });
      }
    } catch (e) {
      return new Response('Invalid URL', {
        status: 400,
        headers: getCORSHeaders(origin || allowedOrigins[0])
      });
    }

    try {
      // Fetch the target URL
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          ...getCORSHeaders(origin || allowedOrigins[0]),
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        }
      });
    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, {
        status: 500,
        headers: getCORSHeaders(origin || allowedOrigins[0])
      });
    }
  }
};

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
