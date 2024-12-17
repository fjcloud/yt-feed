// Application state
let followedChannelIds = [];
let channelsData = {};
let apiKey = '';
let isLoading = false;
let watchedVideos = new Set();

// Constants
const DAYS_TO_STORE = 365;
const COOKIE_NAMES = {
    API_KEY: 'youtube_api_key',
    CHANNEL_IDS: 'channel_ids',
    WATCHED_VIDEOS: 'watched_videos'
};

// Page sections
const VIEWS = {
    DASHBOARD: 'dashboard',
    SETTINGS: 'settings'
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    loadStoredData();
    setupEventListeners();
    checkAndSetView();
});

// Setup event listeners
function setupEventListeners() {
    // Search on Enter key
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchChannels();
    });

    // Navigation
    document.querySelectorAll('[data-view]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(e.target.dataset.view);
        });
    });
}

// View management
function checkAndSetView() {
    const view = new URLSearchParams(window.location.search).get('view') || VIEWS.DASHBOARD;
    switchView(view);
}

function switchView(view) {
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show selected section
    const selectedSection = document.getElementById(view);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('view', view);
    window.history.pushState({}, '', url);

    // If dashboard is shown, fetch videos
    if (view === VIEWS.DASHBOARD) {
        fetchLatestVideos();
    }
}

// Storage functions
function loadStoredData() {
    // Load API key
    apiKey = getCookie(COOKIE_NAMES.API_KEY) || '';
    if (apiKey) {
        document.getElementById('apiKey').value = apiKey;
    }

    // Load channel IDs
    const savedChannels = getCookie(COOKIE_NAMES.CHANNEL_IDS);
    if (savedChannels) {
        followedChannelIds = savedChannels.split(',');
        refreshChannelsData();
    }

    // Load watched videos
    const savedWatched = getCookie(COOKIE_NAMES.WATCHED_VIDEOS);
    if (savedWatched) {
        watchedVideos = new Set(savedWatched.split(','));
    }
}

function saveApiKey() {
    const newApiKey = document.getElementById('apiKey').value.trim();
    if (!newApiKey) {
        showError('API key cannot be empty');
        return;
    }
    
    apiKey = newApiKey;
    setCookie(COOKIE_NAMES.API_KEY, apiKey, DAYS_TO_STORE);
    showError('API key saved successfully!', 3000);
}

// Cookie management
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// UI feedback
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

// Channel management
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

// Channel management
function followChannel(channelId) {
    if (followedChannelIds.includes(channelId)) {
        showError('Already following this channel');
        return;
    }

    followedChannelIds.push(channelId);
    setCookie(COOKIE_NAMES.CHANNEL_IDS, followedChannelIds.join(','), DAYS_TO_STORE);
    refreshChannelsData();
}

function unfollowChannel(channelId) {
    followedChannelIds = followedChannelIds.filter(id => id !== channelId);
    setCookie(COOKIE_NAMES.CHANNEL_IDS, followedChannelIds.join(','), DAYS_TO_STORE);
    refreshChannelsData();
}

// Channel data management
async function refreshChannelsData() {
    if (!apiKey || followedChannelIds.length === 0) {
        displayFollowedChannels([]);
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

        channelsData = {};
        data.items.forEach(channel => {
            channelsData[channel.id] = channel;
        });

        displayFollowedChannels(data.items);
    } catch (error) {
        showError(`Error: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

function displayFollowedChannels(channels) {
    const followedChannelsDiv = document.getElementById('followedChannels');
    if (channels.length === 0) {
        followedChannelsDiv.innerHTML = '<p class="no-content">No channels followed</p>';
        return;
    }

    followedChannelsDiv.innerHTML = channels.map(channel => `
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
}

// Video management
async function fetchLatestVideos() {
    if (!apiKey) {
        showError('Please configure your API key first');
        return;
    }

    if (followedChannelIds.length === 0) {
        showError('No channels followed');
        return;
    }

    setLoading(true);
    const allVideos = [];
    const errors = [];

    try {
        for (const channelId of followedChannelIds) {
            try {
                const response = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=5&type=video&key=${apiKey}`
                );
                const data = await response.json();

                if (data.error) {
                    errors.push(`Channel ${channelId}: ${data.error.message}`);
                    continue;
                }

                if (data.items) {
                    allVideos.push(...data.items);
                }
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
    setCookie(COOKIE_NAMES.WATCHED_VIDEOS, Array.from(watchedVideos).join(','), DAYS_TO_STORE);
}

function displayVideos(videos) {
    const videoResults = document.getElementById('videoResults');
    videoResults.innerHTML = videos.map(video => {
        const isWatched = watchedVideos.has(video.id.videoId);
        return `
            <div class="video-item ${isWatched ? 'watched' : ''}" 
                 onclick="handleVideoClick('${video.id.videoId}')" 
                 style="cursor: pointer; opacity: ${isWatched ? '0.7' : '1'}">
                <img src="${video.snippet.thumbnails.medium.url}" 
                     alt="${video.snippet.title}">
                <h3>${video.snippet.title}</h3>
                <p>by ${video.snippet.channelTitle}</p>
                <p>${new Date(video.snippet.publishedAt).toLocaleDateString()}</p>
                ${isWatched ? '<span class="watched-badge">Watched</span>' : ''}
            </div>
        `;
    }).join('');
}

function handleVideoClick(videoId) {
    markVideoAsWatched(videoId);
    window.open(`https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`, '_blank');
}
