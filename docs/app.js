// Application state
let followedChannelIds = [];
let apiKey = '';
let isLoading = false;
let watchedVideos = new Set();

// Storage constants (persistent)
const STORAGE_KEYS = {
    API_KEY: 'youtube_api_key',        // Never expires
    CHANNEL_IDS: 'channel_ids',        // Never expires
    WATCHED_VIDEOS: 'watched_videos'    // Never expires
};

// Cache constants (temporary)
const CACHE_KEYS = {
    FEED: 'feed_cache',                // Expires after 1 hour
    TIMESTAMP: 'feed_cache_timestamp'  // Expires after 1 hour
};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    loadStoredData();
    setupEventListeners();
    checkAndSetView();
});

// Event Listeners
function setupEventListeners() {
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchChannels();
    });

    document.querySelectorAll('[data-view]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(e.target.dataset.view);
        });
    });

    document.getElementById('refreshFeed')?.addEventListener('click', () => {
        clearFeedCache();
        fetchLatestVideos(true);
    });
}

// View Management
function checkAndSetView() {
    const view = new URLSearchParams(window.location.search).get('view') || 'dashboard';
    switchView(view);
}

function switchView(view) {
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
    });

    const selectedSection = document.getElementById(view);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }

    const url = new URL(window.location);
    url.searchParams.set('view', view);
    window.history.pushState({}, '', url);

    if (view === 'dashboard') {
        fetchLatestVideos();
    } else if (view === 'settings') {
        displayFollowedChannels();
    }
}

// Cache Management
function getFeedCache() {
    try {
        const cache = localStorage.getItem(CACHE_KEYS.FEED);
        const timestamp = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
        
        if (!cache || !timestamp) return null;

        const now = Date.now();
        if (now - parseInt(timestamp) > CACHE_DURATION) {
            clearFeedCache();
            return null;
        }

        return JSON.parse(cache);
    } catch (error) {
        console.error('Error reading cache:', error);
        return null;
    }
}

function setFeedCache(videos) {
    try {
        localStorage.setItem(CACHE_KEYS.FEED, JSON.stringify(videos));
        localStorage.setItem(CACHE_KEYS.TIMESTAMP, Date.now().toString());
    } catch (error) {
        console.error('Error setting cache:', error);
    }
}

function clearFeedCache() {
    localStorage.removeItem(CACHE_KEYS.FEED);
    localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
}

// Storage Management
function loadStoredData() {
    // Load persistent data
    apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    if (apiKey) {
        document.getElementById('apiKey').value = apiKey;
    }

    const savedChannels = localStorage.getItem(STORAGE_KEYS.CHANNEL_IDS);
    if (savedChannels) {
        followedChannelIds = JSON.parse(savedChannels);
        displayFollowedChannels();
    }

    const savedWatched = localStorage.getItem(STORAGE_KEYS.WATCHED_VIDEOS);
    if (savedWatched) {
        watchedVideos = new Set(JSON.parse(savedWatched));
    }
}

function saveApiKey() {
    const newApiKey = document.getElementById('apiKey').value.trim();
    if (!newApiKey) {
        showError('API key cannot be empty');
        return;
    }
    
    apiKey = newApiKey;
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    showError('API key saved successfully!', 3000);
}

// UI Feedback
function showError(message, duration = 5000) {
    const container = document.querySelector('.container');
    const existingError = container.querySelector('.error');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    container.insertBefore(errorDiv, container.firstChild);

    if (duration) {
        setTimeout(() => errorDiv.remove(), duration);
    }
}

function setLoading(loading) {
    isLoading = loading;
    document.querySelectorAll('button').forEach(button => {
        button.disabled = loading;
    });
}

