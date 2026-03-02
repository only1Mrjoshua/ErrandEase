// js/auth.js - COMPLETE FIXED VERSION

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // First, check if this is an OAuth callback
    handleOAuthCallback();
    
    // Initialize auth module
    window.auth = {
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

        // Google Sign In
        googleSignIn: function() {
            this.showLoading('Redirecting to Google...');
            
            // Use BACKEND_URL from config.js
            const googleAuthUrl = `${BACKEND_URL}/api/auth/google/login`;
            
            // Redirect to Google OAuth
            window.location.href = googleAuthUrl;
        },

        // Handle token from redirect
        handleTokenRedirect: function(token) {
            this.showLoading('Completing sign in...');
            
            // Store token
            localStorage.setItem('auth_token', token);
            
            // Verify token and get user info
            this.verifyToken(token).then(user => {
                if (user) {
                    localStorage.setItem('user', JSON.stringify(user));
                    this.showNotification('Successfully signed in!', 'success');
                    
                    // Redirect to dashboard
                    setTimeout(() => {
                        window.location.href = '/customer-dashboard.html';
                    }, 1500);
                } else {
                    this.showNotification('Failed to verify user', 'error');
                    localStorage.removeItem('auth_token');
                }
                this.hideLoading();
            }).catch(error => {
                console.error('Token verification error:', error);
                this.showNotification('Authentication failed', 'error');
                this.hideLoading();
            });
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
                    localStorage.removeItem('user');
                    
                    this.showNotification('Successfully signed out', 'success');
                    
                    // Redirect to home page
                    setTimeout(() => {
                        window.location.href = '/';
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
        requireAuth: function(redirectTo = 'signin.html') {
            if (!this.isAuthenticated()) {
                window.location.href = redirectTo;
                return false;
            }
            return true;
        },

        // Redirect if already authenticated
        redirectIfAuthenticated: function(redirectTo = 'customer-dashboard.html') {
            if (this.isAuthenticated()) {
                window.location.href = redirectTo;
                return true;
            }
            return false;
        },

        // NEW: Check for token in URL (for redirect from backend)
        checkForToken: function() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            
            if (token) {
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
                this.handleTokenRedirect(token);
                return true;
            }
            return false;
        }
    };

    // Bind methods to ensure 'this' context
    window.auth.handleTokenRedirect = window.auth.handleTokenRedirect.bind(window.auth);
    window.auth.checkForToken = window.auth.checkForToken.bind(window.auth);

    // Check for token in URL first
    if (!window.auth.checkForToken()) {
        // If no token, proceed with normal initialization
        initializeNormalAuth();
    }
});

// Separate function for normal auth initialization
function initializeNormalAuth() {
    // Attach event listeners to Google Sign In buttons
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.auth.googleSignIn();
        });
    }

    // Attach event listeners to sign out buttons
    const signOutBtns = document.querySelectorAll('.sign-out-btn');
    signOutBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            window.auth.signOut();
        });
    });

    console.log('Auth module initialized with BACKEND_URL:', BACKEND_URL);
}

// NEW: Handle OAuth callback from Google
function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    // Check if this is an OAuth callback (has code or error params)
    if (code || error) {
        console.log('📞 OAuth callback detected');
        
        // Show loading
        if (window.auth) {
            window.auth.showLoading('Completing sign in...');
        }
        
        // This page is the callback URL - we need to forward to backend
        // The backend will complete the OAuth flow and redirect back with token
        const callbackUrl = `${BACKEND_URL}/api/auth/google/callback${window.location.search}`;
        
        // Redirect to backend callback
        window.location.href = callbackUrl;
        return true;
    }
    return false;
}