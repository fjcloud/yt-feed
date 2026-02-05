/**
 * Cloudflare Worker - CORS Proxy for YouTube feeds
 * Only allows requests from yt.msl.cloud
 */

const ALLOWED_ORIGINS = [
  'https://yt.msl.cloud',
  'http://localhost:8080', // For local development
  'http://127.0.0.1:8080'
];

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    const origin = request.headers.get('Origin');
    
    // Check if origin is allowed
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://yt.msl.cloud';
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin === allowedOrigin;
    
    if (!isAllowed && origin) {
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
        headers: getCORSHeaders(origin || allowedOrigin)
      });
    }

    // Validate target URL (only allow YouTube domains)
    try {
      const target = new URL(targetUrl);
      const allowedHosts = ['youtube.com', 'www.youtube.com', 'i.ytimg.com'];
      if (!allowedHosts.some(host => target.hostname === host || target.hostname.endsWith('.' + host))) {
        return new Response('Only YouTube URLs are allowed', {
          status: 403,
          headers: getCORSHeaders(origin || allowedOrigin)
        });
      }
    } catch (e) {
      return new Response('Invalid URL', {
        status: 400,
        headers: getCORSHeaders(origin || allowedOrigin)
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

      // Get the response body
      const body = await response.text();

      // Return with CORS headers
      return new Response(body, {
        status: response.status,
        headers: {
          ...getCORSHeaders(origin || allowedOrigin),
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        }
      });
    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, {
        status: 500,
        headers: getCORSHeaders(origin || allowedOrigin)
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

function handleCORS(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://yt.msl.cloud';
  
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(allowedOrigin)
  });
}
