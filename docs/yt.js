// Cloudflare Worker CORS Proxy URL
const WORKER_URL = 'https://yt-feed-proxy.fj-9d1.workers.dev';

class YouTubeFetcher {
    // Check if a video is likely a short (has emojis or hashtags)
    isLikelyShort(title) {
        return /[\u{1F000}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F64F}]/u.test(title) || /#\w+/.test(title);
    }

    // Perform a channel search and return multiple results
    async performChannelSearch(query) {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D&app=desktop&persist_app=1`;
        const response = await this.makeProxiedRequest(searchUrl);
        
            const dataMatch = response.match(/var ytInitialData = ({.*?});/);
        if (!dataMatch) throw new Error('Could not parse search results');

            const data = JSON.parse(dataMatch[1]);
            const results = [];

            try {
                const items = data.contents.twoColumnSearchResultsRenderer
                .primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;

                for (const item of items) {
                    if (item.channelRenderer) {
                    results.push({
                            channelId: item.channelRenderer.channelId,
                            channelName: item.channelRenderer.title.simpleText,
                            subscriberCount: item.channelRenderer.subscriberCountText?.simpleText || 'N/A',
                            thumbnailUrl: item.channelRenderer.thumbnail?.thumbnails[0]?.url || null
                    });
                    
                    // Limit to first 10 channels
                    if (results.length >= 10) break;
                    }
                }
        } catch (e) {}

            return results;
    }

    // Get channel feed using RSS
    async getChannelFeed(channelId, filterShorts = true) {
            const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const response = await this.makeProxiedRequest(feedUrl);
            
        const xmlDoc = new DOMParser().parseFromString(response, 'text/xml');
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

    // Make request using Cloudflare Worker CORS proxy
    async makeProxiedRequest(url) {
        const proxyUrl = `${WORKER_URL}?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    }
}

export default YouTubeFetcher;
