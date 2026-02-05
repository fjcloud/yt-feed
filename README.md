# YT Feed

**Your Algorithm-Free YouTube Feed**

A simple dashboard to follow your favorite YouTube channels without algorithmic recommendations. Just the latest videos from channels you choose, in chronological order.

## Features

- Add YouTube channels by search or URL
- View the latest videos in a clean, distraction-free interface
- No recommendations, no algorithm - just the content you want
- Chronological feed of videos from your selected channels
- Works in any modern browser

## Usage

1. Go to Settings to add your favorite channels
2. Return to Dashboard to see their latest videos
3. Click Refresh to update your feed

Hosted at: [yt.msl.cloud](https://yt.msl.cloud)

## Architecture

The app uses a Cloudflare Worker as a CORS proxy to fetch YouTube RSS feeds and search results.

```
┌─────────────┐     ┌────────────────────┐     ┌─────────────┐
│   Browser   │────▶│ Cloudflare Worker  │────▶│   YouTube   │
│ (yt.msl.cloud)    │  (CORS Proxy)      │     │   (RSS/API) │
└─────────────┘     └────────────────────┘     └─────────────┘
```

## Self-Hosting

### Prerequisites

- Node.js 18+
- A Cloudflare account (free tier works)

### Deploy the CORS Proxy Worker

1. Navigate to the worker directory:
   ```bash
   cd worker
   npm install
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Deploy the worker:
   ```bash
   npm run deploy
   ```

4. Note the worker URL (e.g., `https://yt-feed-proxy.YOUR_SUBDOMAIN.workers.dev`)

5. Update `docs/yt.js` with your worker URL:
   ```javascript
   const WORKER_URL = 'https://yt-feed-proxy.YOUR_SUBDOMAIN.workers.dev';
   ```

6. Update `worker/wrangler.toml` to allow your domain:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://your-domain.com"
   ```

### Host the Frontend

The `docs/` folder contains the static frontend. You can host it on:
- GitHub Pages
- Cloudflare Pages
- Any static hosting service

## Development

### Worker Development

```bash
cd worker
npm run dev    # Start local dev server
npm run deploy # Deploy to Cloudflare
```

### Frontend Development

Simply serve the `docs/` folder with any static file server:
```bash
npx serve docs
```

---

Take back control of your viewing experience!
