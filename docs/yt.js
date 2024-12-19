// List of CORS proxies to cycle through
const CORS_PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/',
    'https://crossorigin.me/'
];

class YouTubeFetcher {
    constructor() {
        this.currentProxyIndex = 0;
    }

    // Get next proxy from the list
    getNextProxy() {
        this.currentProxyIndex = (this.currentProxyIndex + 1) % CORS_PROXIES.length;
        return CORS_PROXIES[this.currentProxyIndex];
    }

    // Check if a video is likely a short based on title characteristics
    isLikelyShort(title) {
        // Convert title to a string that we can safely work with
        const safeTitle = String(title);
        
        // More direct emoji detection using a simpler approach
        const containsEmoji = /\p{Emoji}/u.test(safeTitle);
        
        // Check for hashtags
        const hasHashtag = /#[\w]+/.test(safeTitle);
        
        // Check for common shorts indicators
        const shortsIndicators = [
            '#shorts',
            '#short',
            '#ytshorts',
            '#youtubeshorts',
            '🎥',
            '📱',
            '⚡️'
        ].some(indicator => safeTitle.toLowerCase().includes(indicator.toLowerCase()));
        
        return containsEmoji || hasHashtag || shortsIndicators;
    }

    // Extract channel ID from various YouTube URL formats
    extractChannelId(url) {
        const patterns = {
            channelId: /youtube\.com\/channel\/(UC[\w-]+)/,
            customUrl: /youtube\.com\/c\/([^\/\?]+)/,
            handle: /youtube\.com\/@([^\/\?]+)/,
            userUrl: /youtube\.com\/user\/([^\/\?]+)/
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            const match = url.match(pattern);
            if (match) {
                return { type, value: match[1] };
            }
        }

        return null;
    }

    // Perform a channel search and return multiple results
    async performChannelSearch(query) {
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://www.youtube.com/results?search_query=${encodedQuery}&sp=EgIQAg%253D%253D`;
        
        try {
            const response = await this.makeProxiedRequest(searchUrl);
            
            // Extract initial data from the page
            const dataMatch = response.match(/var ytInitialData = ({.*?});/);
            if (!dataMatch) {
                throw new Error('Could not parse search results');
            }

            // Parse the data and extract channel information
            const data = JSON.parse(dataMatch[1]);
            const results = [];

            try {
                const items = data.contents.twoColumnSearchResultsRenderer
                    .primaryContents.sectionListRenderer
                    .contents[0].itemSectionRenderer.contents;

                for (const item of items) {
                    if (item.channelRenderer) {
                        const channelInfo = {
                            channelId: item.channelRenderer.channelId,
                            channelName: item.channelRenderer.title.simpleText,
                            subscriberCount: item.channelRenderer.subscriberCountText?.simpleText || 'N/A',
                            thumbnailUrl: item.channelRenderer.thumbnail?.thumbnails[0]?.url || null
                        };
                        results.push(channelInfo);
                    }
                }
            } catch (e) {
                console.error('Error parsing channel data:', e);
            }

            return results;
        } catch (error) {
            console.error('Error performing channel search:', error);
            throw error;
        }
    }

    // Extract channel ID from HTML page
    extractChannelIdFromPage(html) {
        const matches = html.match(/"channelId":"(UC[\w-]+)"/);
        return matches ? matches[1] : null;
    }

    // Get channel info using channel ID
    async getChannelInfo(channelId) {
        try {
            const channelUrl = `https://www.youtube.com/channel/${channelId}`;
            const response = await this.makeProxiedRequest(channelUrl);
            
            // Extract channel name from meta tags
            const nameMatch = response.match(/<meta name="title" content="([^"]+)"/);
            const channelName = nameMatch ? nameMatch[1].replace(' - YouTube', '') : 'Unknown Channel';

            return {
                channelId,
                channelName
            };
        } catch (error) {
            console.error('Error getting channel info:', error);
            throw error;
        }
    }

    // Get channel feed using RSS
    async getChannelFeed(channelId, filterShorts = true) {
        try {
            const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const response = await this.makeProxiedRequest(feedUrl);
            
            // Parse XML response
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, 'text/xml');
            
            // Extract video information
            const entries = xmlDoc.getElementsByTagName('entry');
            let videos = Array.from(entries).map(entry => {
                const videoId = entry.getElementsByTagName('yt:videoId')[0]?.textContent;
                const title = entry.getElementsByTagName('title')[0]?.textContent;
                const publishedDate = entry.getElementsByTagName('published')[0]?.textContent;
                const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                const link = `https://www.youtube.com/watch?v=${videoId}`;
                const isShort = this.isLikelyShort(title);
                
                return {
                    videoId,
                    title,
                    publishedDate: new Date(publishedDate),
                    thumbnail,
                    link,
                    isShort
                };
            });

            // Filter out shorts if requested
            if (filterShorts) {
                videos = videos.filter(video => !video.isShort);
            }

            return videos;
        } catch (error) {
            console.error('Error fetching channel feed:', error);
            throw error;
        }
    }

    // Make request using CORS proxy with retry logic
    async makeProxiedRequest(url, retryCount = 0) {
        try {
            const proxy = CORS_PROXIES[this.currentProxyIndex];
            const response = await fetch(proxy + encodeURIComponent(url));
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.text();
        } catch (error) {
            if (retryCount < CORS_PROXIES.length - 1) {
                // Try next proxy
                this.getNextProxy();
                return this.makeProxiedRequest(url, retryCount + 1);
            }
            throw error;
        }
    }

    // Validate channel ID format
    validateChannelId(channelId) {
        return /^UC[\w-]{22}$/.test(channelId);
    }
}

export default YouTubeFetcher;
