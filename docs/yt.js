// List of CORS proxies to cycle through
const CORS_PROXIES = [
    'https://corsproxy.io/?url='
];

class YouTubeFetcher {
    constructor() {
        this.currentProxyIndex = 0;
    }

    // Get next proxy from the list
    getNextProxy() {
        // Since there's only one proxy, always return it
        return CORS_PROXIES[0];
    }

    // Check if a video is likely a short based on title characteristics
    isLikelyShort(title) {
        // Convert title to a string that we can safely work with
        const safeTitle = String(title);
        
        // More precise emoji detection that excludes punctuation
        const containsEmoji = /[\u{1F000}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F64F}]/u.test(safeTitle);
        
        // Check for hashtags - must start with # followed by word characters
        const hasHashtag = /#\w+/.test(safeTitle);
        
        return containsEmoji || hasHashtag;
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
        // Force desktop version with explicit parameters
        const searchUrl = `https://www.youtube.com/results?search_query=${encodedQuery}&sp=EgIQAg%253D%253D&app=desktop&persist_app=1`;
        
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
                        
                        // Limit to first 10 channels
                        if (results.length >= 10) break;
                    }
                }
            } catch (e) {
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
            
            console.log('📊 Total entries before filtering:', xmlDoc.getElementsByTagName('entry').length);
            
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
                const filteredVideos = videos.filter(video => !video.isShort);
                console.log('📊 Videos after filtering:', {
                    total: videos.length,
                    filtered: videos.length - filteredVideos.length,
                    remaining: filteredVideos.length
                });
                videos = filteredVideos;
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
