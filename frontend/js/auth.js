// js/auth.js - FIXED VERSION with duplicate exchange prevention

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize auth module
    window.auth = {
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

        // Show notification
        showNotification: function(message, type = 'info', duration = 5000) {
            const container = document.getElementById('notificationContainer');
            if (!container) return;

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            // Add icon based on type
            let icon = '';
            switch(type) {
                case 'success':
                    icon = 'check_circle';
                    break;
                case 'error':
                    icon = 'error';
                    break;
                case 'info':
                    icon = 'info';
                    break;
            }

            notification.innerHTML = `
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-${type === 'error' ? 'red' : type === 'success' ? 'green' : 'blue'}-500">${icon}</span>
                    <div class="flex-1">
                        <p class="text-sm font-medium">${message}</p>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            `;

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
        getGoogleAuthUrl: async function(action = 'signin') {
            try {
                // Pass action as query parameter to backend
                const response = await fetch(`${BACKEND_URL}/api/auth/google/url?action=${action}`);
                const data = await response.json();
                return data.auth_url;
            } catch (error) {
                console.error('Error getting auth URL:', error);
                return null;
            }
        },

        // Google Sign In - For sign-in page
        googleSignIn: function() {
            this.showLoading('Redirecting to Google...');
            this.initiateGoogleAuth('signin');
        },

        // Google Sign Up - For sign-up page
        googleSignUp: function() {
            this.showLoading('Redirecting to Google...');
            this.initiateGoogleAuth('signup');
        },

        // Initiate Google OAuth flow - FIXED: removed duplicate state parameter
        initiateGoogleAuth: async function(action = 'signin') {
            try {
                // Get the auth URL from backend (backend now handles action)
                const authUrl = await this.getGoogleAuthUrl(action);
                
                if (authUrl) {
                    console.log(`Redirecting to Google for ${action}...`);
                    // Redirect to Google - DON'T add any extra parameters
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

        // Handle OAuth callback - This runs when Google redirects back with code
        handleOAuthCallback: function() {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const error = urlParams.get('error');
            const state = urlParams.get('state') || 'signin';
            
            console.log('OAuth callback detected', { code: !!code, error, state });
            
            if (error) {
                // Handle error from Google
                const errorMsg = `Google auth error: ${error}`;
                console.error(errorMsg);
                this.showNotification(errorMsg, 'error');
                
                // Redirect back to appropriate page after showing error
                setTimeout(() => {
                    window.location.href = state === 'signup' ? '/frontend/sign-up.html' : '/frontend/sign-in.html';
                }, 2000);
                return;
            }
            
            if (code) {
                // Exchange code for token
                this.exchangeCodeForToken(code, state);
            }
        },

        // Exchange code for token via POST to backend - WITH DUPLICATE PREVENTION
        exchangeCodeForToken: async function(code, state) {
            // Prevent multiple simultaneous exchanges
            if (this.isExchangingToken) {
                console.log('⚠️ Token exchange already in progress, skipping...');
                return;
            }
            
            this.isExchangingToken = true;
            this.showLoading('Completing authentication...');
            
            try {
                console.log('Exchanging code for token...');
                
                // Clear the code from URL immediately to prevent reuse on page refresh
                window.history.replaceState({}, document.title, window.location.pathname);
                
                const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: code })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Authentication failed');
                }

                const data = await response.json();
                console.log('Authentication successful', data);
                
                // Store auth data
                localStorage.setItem('auth_token', data.access_token);
                localStorage.setItem('token_type', data.token_type);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                // Show success message
                this.showNotification('Successfully signed in!', 'success');
                
                // Store action type for welcome message if needed
                if (data.user.is_new) {
                    localStorage.setItem('welcome_new_user', 'true');
                }
                
                // Redirect based on user role
                setTimeout(() => {
                    // You can customize this based on your actual user roles
                    if (data.user.role === 'admin') {
                        window.location.href = '/frontend/admin-dashboard.html';
                    } else if (data.user.role === 'provider') {
                        window.location.href = '/frontend/provider-dashboard.html';
                    } else {
                        window.location.href = '/frontend/customer-dashboard.html';
                    }
                }, 1500);
                
            } catch (error) {
                console.error('Token exchange error:', error);
                
                // Only show error if we're not already on a dashboard page
                // This prevents showing errors after successful redirect
                const currentPath = window.location.pathname;
                if (!currentPath.includes('dashboard')) {
                    this.showNotification(error.message || 'Authentication failed', 'error');
                    
                    // Redirect back to sign in/up page
                    setTimeout(() => {
                        window.location.href = state === 'signup' ? '/frontend/sign-up.html' : '/frontend/sign-in.html';
                    }, 2000);
                }
                
            } finally {
                this.isExchangingToken = false;
                this.hideLoading();
            }
        },

        // Check for OAuth callback on page load
        checkForOAuthCallback: function() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('code') || urlParams.has('error')) {
                this.handleOAuthCallback();
                return true;
            }
            return false;
        },

        // Sign out
        signOut: async function() {
            try {
                this.showLoading('Signing out...');
                
                const token = localStorage.getItem('auth_token');
                
                const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
                    method: 'GET',
                    headers: {
                        'Authorization': token ? `Bearer ${token}` : ''
                    }
                });

                if (response.ok) {
                    // Clear local storage
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('token_type');
                    localStorage.removeItem('user');
                    localStorage.removeItem('welcome_new_user');
                    
                    this.showNotification('Successfully signed out', 'success');
                    
                    // Redirect to home page
                    setTimeout(() => {
                        window.location.href = '/frontend/index.html';
                    }, 1500);
                } else {
                    throw new Error('Logout failed');
                }
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Failed to sign out. Please try again.', 'error');
            } finally {
                this.hideLoading();
            }
        },

        // Verify token and get user info
        verifyToken: async function(token) {
            try {
                const response = await fetch(`${BACKEND_URL}/api/auth/verify?token=${token}`);
                
                if (!response.ok) {
                    throw new Error('Invalid token');
                }
                
                return await response.json();
            } catch (error) {
                console.error('Token verification error:', error);
                return null;
            }
        },

        // Check authentication status
        isAuthenticated: function() {
            return !!localStorage.getItem('auth_token');
        },

        // Get current user profile
        getCurrentUser: function() {
            const userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        },

        // Require authentication - redirect if not authenticated
        requireAuth: function(redirectTo = '/frontend/sign-in.html') {
            if (!this.isAuthenticated()) {
                window.location.href = redirectTo;
                return false;
            }
            return true;
        },

        // Redirect if already authenticated
        redirectIfAuthenticated: function(redirectTo = '/frontend/customer-dashboard.html') {
            if (this.isAuthenticated()) {
                window.location.href = redirectTo;
                return true;
            }
            return false;
        },

        // Check for welcome message for new users
        checkWelcomeMessage: function() {
            if (localStorage.getItem('welcome_new_user') === 'true') {
                this.showNotification('Welcome to ErrandEase! Your account has been created.', 'success', 6000);
                localStorage.removeItem('welcome_new_user');
            }
        }
    };

    // Bind methods to ensure 'this' context
    window.auth.handleOAuthCallback = window.auth.handleOAuthCallback.bind(window.auth);
    window.auth.exchangeCodeForToken = window.auth.exchangeCodeForToken.bind(window.auth);
    window.auth.checkForOAuthCallback = window.auth.checkForOAuthCallback.bind(window.auth);
    window.auth.checkWelcomeMessage = window.auth.checkWelcomeMessage.bind(window.auth);

    // Check if this is an OAuth callback (has code in URL)
    const isCallback = window.auth.checkForOAuthCallback();
    
    if (!isCallback) {
        // Not a callback, proceed with normal initialization
        
        // Check for welcome message (for new users)
        window.auth.checkWelcomeMessage();
        
        // Attach event listeners to Google Sign In button (for sign-in page)
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        if (googleSignInBtn) {
            // Remove existing listeners to prevent duplicates
            const newBtn = googleSignInBtn.cloneNode(true);
            googleSignInBtn.parentNode.replaceChild(newBtn, googleSignInBtn);
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.auth.googleSignIn();
            });
        }

        // Attach event listeners to Google Sign Up button (for sign-up page)
        const googleSignUpBtn = document.getElementById('googleSignUpBtn');
        if (googleSignUpBtn) {
            // Remove existing listeners to prevent duplicates
            const newBtn = googleSignUpBtn.cloneNode(true);
            googleSignUpBtn.parentNode.replaceChild(newBtn, googleSignUpBtn);
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.auth.googleSignUp();
            });
        }

        // Attach event listeners to sign out buttons
        const signOutBtns = document.querySelectorAll('.sign-out-btn');
        signOutBtns.forEach(btn => {
            // Remove existing listeners to prevent duplicates
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.auth.signOut();
            });
        });

        // Check for token in URL (backward compatibility)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Store token
            localStorage.setItem('auth_token', token);
            // Verify and get user info
            window.auth.verifyToken(token).then(user => {
                if (user) {
                    localStorage.setItem('user', JSON.stringify(user));
                    window.location.href = '/frontend/customer-dashboard.html';
                }
            });
        }
    }

    console.log('Auth module initialized with BACKEND_URL:', BACKEND_URL);
});