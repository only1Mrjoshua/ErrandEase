// agent-auth.js - Authentication for agent pages

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize agent auth module
    window.agentAuth = {
        // Flag to prevent multiple token exchanges
        isExchangingToken: false,
        
        // Show loading overlay
        showLoading: function(message = 'Loading...') {
            const overlay = document.getElementById('loadingOverlay');
            const messageEl = document.getElementById('loadingMessage');
            if (overlay) {
                if (messageEl) messageEl.textContent = message;
                overlay.classList.add('active');
            }
        },

        // Hide loading overlay
        hideLoading: function() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        },

        // Show notification - SAFE version with textContent
        showNotification: function(message, type = 'info', duration = 5000) {
            const container = document.getElementById('notificationContainer');
            if (!container) return;

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            // Build DOM safely - no innerHTML with untrusted content
            const flexDiv = document.createElement('div');
            flexDiv.className = 'flex items-start gap-3';
            
            // Icon span
            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined';
            switch(type) {
                case 'success':
                    iconSpan.className += ' text-green-500';
                    iconSpan.textContent = 'check_circle';
                    break;
                case 'error':
                    iconSpan.className += ' text-red-500';
                    iconSpan.textContent = 'error';
                    break;
                case 'info':
                    iconSpan.className += ' text-blue-500';
                    iconSpan.textContent = 'info';
                    break;
            }
            
            // Content div
            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex-1';
            
            const messageP = document.createElement('p');
            messageP.className = 'text-sm font-medium';
            messageP.textContent = message; // SAFE: textContent, not innerHTML
            
            contentDiv.appendChild(messageP);
            
            // Close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300';
            closeBtn.onclick = () => notification.remove();
            
            const closeIcon = document.createElement('span');
            closeIcon.className = 'material-symbols-outlined text-sm';
            closeIcon.textContent = 'close';
            
            closeBtn.appendChild(closeIcon);
            
            // Assemble
            flexDiv.appendChild(iconSpan);
            flexDiv.appendChild(contentDiv);
            flexDiv.appendChild(closeBtn);
            notification.appendChild(flexDiv);
            
            container.appendChild(notification);

            // Trigger animation
            setTimeout(() => {
                notification.classList.add('show');
            }, 10);

            // Auto remove after duration
            if (duration > 0) {
                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => {
                        if (notification.parentElement) {
                            notification.remove();
                        }
                    }, 300);
                }, duration);
            }

            return notification;
        },

        // Get Google Auth URL from backend
        getGoogleAuthUrl: async function(action = 'agent-signin') {
            try {
                const response = await fetch(`${window.BACKEND_URL}/api/auth/google/url?action=${action}`);
                const data = await response.json();
                return data.auth_url;
            } catch (error) {
                console.error('Error getting auth URL:', error);
                return null;
            }
        },

        // Google Sign In
        googleSignIn: function() {
            this.showLoading('Redirecting to Google...');
            this.initiateGoogleAuth('agent-signin');
        },

        // Google Sign Up
        googleSignUp: function() {
            this.showLoading('Redirecting to Google...');
            this.initiateGoogleAuth('agent-signup');
        },

        // Initiate Google OAuth flow
        initiateGoogleAuth: async function(action = 'agent-signin') {
            try {
                const authUrl = await this.getGoogleAuthUrl(action);
                
                if (authUrl) {
                    console.log(`Redirecting to Google for ${action}...`);
                    window.location.href = authUrl;
                } else {
                    throw new Error('Failed to get auth URL');
                }
            } catch (error) {
                console.error('Google auth error:', error);
                this.showNotification('Failed to start Google authentication', 'error');
                this.hideLoading();
            }
        },

        // Handle OAuth callback
        handleOAuthCallback: function() {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const error = urlParams.get('error');
            const state = urlParams.get('state');
            
            console.log('Agent OAuth callback detected', { code: !!code, error, state: !!state });
            
            if (error) {
                // Handle error from Google
                const errorMsg = `Google auth error: ${error}`;
                console.error(errorMsg);
                this.showNotification(errorMsg, 'error');
                
                // Redirect back to appropriate page after showing error
                setTimeout(() => {
                    const signinUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-signin.html'
                        : '/agent-signin.html';
                    window.location.href = signinUrl;
                }, 2000);
                return;
            }
            
            if (code && state) {
                // Get business name if on signup page
                let businessName = null;
                if (window.location.pathname.includes('agent-signup.html')) {
                    const businessInput = document.getElementById('businessName');
                    if (businessInput && businessInput.value.trim()) {
                        businessName = businessInput.value.trim();
                    }
                }
                
                // Exchange code for token
                this.exchangeCodeForToken(code, state, businessName);
            }
        },

        // Exchange code for token via POST to backend
        exchangeCodeForToken: async function(code, state, businessName = null) {
            // Prevent multiple simultaneous exchanges
            if (this.isExchangingToken) {
                console.log('⚠️ Token exchange already in progress, skipping...');
                return;
            }
            
            this.isExchangingToken = true;
            this.showLoading('Completing authentication...');
            
            try {
                console.log('Exchanging code for token...');
                
                // Clear the code from URL immediately
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Backend expects payload wrapper
                const requestBody = {
                    payload: {
                        code: code,
                        state: state
                    }
                };
                
                if (businessName) {
                    requestBody.payload.business_name = businessName;
                }
                
                const response = await fetch(`${window.BACKEND_URL}/api/auth/google/agent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Authentication failed');
                }

                const data = await response.json();
                console.log('Authentication successful');
                
                // Store tokens in localStorage
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('refresh_token', data.refresh_token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                // Show success message
                this.showNotification('Successfully signed in!', 'success');
                
                // Redirect to agent dashboard
                setTimeout(() => {
                    const dashboardUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-dashboard.html'
                        : '/agent-dashboard.html';
                    window.location.href = dashboardUrl;
                }, 1500);
                
            } catch (error) {
                console.error('Token exchange error:', error);
                this.showNotification(error.message || 'Authentication failed', 'error');
                
                setTimeout(() => {
                    const signinUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-signin.html'
                        : '/agent-signin.html';
                    window.location.href = signinUrl;
                }, 2000);
                
            } finally {
                this.isExchangingToken = false;
                this.hideLoading();
            }
        },

        // Check for OAuth callback on page load
        checkForOAuthCallback: function() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('code') && urlParams.has('state')) {
                this.handleOAuthCallback();
                return true;
            }
            return false;
        },

        // Refresh access token
        refreshToken: async function() {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) return null;
            
            try {
                const response = await fetch(`${window.BACKEND_URL}/api/auth/refresh?refresh_token=${refreshToken}`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    // If refresh fails, clear everything and redirect to login
                    this.clearAuth();
                    const signinUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-signin.html'
                        : '/agent-signin.html';
                    window.location.href = signinUrl;
                    return null;
                }
                
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                return data.access_token;
            } catch (error) {
                console.error('Error refreshing token:', error);
                this.clearAuth();
                const signinUrl = window.location.pathname.includes('/frontend/') 
                    ? '/frontend/agent-signin.html'
                    : '/agent-signin.html';
                window.location.href = signinUrl;
                return null;
            }
        },

        // Make authenticated fetch request
        authenticatedFetch: async function(url, options = {}) {
            let token = localStorage.getItem('access_token');
            
            if (!token) {
                const signinUrl = window.location.pathname.includes('/frontend/') 
                    ? '/frontend/agent-signin.html'
                    : '/agent-signin.html';
                window.location.href = signinUrl;
                return null;
            }
            
            // Add authorization header
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
            
            let response = await fetch(url, options);
            
            // If token expired, try to refresh
            if (response.status === 401) {
                const newToken = await this.refreshToken();
                if (newToken) {
                    // Retry with new token
                    options.headers['Authorization'] = `Bearer ${newToken}`;
                    response = await fetch(url, options);
                } else {
                    return null;
                }
            }
            
            return response;
        },

        // Sign out
        signOut: async function() {
            try {
                this.showLoading('Signing out...');
                
                const refreshToken = localStorage.getItem('refresh_token');
                
                if (refreshToken) {
                    // Call logout endpoint to revoke refresh token
                    await fetch(`${window.BACKEND_URL}/api/auth/logout?refresh_token=${refreshToken}`, {
                        method: 'POST'
                    });
                }
                
                // Clear all auth data
                this.clearAuth();
                
                this.showNotification('Successfully signed out', 'success');
                
                // Redirect to home page
                setTimeout(() => {
                    const indexUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/index.html'
                        : '/index.html';
                    window.location.href = indexUrl;
                }, 1500);
                
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Failed to sign out. Please try again.', 'error');
            } finally {
                this.hideLoading();
            }
        },

        // Clear all authentication data
        clearAuth: function() {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
        },

        // Get current user info from API
        getCurrentUser: async function() {
            try {
                const response = await this.authenticatedFetch(`${window.BACKEND_URL}/api/auth/me`);
                
                if (!response || !response.ok) {
                    return null;
                }
                
                const userData = await response.json();
                
                // Update cached user
                localStorage.setItem('user', JSON.stringify(userData));
                return userData;
            } catch (error) {
                console.error('Error getting current user:', error);
                return null;
            }
        },

        // Get user from localStorage (cached)
        getCachedUser: function() {
            const userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        },

        // Check authentication status
        isAuthenticated: function() {
            return !!localStorage.getItem('access_token');
        },

        // Check if user has agent role
        isAgent: function() {
            const user = this.getCachedUser();
            return user && user.role === 'agent';
        },

        // Require authentication - redirect if not authenticated
        requireAuth: function(redirectTo = null) {
            if (!this.isAuthenticated()) {
                const signinUrl = window.location.pathname.includes('/frontend/') 
                    ? '/frontend/agent-signin.html'
                    : '/agent-signin.html';
                window.location.href = redirectTo || signinUrl;
                return false;
            }
            
            // Also check if user is agent
            if (!this.isAgent()) {
                const customerDashboard = window.location.pathname.includes('/frontend/') 
                    ? '/frontend/customer-dashboard.html'
                    : '/customer-dashboard.html';
                window.location.href = customerDashboard;
                return false;
            }
            
            return true;
        },

        // Redirect if already authenticated
        redirectIfAuthenticated: function(redirectTo = null) {
            if (this.isAuthenticated() && this.isAgent()) {
                const dashboardUrl = redirectTo || (window.location.pathname.includes('/frontend/') 
                    ? '/frontend/agent-dashboard.html'
                    : '/agent-dashboard.html');
                window.location.href = dashboardUrl;
                return true;
            }
            return false;
        },

        // Check if user has specific role
        hasRole: function(role) {
            const user = this.getCachedUser();
            return user && user.role === role;
        },

        // Initialize auth on page
        init: function() {
            // Check for OAuth callback
            const isCallback = this.checkForOAuthCallback();
            
            if (!isCallback) {
                // Attach event listeners to Google button
                const googleBtn = document.querySelector('button[type="button"]');
                if (googleBtn) {
                    const isSignup = window.location.pathname.includes('agent-signup.html');
                    googleBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (isSignup) {
                            this.googleSignUp();
                        } else {
                            this.googleSignIn();
                        }
                    });
                }

                // Attach event listeners to sign out buttons
                const signOutBtns = document.querySelectorAll('.sign-out-btn');
                signOutBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.signOut();
                    });
                });

                // Auto-refresh token periodically (every 10 minutes)
                setInterval(() => {
                    if (this.isAuthenticated()) {
                        this.refreshToken();
                    }
                }, 10 * 60 * 1000);
            }
        }
    };

    // Initialize
    window.agentAuth.init();
    console.log('Agent auth module initialized');
});