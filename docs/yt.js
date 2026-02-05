// Cloudflare Worker API URL
const WORKER_URL = 'https://yt-feed-proxy.fj-9d1.workers.dev';

class YouTubeFetcher {
    // Check if a video is likely a short (has emojis or hashtags)
    isLikelyShort(title) {
        return /[\u{1F000}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F64F}]/u.test(title) || /#\w+/.test(title);
    }

    // Perform a channel search - returns JSON from worker
    async performChannelSearch(query) {
        const response = await fetch(`${WORKER_URL}?search=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        return await response.json();
    }

    // Get channel feed using RSS via worker
    async getChannelFeed(channelId, filterShorts = true) {
        const response = await fetch(`${WORKER_URL}?channelId=${channelId}`);
        if (!response.ok) throw new Error(`Feed failed: ${response.status}`);
        
        const xml = await response.text();
        const xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
        const entries = xmlDoc.getElementsByTagName('entry');
        
        let videos = Array.from(entries).map(entry => ({
            videoId: entry.getElementsByTagName('yt:videoId')[0]?.textContent,
            title: entry.getElementsByTagName('title')[0]?.textContent,
            publishedDate: new Date(entry.getElementsByTagName('published')[0]?.textContent),
            thumbnail: `https://i.ytimg.com/vi/${entry.getElementsByTagName('yt:videoId')[0]?.textContent}/maxresdefault.jpg`,
            link: `https://www.youtube.com/watch?v=${entry.getElementsByTagName('yt:videoId')[0]?.textContent}`,
            isShort: this.isLikelyShort(entry.getElementsByTagName('title')[0]?.textContent)
        }));

        return filterShorts ? videos.filter(v => !v.isShort) : videos;
    }
}

export default YouTubeFetcher;
