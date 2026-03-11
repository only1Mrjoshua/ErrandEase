// admin-login.js - Admin authentication with email/username + password

(function() {
    // Guard to prevent double initialization
    if (window.adminLoginInitialized) {
        console.log('Admin login already initialized, skipping...');
        return;
    }
    
    window.adminLoginInitialized = true;
    console.log('Initializing admin login...');

    // DOM Elements
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    const notificationContainer = document.getElementById('notificationContainer');

    // ==================== UI HELPERS ====================

    function showLoading(message = 'Authenticating...') {
        if (loadingMessage) loadingMessage.textContent = message;
        if (loadingOverlay) loadingOverlay.classList.add('active');
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.classList.remove('active');
    }

    function showNotification(message, type = 'info', duration = 5000) {
        if (!notificationContainer) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const flexDiv = document.createElement('div');
        flexDiv.className = 'flex items-start gap-3';
        
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
            default:
                iconSpan.className += ' text-blue-500';
                iconSpan.textContent = 'info';
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'flex-1';
        
        const messageP = document.createElement('p');
        messageP.className = 'text-sm font-medium';
        messageP.textContent = message;
        
        contentDiv.appendChild(messageP);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-slate-400 hover:text-slate-600';
        closeBtn.onclick = () => notification.remove();
        
        const closeIcon = document.createElement('span');
        closeIcon.className = 'material-symbols-outlined text-sm';
        closeIcon.textContent = 'close';
        
        closeBtn.appendChild(closeIcon);
        
        flexDiv.appendChild(iconSpan);
        flexDiv.appendChild(contentDiv);
        flexDiv.appendChild(closeBtn);
        notification.appendChild(flexDiv);
        
        notificationContainer.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

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
    }

    // ==================== PASSWORD TOGGLE ====================

    let passwordVisible = false;
    togglePasswordBtn.addEventListener('click', () => {
        passwordVisible = !passwordVisible;
        passwordInput.type = passwordVisible ? 'text' : 'password';
        togglePasswordBtn.querySelector('.material-symbols-outlined').textContent = 
            passwordVisible ? 'visibility_off' : 'visibility';
    });

    // ==================== AUTH FUNCTIONS ====================

    async function adminLogin(username, password) {
        try {
            const response = await fetch(`${window.BACKEND_URL}/api/admin/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Login failed');
            }

            const data = await response.json();
            
            // Store tokens and user data
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    function getDashboardUrl() {
        const path = window.location.pathname;
        return path.includes("/frontend/") 
            ? "/frontend/admin-dashboard.html" 
            : "/admin-dashboard.html";
    }

    // ==================== FORM SUBMISSION ====================

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showNotification('Please enter both username/email and password', 'error');
            return;
        }

        // Disable button
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        showLoading('Authenticating...');

        try {
            const result = await adminLogin(username, password);
            console.log('Login successful:', result);
            
            showNotification('Login successful! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = getDashboardUrl();
            }, 1500);

        } catch (error) {
            console.error('Login failed:', error);
            showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
            
            // Re-enable button
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In to Admin Dashboard';
            hideLoading();
        }
    });

    // ==================== CHECK EXISTING SESSION ====================

    function checkExistingSession() {
        const token = localStorage.getItem('access_token');
        const userStr = localStorage.getItem('user');
        
        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user.role === 'admin') {
                    // Already logged in as admin, redirect to dashboard
                    window.location.href = getDashboardUrl();
                }
            } catch (e) {
                console.error('Error parsing stored user:', e);
                // Clear invalid data
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
            }
        }
    }

    // Initialize
    checkExistingSession();
    console.log('Admin login module initialized');
})();