// Channel Management
async function searchChannels() {
    if (!apiKey) {
        showError('Please configure your API key first');
        return;
    }

    const searchQuery = document.getElementById('searchInput').value.trim();
    if (!searchQuery) {
        showError('Please enter a search term');
        return;
    }

    setLoading(true);
    try {
        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`
        );
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        displaySearchResults(data.items || []);
    } catch (error) {
        showError(`Error: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

function followChannel(channelId) {
    if (followedChannelIds.includes(channelId)) {
        showError('Already following this channel');
        return;
    }

    followedChannelIds.push(channelId);
    localStorage.setItem(STORAGE_KEYS.CHANNEL_IDS, JSON.stringify(followedChannelIds));
    clearFeedCache();
    displayFollowedChannels();
    showError('Channel added successfully!', 3000);
}

function unfollowChannel(channelId) {
    followedChannelIds = followedChannelIds.filter(id => id !== channelId);
    localStorage.setItem(STORAGE_KEYS.CHANNEL_IDS, JSON.stringify(followedChannelIds));
    clearFeedCache();
    displayFollowedChannels();
}

async function displayFollowedChannels() {
    const followedChannelsDiv = document.getElementById('followedChannels');
    
    if (followedChannelIds.length === 0) {
        followedChannelsDiv.innerHTML = '<p class="no-content">No channels followed</p>';
        return;
    }

    setLoading(true);
    try {
        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${followedChannelIds.join(',')}&key=${apiKey}`
        );
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        followedChannelsDiv.innerHTML = data.items.map(channel => `
            <div class="channel-item">
                <img src="${channel.snippet.thumbnails.default.url}" 
                     alt="${channel.snippet.title}" 
                     style="width: 50px; height: 50px; border-radius: 50%;">
                <div class="channel-info">
                    <h3>${channel.snippet.title}</h3>
                    <button onclick="unfollowChannel('${channel.id}')" 
                            style="background: #dc3545;">
                        Unfollow
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showError(`Error loading channels: ${error.message}`);
        followedChannelsDiv.innerHTML = '<p class="error">Error loading channels</p>';
    } finally {
        setLoading(false);
    }
}

// Video Management
async function fetchLatestVideos(forceRefresh = false) {
    if (!apiKey) {
        showError('Please configure your API key first');
        return;
    }

    if (followedChannelIds.length === 0) {
        showError('No channels followed');
        return;
    }

    if (!forceRefresh) {
        const cachedVideos = getFeedCache();
        if (cachedVideos) {
            displayVideos(cachedVideos);
            return;
        }
    }

    setLoading(true);
    const allVideos = [];
    const errors = [];

    try {
        for (const channelId of followedChannelIds) {
            try {
                // Fetch medium videos (4-20 minutes)
                const mediumResponse = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet` +
                    `&channelId=${channelId}` +
                    `&order=date` +
                    `&maxResults=5` +
                    `&type=video` +
                    `&videoDuration=medium` +
                    `&key=${apiKey}`
                );
                
                const mediumData = await mediumResponse.json();

                // Fetch long videos (>20 minutes)
                const longResponse = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet` +
                    `&channelId=${channelId}` +
                    `&order=date` +
                    `&maxResults=5` +
                    `&type=video` +
                    `&videoDuration=long` +
                    `&key=${apiKey}`
                );

                const longData = await longResponse.json();

                if (mediumData.error) {
                    errors.push(`Channel ${channelId} (medium): ${mediumData.error.message}`);
                }

                if (longData.error) {
                    errors.push(`Channel ${channelId} (long): ${longData.error.message}`);
                }

                if (mediumData.items) allVideos.push(...mediumData.items);
                if (longData.items) allVideos.push(...longData.items);

            } catch (error) {
                errors.push(`Channel ${channelId}: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            showError(`Errors: ${errors.join(', ')}`, 10000);
        }

        if (allVideos.length > 0) {
            allVideos.sort((a, b) => 
                new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt)
            );
            setFeedCache(allVideos);
            displayVideos(allVideos);
        } else {
            showError('No videos found');
        }
    } catch (error) {
        showError(`Error: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

function markVideoAsWatched(videoId) {
    watchedVideos.add(videoId);
    localStorage.setItem(STORAGE_KEYS.WATCHED_VIDEOS, JSON.stringify([...watchedVideos]));
    const videoElement = document.querySelector(`[data-video-id="${videoId}"]`);
    if (videoElement) {
        videoElement.classList.add('watched');
    }
}

// Display Functions
function displaySearchResults(channels) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = channels.map(channel => {
        const isFollowed = followedChannelIds.includes(channel.id.channelId);
        return `
            <div class="channel-item">
                <img src="${channel.snippet.thumbnails.default.url}" 
                     alt="${channel.snippet.title}" 
                     style="width: 50px; height: 50px; border-radius: 50%;">
                <div class="channel-info">
                    <h3>${channel.snippet.title}</h3>
                    <button onclick="followChannel('${channel.id.channelId}')" 
                            ${isFollowed ? 'disabled' : ''}>
                        ${isFollowed ? 'Already following' : 'Follow'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function displayVideos(videos) {
    const videoResults = document.getElementById('videoResults');
    videoResults.innerHTML = videos.map(video => {
        const isWatched = watchedVideos.has(video.id.videoId);
        return `
            <div class="video-item ${isWatched ? 'watched' : ''}" 
                 data-video-id="${video.id.videoId}"
                 onclick="handleVideoClick('${video.id.videoId}')" 
                 style="cursor: pointer;">
                <img src="${video.snippet.thumbnails.medium.url}" 
                     alt="${video.snippet.title}">
                <h3>${video.snippet.title}</h3>
                <p>by ${video.snippet.channelTitle}</p>
                <p>${new Date(video.snippet.publishedAt).toLocaleDateString()}</p>
                ${isWatched ? '<span class="watched-badge">Watched</span>' : ''}
            </div>
        `;
    }).join('');

    const cacheTimestamp = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
    if (cacheTimestamp) {
        const date = new Date(parseInt(cacheTimestamp));
        document.getElementById('lastUpdate').textContent = `Last updated: ${date.toLocaleString()}`;
    }
}

function handleVideoClick(videoId) {
    markVideoAsWatched(videoId);
    window.open(`https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`, '_blank');
}
