// js/auth.js

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
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
        redirectIfAuthenticated: function(redirectTo = 'dashboard.html') {
            if (this.isAuthenticated()) {
                window.location.href = redirectTo;
                return true;
            }
            return false;
        }
    };

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
});