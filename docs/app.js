import YouTubeFetcher from './yt.js';

class YouTubeApp {
    constructor() {
        this.ytFetcher = new YouTubeFetcher();
        this.channels = this.loadChannels();
        this.videos = [];
        this.currentView = 'dashboard';
        this.searchResults = [];
        this.isSearching = false;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.refreshAllFeeds();
    }

    initializeElements() {
        this.dashboardView = document.getElementById('dashboard-view');
        this.settingsView = document.getElementById('settings-view');
        this.videosList = document.getElementById('videos-list');
        this.channelInput = document.getElementById('channel-input');
        this.channelsList = document.getElementById('channels-list');
        this.searchResults = document.getElementById('search-results');
        this.dashboardButton = document.getElementById('dashboard-button');
        this.settingsButton = document.getElementById('settings-button');
    }

    initializeEventListeners() {
        this.dashboardButton.addEventListener('click', () => this.switchView('dashboard'));
        this.settingsButton.addEventListener('click', () => this.switchView('settings'));
        
        let searchTimeout;
        this.channelInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query) {
                searchTimeout = setTimeout(() => this.searchChannels(query), 500);
            } else {
                this.clearSearchResults();
            }
        });

        document.getElementById('refresh-button').addEventListener('click', () => {
            this.refreshAllFeeds();
        });
    }

    loadChannels() {
        const savedChannels = localStorage.getItem('youtube-channels');
        return savedChannels ? JSON.parse(savedChannels) : [];
    }

    saveChannels() {
        localStorage.setItem('youtube-channels', JSON.stringify(this.channels));
    }

    switchView(view) {
        this.currentView = view;
        this.dashboardView.classList.toggle('hidden', view !== 'dashboard');
        this.settingsView.classList.toggle('hidden', view !== 'settings');

        if (view === 'dashboard') {
            this.refreshAllFeeds();
        } else if (view === 'settings') {
            this.renderChannelsList();
        }
    }

    async searchChannels(query) {
        try {
            this.isSearching = true;
            this.searchResults.innerHTML = '<div class="loading">Searching...</div>';
            
            const results = await this.ytFetcher.performChannelSearch(query);
            this.renderSearchResults(results);
        } catch (error) {
            this.searchResults.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        } finally {
            this.isSearching = false;
        }
    }

    renderSearchResults(results) {
        if (results.length === 0) {
            this.searchResults.innerHTML = '<div class="text-gray-500 p-4">No channels found</div>';
            return;
        }

        this.searchResults.innerHTML = results.map((channel, index) => `
            <div class="channel-result p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <span class="text-gray-500 text-xs">YT</span>
                </div>
                <div class="flex-1">
                    <div class="font-medium">${channel.channelName}</div>
                    <div class="text-sm text-gray-500">${channel.subscriberCount}</div>
                </div>
                <button onclick="app.addChannel('${channel.channelId}', '${channel.channelName.replace(/'/g, "\\'")}')"
                        class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                    Add
                </button>
            </div>
        `).join('');
    }

    clearSearchResults() {
        this.searchResults.innerHTML = '';
    }

    addChannel(channelId, channelName) {
        if (this.channels.some(ch => ch.channelId === channelId)) {
            alert('Channel already added!');
            return;
        }

        this.channels.push({ channelId, channelName });
        this.saveChannels();
        this.renderChannelsList();
        this.channelInput.value = '';
        this.clearSearchResults();
    }

    removeChannel(channelId) {
        this.channels = this.channels.filter(ch => ch.channelId !== channelId);
        this.saveChannels();
        this.renderChannelsList();
    }

    renderChannelsList() {
        if (this.channels.length === 0) {
            this.channelsList.innerHTML = `
                <div class="text-gray-500 text-center p-8">
                    No channels added yet. Search for channels above!
                </div>
            `;
            return;
        }

        this.channelsList.innerHTML = this.channels.map(channel => `
            <div class="channel-item bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
                <div class="flex-1">
                    <h3 class="font-medium">${channel.channelName}</h3>
                    <p class="text-sm text-gray-500">ID: ${channel.channelId}</p>
                </div>
                <button onclick="app.removeChannel('${channel.channelId}')"
                        class="text-red-600 hover:text-red-800 focus:outline-none">
                    Remove
                </button>
            </div>
        `).join('');
    }

    openVideo(videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`;
        window.open(embedUrl, '_blank');
    }

    async refreshAllFeeds() {
        if (this.currentView !== 'dashboard') return;

        try {
            this.videosList.innerHTML = this.loadingTemplate();
            
            const allVideos = await Promise.all(
                this.channels.map(async channel => {
                    try {
                        const videos = await this.ytFetcher.getChannelFeed(channel.channelId);
                        return videos.map(video => ({
                            ...video,
                            channelName: channel.channelName
                        }));
                    } catch (error) {
                        console.error(`Error fetching ${channel.channelName}:`, error);
                        return [];
                    }
                })
            );

            this.videos = allVideos
                .flat()
                .sort((a, b) => b.publishedDate - a.publishedDate);

            this.renderVideosList();
        } catch (error) {
            this.videosList.innerHTML = `
                <div class="error-state">
                    <p>Error loading feeds: ${error.message}</p>
                    <button onclick="app.refreshAllFeeds()" 
                            class="retry-button">
                        Try Again
                    </button>
                </div>`;
        }
    }

    renderVideosList() {
        if (this.videos.length === 0) {
            this.videosList.innerHTML = `
                <div class="empty-state">
                    <p>No videos found. Add some channels in settings!</p>
                    <button onclick="app.switchView('settings')" 
                            class="add-channels-button">
                        Add Channels
                    </button>
                </div>`;
            return;
        }

        this.videosList.innerHTML = this.videos.map(video => `
            <div class="video-card bg-white rounded-lg shadow-sm overflow-hidden">
                <div class="aspect-w-16 aspect-h-9 cursor-pointer"
                     onclick="app.openVideo('${video.videoId}')">
                    <img src="${video.thumbnail}" 
                         alt="${video.title}"
                         class="video-thumbnail">
                </div>
                <div class="video-info p-4">
                    <h3 class="video-title font-medium line-clamp-2">${video.title}</h3>
                    <p class="channel-name text-sm text-gray-600 mt-2">${video.channelName}</p>
                    <p class="publish-date text-sm text-gray-500 mt-1">
                        ${new Date(video.publishedDate).toLocaleDateString()}
                    </p>
                </div>
            </div>
        `).join('');
    }

    loadingTemplate() {
        return `
            <div class="loading-state flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
                <p class="ml-4 text-gray-600">Loading your feeds...</p>
            </div>
        `;
    }
}

const app = new YouTubeApp();
export default app;
