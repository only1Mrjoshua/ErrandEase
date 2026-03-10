// agent-blocked.js - Blocked agent page with appeal functionality

(function() {
    // Guard to prevent double initialization
    if (window.agentBlockedInitialized) {
        console.log('Agent blocked page already initialized, skipping...');
        return;
    }
    
    window.agentBlockedInitialized = true;
    console.log('Initializing agent blocked page...');

    // DOM Elements
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    const notificationContainer = document.getElementById('notificationContainer');
    const blockedReasonDisplay = document.getElementById('blockedReasonDisplay');
    const blockedDateDisplay = document.getElementById('blockedDate');
    
    // Tab elements
    const infoTabBtn = document.getElementById('infoTabBtn');
    const appealTabBtn = document.getElementById('appealTabBtn');
    const infoTab = document.getElementById('infoTab');
    const appealTab = document.getElementById('appealTab');
    const startAppealBtn = document.getElementById('startAppealBtn');
    const backToInfoBtn = document.getElementById('backToInfoBtn');
    
    // Appeal form
    const appealForm = document.getElementById('appealForm');
    const appealSubject = document.getElementById('appealSubject');
    const appealMessage = document.getElementById('appealMessage');
    const submitAppealBtn = document.getElementById('submitAppealBtn');
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');

    // State
    let currentUser = null;
    let blockInfo = null;

    // ==================== UI HELPERS ====================

    function showLoading(message = 'Loading...') {
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

    // ==================== TAB SWITCHING ====================

    function switchToInfoTab() {
        infoTabBtn.classList.add('active', 'text-primary', 'border-primary');
        infoTabBtn.classList.remove('text-slate-500');
        appealTabBtn.classList.remove('active', 'text-primary', 'border-primary');
        appealTabBtn.classList.add('text-slate-500');
        appealTabBtn.classList.remove('border-primary');
        
        infoTab.classList.remove('hidden');
        appealTab.classList.add('hidden');
    }

    function switchToAppealTab() {
        appealTabBtn.classList.add('active', 'text-primary', 'border-primary');
        appealTabBtn.classList.remove('text-slate-500');
        infoTabBtn.classList.remove('active', 'text-primary', 'border-primary');
        infoTabBtn.classList.add('text-slate-500');
        infoTabBtn.classList.remove('border-primary');
        
        appealTab.classList.remove('hidden');
        infoTab.classList.add('hidden');
    }

    // ==================== API CALLS ====================

    async function makeAuthenticatedRequest(url, options = {}) {
        const token = localStorage.getItem('access_token');
        
        if (!token) {
            redirectToSignIn();
            return null;
        }

        const fullUrl = url.startsWith('http') ? url : `${window.BACKEND_URL}${url}`;
        
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            let response = await fetch(fullUrl, { ...options, headers });

            if (response.status === 401) {
                console.log('Token expired, attempting refresh...');
                const newToken = await refreshAccessToken();
                if (newToken) {
                    headers.Authorization = `Bearer ${newToken}`;
                    response = await fetch(fullUrl, { ...options, headers });
                } else {
                    redirectToSignIn();
                    return null;
                }
            }

            return response;
        } catch (error) {
            console.error('Request failed:', error);
            throw error;
        }
    }

    async function refreshAccessToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) return null;
        
        try {
            const response = await fetch(`${window.BACKEND_URL}/api/auth/refresh?refresh_token=${refreshToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                return data.access_token;
            } else {
                clearAuth();
                return null;
            }
        } catch (e) {
            console.error('Error refreshing token:', e);
            return null;
        }
    }

    async function fetchBlockInfo() {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/verification/status');
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching block info:', error);
            return null;
        }
    }

    async function submitAppeal(subject, message) {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/appeal/submit', {
                method: 'POST',
                body: JSON.stringify({
                    subject: subject,
                    message: message
                })
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to submit appeal');
            }
        } catch (error) {
            console.error('Error submitting appeal:', error);
            throw error;
        }
    }

    // ==================== AUTH HELPERS ====================

    async function fetchCurrentUser() {
        const token = localStorage.getItem('access_token');
        if (!token) {
            redirectToSignIn();
            return null;
        }

        try {
            const response = await makeAuthenticatedRequest('/api/auth/me');
            if (response && response.ok) {
                const userData = await response.json();
                currentUser = userData;
                localStorage.setItem('user', JSON.stringify(userData));
                return userData;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
        
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                currentUser = JSON.parse(storedUser);
                return currentUser;
            } catch (e) {
                console.error('Error parsing stored user:', e);
            }
        }
        
        return null;
    }

    function clearAuth() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        currentUser = null;
    }

    function redirectToSignIn() {
        const path = window.location.pathname;
        const signInUrl = path.includes("/frontend/") 
            ? "/frontend/agent-signin.html" 
            : "/agent-signin.html";
        window.location.href = signInUrl;
    }

    // ==================== PAGE INITIALIZATION ====================

    async function initializePage() {
        showLoading('Loading account information...');
        
        try {
            // Check authentication
            const token = localStorage.getItem('access_token');
            if (!token) {
                redirectToSignIn();
                return;
            }

            // Fetch user
            await fetchCurrentUser();
            if (!currentUser) {
                redirectToSignIn();
                return;
            }

            // Fetch block information
            blockInfo = await fetchBlockInfo();
            console.log('Block info:', blockInfo);

            // Verify user is actually blocked
            if (blockInfo && (blockInfo.account_status !== 'blocked' && !blockInfo.is_blocked)) {
                // Not blocked - redirect to appropriate page
                if (blockInfo.verification_status === 'approved') {
                    const dashboardUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-dashboard.html'
                        : '/agent-dashboard.html';
                    window.location.href = dashboardUrl;
                } else {
                    const verificationUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-verification.html'
                        : '/agent-verification.html';
                    window.location.href = verificationUrl;
                }
                return;
            }

            // Display block information
            if (blockInfo) {
                if (blockInfo.blocked_reason) {
                    blockedReasonDisplay.textContent = blockInfo.blocked_reason;
                }
                
                // Format date if available
                if (blockInfo.blocked_at) {
                    const date = new Date(blockInfo.blocked_at);
                    blockedDateDisplay.textContent = date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                } else {
                    blockedDateDisplay.textContent = 'Unknown';
                }
            }

        } catch (error) {
            console.error('Error initializing page:', error);
            showNotification('Failed to load account information', 'error');
        } finally {
            hideLoading();
        }
    }

    // ==================== EVENT HANDLERS ====================

    // Tab switching
    if (infoTabBtn) {
        infoTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToInfoTab();
        });
    }

    if (appealTabBtn) {
        appealTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToAppealTab();
        });
    }

    if (startAppealBtn) {
        startAppealBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToAppealTab();
        });
    }

    if (backToInfoBtn) {
        backToInfoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchToInfoTab();
        });
    }

    // Appeal form submission
    if (appealForm) {
        appealForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const subject = appealSubject.value.trim();
            const message = appealMessage.value.trim();

            if (!subject) {
                showNotification('Please enter a subject', 'error');
                return;
            }

            if (!message || message.length < 50) {
                showNotification('Please provide a detailed explanation (minimum 50 characters)', 'error');
                return;
            }

            // Disable submit button
            submitAppealBtn.disabled = true;
            submitAppealBtn.textContent = 'Submitting...';
            showLoading('Submitting appeal...');

            try {
                const result = await submitAppeal(subject, message);
                console.log('Appeal submitted:', result);
                
                showNotification('Your appeal has been submitted successfully. We will review it within 2-3 business days.', 'success');
                
                // Clear form and switch back to info tab
                appealSubject.value = '';
                appealMessage.value = '';
                switchToInfoTab();
                
            } catch (error) {
                console.error('Appeal submission error:', error);
                showNotification(error.message || 'Failed to submit appeal', 'error');
            } finally {
                submitAppealBtn.disabled = false;
                submitAppealBtn.textContent = 'Submit Appeal';
                hideLoading();
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            if (window.agentAuth && window.agentAuth.signOut) {
                await window.agentAuth.signOut();
            } else {
                clearAuth();
                redirectToSignIn();
            }
        });
    }

    // Initialize
    initializePage();
})();