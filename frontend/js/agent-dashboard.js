// agent-dashboard.js - Updated with unified UI feedback system
(function() {
    // Guard to prevent double initialization
    if (window.agentDashboardInitialized) {
        console.log('Agent dashboard already initialized, skipping...');
        return;
    }
    
    window.agentDashboardInitialized = true;
    console.log('Initializing agent dashboard...');

    // ==================== STATE MANAGEMENT ====================
    
    let currentTab = "available";
    let currentUser = null;
    let availableErrands = [];
    let assignedErrands = [];
    let completedErrands = [];
    let earningsSummary = null;
    let isLoading = false;
    let refreshInterval = null;

    // ==================== DOM ELEMENTS ====================
    
    const pageContainer = document.getElementById("pageContainer");
    const sidebar = document.getElementById("desktopSidebar");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const closeSidebarBtn = document.getElementById("closeSidebarBtn");
    const desktopToggleBtn = document.getElementById("desktopToggleBtn");
    const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
    const sidebarLinks = document.querySelectorAll(".sidebar-link");
    const actionModal = document.getElementById("actionModal");
    const modalContent = document.getElementById("actionModalContent");
    const availableCountEl = document.getElementById("availableCount");
    const assignedCountEl = document.getElementById("assignedCount");

    // ==================== AUTH & API HELPERS ====================

    async function makeAuthenticatedRequest(url, options = {}) {
        let token = localStorage.getItem('access_token');
        
        if (!token) {
            console.log('No access token found');
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
                
                if (userData.role !== 'agent') {
                    console.error('User is not an agent:', userData.role);
                    redirectToCustomerDashboard();
                    return null;
                }
                
                currentUser = userData;
                localStorage.setItem('user', JSON.stringify(userData));
                
                updateGreeting();
                
                return userData;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
        
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                if (userData.role === 'agent') {
                    currentUser = userData;
                    updateGreeting();
                    return currentUser;
                }
            } catch (e) {
                console.error('Error parsing stored user:', e);
            }
        }
        
        return null;
    }

    function updateGreeting() {
        const greetingEl = document.querySelector('.top-bar .text-sm.text-slate-500');
        if (greetingEl && currentUser) {
            const hour = new Date().getHours();
            let timeGreeting = 'Good afternoon';
            
            if (hour < 12) timeGreeting = 'Good morning';
            else if (hour < 17) timeGreeting = 'Good afternoon';
            else timeGreeting = 'Good evening';
            
            let firstName = currentUser.name || 'Agent';
            if (firstName.includes(' ')) {
                firstName = firstName.split(' ')[0];
            }
            
            greetingEl.textContent = `👋 ${timeGreeting}, ${firstName}`;
        }
        
        const footerEl = document.querySelector('.p-4.border-t.border-slate-100.text-xs');
        if (footerEl && currentUser) {
            footerEl.textContent = `Agent · ${currentUser.name || 'Agent'}`;
        }
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

    function redirectToCustomerDashboard() {
        const path = window.location.pathname;
        const dashboardUrl = path.includes("/frontend/") 
            ? "/frontend/customer-dashboard.html" 
            : "/customer-dashboard.html";
        window.location.href = dashboardUrl;
    }

    // ==================== API CALLS ====================

    async function fetchAvailableErrands() {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/errands/available');
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching available errands:', error);
            return [];
        }
    }

    async function fetchAssignedErrands() {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/errands/assigned');
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching assigned errands:', error);
            return [];
        }
    }

    async function fetchCompletedErrands() {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/errands/completed');
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching completed errands:', error);
            return [];
        }
    }

    async function fetchEarningsSummary() {
        try {
            const response = await makeAuthenticatedRequest('/api/agent/errands/earnings/summary');
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching earnings:', error);
            return null;
        }
    }

    async function fetchErrandDetails(errandId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/agent/errands/${errandId}`);
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching errand details:', error);
            return null;
        }
    }

    async function acceptErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(
                `/api/agent/errands/${errandId}/accept`,
                { method: 'POST' }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                if (response.status === 409) {
                    throw new Error('This errand has already been accepted by another agent');
                }
                throw new Error(error.detail || 'Failed to accept errand');
            }
        } catch (error) {
            console.error('Error accepting errand:', error);
            throw error;
        }
    }

    async function startErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(
                `/api/agent/errands/${errandId}/start`,
                { method: 'POST' }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to start errand');
            }
        } catch (error) {
            console.error('Error starting errand:', error);
            throw error;
        }
    }

    async function completeErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(
                `/api/agent/errands/${errandId}/complete`,
                { method: 'POST' }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to complete errand');
            }
        } catch (error) {
            console.error('Error completing errand:', error);
            throw error;
        }
    }

    // ==================== UI UPDATE FUNCTIONS ====================

    function updateSidebarCounts() {
        if (availableCountEl) {
            availableCountEl.textContent = availableErrands.length;
        }
        if (assignedCountEl) {
            assignedCountEl.textContent = assignedErrands.length;
        }
    }

    function showLoading() {
        isLoading = true;
        if (pageContainer) {
            pageContainer.innerHTML = `
                <div class="flex items-center justify-center h-64">
                    <div class="text-center">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
                        <p class="mt-2 text-slate-500">Loading...</p>
                    </div>
                </div>
            `;
        }
    }

    function hideLoading() {
        isLoading = false;
    }

    function showError(message) {
        pageContainer.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <span class="material-symbols-outlined text-4xl text-red-400">error</span>
                <p class="mt-2 text-red-600">${escapeHtml(message)}</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Try Again
                </button>
            </div>
        `;
    }

    function formatTimeAgo(dateString) {
        if (!dateString) return 'Recently';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) {
            return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
        }
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        }
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        }
        return date.toLocaleDateString();
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==================== MODAL FUNCTIONS ====================

    function openModal() {
        actionModal.classList.remove("hidden");
        actionModal.classList.add("flex");
    }

    function closeModal() {
        actionModal.classList.add("hidden");
        actionModal.classList.remove("flex");
    }

    window.closeActionModal = closeModal;

    // ==================== RENDER FUNCTIONS ====================

    function renderBlockedState(blockedReason) {
        pageContainer.innerHTML = `
            <div class="max-w-2xl mx-auto py-12">
                <div class="bg-white rounded-2xl p-8 shadow-sm border border-red-100 text-center">
                    <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center text-red-500 mx-auto mb-4">
                        <span class="material-symbols-outlined text-4xl">block</span>
                    </div>
                    <h2 class="text-2xl font-bold text-secondary mb-2">Account Blocked</h2>
                    <p class="text-slate-600 mb-6">
                        Your account has been blocked due to suspicious activity or a customer report.
                    </p>
                    <div class="bg-red-50 rounded-xl p-4 text-left mb-6 border border-red-100">
                        <p class="text-sm font-medium text-red-700 mb-2">Reason:</p>
                        <p class="text-sm text-red-600">${escapeHtml(blockedReason || 'Violation of terms of service')}</p>
                    </div>
                    <div class="bg-slate-50 rounded-xl p-4 text-left mb-6">
                        <p class="text-sm font-medium text-slate-700 mb-2">What can I do?</p>
                        <ul class="text-sm text-slate-600 space-y-2">
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">contact_support</span>
                                <span>Contact our support team to appeal this decision</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">description</span>
                                <span>Provide any evidence or clarification</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">schedule</span>
                                <span>Appeals are typically reviewed within 2-3 business days</span>
                            </li>
                        </ul>
                    </div>
                    <div class="flex gap-3 justify-center">
                        <a href="mailto:support@errandease.com?subject=Account%20Appeal&body=Please%20help%20me%20appeal%20my%20blocked%20account.%20My%20user%20ID:%20${currentUser?.id || ''}" 
                           class="bg-primary hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium transition-colors">
                            Contact Support
                        </a>
                        <button onclick="handleLogout()" class="border border-slate-200 hover:bg-slate-50 px-6 py-3 rounded-xl font-medium transition-colors">
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const navLinks = document.querySelectorAll('.sidebar-link, .bottom-nav-item');
        navLinks.forEach(link => {
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.5';
        });
        
        if (availableCountEl) availableCountEl.textContent = '0';
        if (assignedCountEl) assignedCountEl.textContent = '0';
    }

    function renderPendingApproval() {
        pageContainer.innerHTML = `
            <div class="max-w-2xl mx-auto py-12">
                <div class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
                    <div class="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center text-amber-500 mx-auto mb-4">
                        <span class="material-symbols-outlined text-4xl">hourglass_top</span>
                    </div>
                    <h2 class="text-2xl font-bold text-secondary mb-2">Verification Pending</h2>
                    <p class="text-slate-600 mb-6">
                        Your verification documents are being reviewed by our team. This usually takes 1-2 business days.
                    </p>
                    <div class="bg-slate-50 rounded-xl p-4 text-left mb-6">
                        <p class="text-sm font-medium text-slate-700 mb-2">What happens next?</p>
                        <ul class="text-sm text-slate-600 space-y-2">
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">check_circle</span>
                                <span>Our team reviews your submitted documents</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">check_circle</span>
                                <span>You'll receive a notification once approved</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-sm">check_circle</span>
                                <span>You can then start accepting errands</span>
                            </li>
                        </ul>
                    </div>
                    <p class="text-xs text-slate-400">
                        Need help? <a href="#" class="text-primary hover:underline">Contact support</a>
                    </p>
                </div>
            </div>
        `;
        
        if (availableCountEl) availableCountEl.textContent = '0';
        if (assignedCountEl) assignedCountEl.textContent = '0';
    }

    function renderAvailableTab() {
        if (availableErrands.length === 0) {
            return `
                <div class="h-[70vh] flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-6xl text-slate-300">explore</span>
                    <p class="text-slate-400 text-lg font-medium mt-4">No available errands</p>
                    <p class="text-sm text-slate-400">Check back later for new requests.</p>
                </div>
            `;
        }

        let cards = "";
        availableErrands.forEach((e) => {
            const timeAgo = formatTimeAgo(e.date_requested);
            const isNew = (new Date() - new Date(e.date_requested)) < 30 * 60 * 1000;

            cards += `
                <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm card-hover relative" data-id="${e.id}">
                    ${isNew ? '<div class="absolute top-2 right-2"><span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-1 pulse-animation"></span> New</span></div>' : ""}
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-lg">${escapeHtml(e.title)}</h3>
                        <span class="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold">₦${e.total_cost.toLocaleString()}</span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1">
                        👤 ${escapeHtml(e.customer_name)}
                    </p>
                    <div class="flex text-sm text-slate-600 mt-2">
                        <span class="material-symbols-outlined text-base mr-1">place</span>
                        ${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}
                    </div>
                    <p class="text-xs text-slate-400 mt-2">📅 Posted ${timeAgo}</p>
                    <button class="accept-errand-btn mt-4 w-full bg-primary hover:bg-emerald-600 text-white py-3 rounded-xl font-medium transition-colors" data-id="${e.id}">
                        Accept Errand
                    </button>
                </div>
            `;
        });

        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-secondary">Available Errands (${availableErrands.length})</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${cards}
                </div>
            </div>
        `;
    }

    function renderAssignedTab() {
        if (assignedErrands.length === 0) {
            return `
                <div class="h-[70vh] flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-6xl text-slate-300">assignment</span>
                    <p class="text-slate-400 text-lg font-medium mt-4">No assigned errands</p>
                    <p class="text-sm text-slate-400">Check available errands to accept new tasks.</p>
                </div>
            `;
        }

        let cards = "";
        assignedErrands.forEach((e) => {
            const badgeColors = {
                'accepted': 'bg-blue-100 text-blue-700',
                'in_progress': 'bg-purple-100 text-purple-700',
                'awaiting_confirmation': 'bg-amber-100 text-amber-700'
            };
            const badgeText = {
                'accepted': 'Pending Start',
                'in_progress': 'In Progress',
                'awaiting_confirmation': 'Awaiting Customer Confirmation'
            };
            const badgeColor = badgeColors[e.status] || 'bg-slate-100 text-slate-700';

            cards += `
                <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm card-hover" data-id="${e.id}">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-lg">${escapeHtml(e.title)}</h3>
                        <span class="text-xs px-3 py-1 rounded-full font-semibold ${badgeColor}">${badgeText[e.status] || e.status}</span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1">👤 ${escapeHtml(e.customer_name)}</p>
                    <div class="flex text-sm text-slate-600 mt-2">
                        <span class="material-symbols-outlined text-base mr-1">place</span>
                        ${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}
                    </div>
                    <div class="flex justify-between items-center mt-3">
                        <span class="font-bold text-primary">₦${e.total_cost.toLocaleString()}</span>
                        <button class="view-details-agent text-sm bg-slate-100 hover:bg-primary hover:text-white px-5 py-2 rounded-lg font-medium transition-colors" data-id="${e.id}">
                            View Details
                        </button>
                    </div>
                </div>
            `;
        });

        return `
            <div class="space-y-4">
                <h2 class="text-xl font-bold text-secondary">My Assigned Errands (${assignedErrands.length})</h2>
                ${cards}
            </div>
        `;
    }

    function renderCompletedTab() {
        if (completedErrands.length === 0) {
            return `
                <div class="h-[70vh] flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-6xl text-slate-300">check_circle</span>
                    <p class="text-slate-400 text-lg font-medium mt-4">No completed errands yet</p>
                </div>
            `;
        }

        const totalEarned = completedErrands.reduce((sum, e) => sum + e.total_cost, 0);

        let cards = "";
        completedErrands.forEach((e) => {
            cards += `
                <div class="bg-white/70 rounded-xl p-5 border border-slate-100 shadow-sm opacity-80">
                    <div class="flex justify-between">
                        <h3 class="font-bold text-slate-700">${escapeHtml(e.title)}</h3>
                        <span class="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full">Completed</span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1">👤 ${escapeHtml(e.customer_name)}</p>
                    <p class="font-medium text-primary mt-2">+₦${e.total_cost.toLocaleString()}</p>
                </div>
            `;
        });

        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold">Completed errands</h2>
                    <div class="bg-white px-4 py-2 rounded-full shadow-sm text-primary font-bold">
                        Total: ₦${totalEarned.toLocaleString()}
                    </div>
                </div>
                ${cards}
            </div>
        `;
    }

    function renderEarningsTab() {
        const earnings = earningsSummary || {
            total_earned: 0,
            pending_earnings: 0,
            completed_count: 0,
            average_per_errand: 0,
            this_week: 0,
            this_month: 0
        };

        return `
            <div class="space-y-6">
                <h2 class="text-xl font-bold text-secondary">Earnings & stats</h2>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-white p-4 rounded-xl shadow-sm">
                        <span class="text-slate-500 text-xs">Total earned</span>
                        <p class="text-2xl font-bold text-primary">₦${earnings.total_earned.toLocaleString()}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm">
                        <span class="text-slate-500 text-xs">Pending</span>
                        <p class="text-2xl font-bold text-amber-500">₦${earnings.pending_earnings.toLocaleString()}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm">
                        <span class="text-slate-500 text-xs">Completed</span>
                        <p class="text-2xl font-bold">${earnings.completed_count}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm">
                        <span class="text-slate-500 text-xs">Avg/errand</span>
                        <p class="text-2xl font-bold">₦${earnings.average_per_errand.toLocaleString()}</p>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl shadow-sm">
                    <h3 class="font-medium mb-4">Period earnings</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="text-center p-4 bg-slate-50 rounded-xl">
                            <p class="text-sm text-slate-500">This Week</p>
                            <p class="text-2xl font-bold text-primary">₦${earnings.this_week.toLocaleString()}</p>
                        </div>
                        <div class="text-center p-4 bg-slate-50 rounded-xl">
                            <p class="text-sm text-slate-500">This Month</p>
                            <p class="text-2xl font-bold text-primary">₦${earnings.this_month.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderProfileTab() {
        if (!currentUser) {
            return `<div class="text-center py-8">Loading profile...</div>`;
        }

        return `
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex flex-col items-center">
                        <div class="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-5xl mb-3">
                            ${currentUser.picture ? 
                                `<img src="${currentUser.picture}" alt="${currentUser.name}" class="w-full h-full rounded-full object-cover">` : 
                                `<span class="material-symbols-outlined text-5xl">support_agent</span>`
                            }
                        </div>
                        <h2 class="text-2xl font-bold">${escapeHtml(currentUser.name || 'Agent')}</h2>
                        <p class="text-slate-500">Agent since ${new Date().getFullYear()}</p>
                    </div>
                    
                    <div class="mt-6 space-y-4">
                        <div>
                            <label class="text-sm text-slate-500">Full name</label>
                            <input type="text" value="${escapeHtml(currentUser.name || '')}" 
                                class="w-full rounded-xl border-slate-200 bg-slate-50 p-3" readonly disabled>
                        </div>
                        <div>
                            <label class="text-sm text-slate-500">Email</label>
                            <input type="email" value="${escapeHtml(currentUser.email || '')}" 
                                class="w-full rounded-xl border-slate-200 bg-slate-50 p-3" readonly disabled>
                        </div>
                        <div>
                            <label class="text-sm text-slate-500">Role</label>
                            <p class="text-sm bg-slate-50 p-3 rounded-xl font-semibold text-primary">Agent</p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold mb-3">Account Statistics</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-slate-50 p-4 rounded-xl text-center">
                            <p class="text-2xl font-bold text-primary">${assignedErrands.length}</p>
                            <p class="text-xs text-slate-500">Active Errands</p>
                        </div>
                        <div class="bg-slate-50 p-4 rounded-xl text-center">
                            <p class="text-2xl font-bold text-primary">${completedErrands.length}</p>
                            <p class="text-xs text-slate-500">Completed</p>
                        </div>
                    </div>
                    
                    <button id="logoutBtn" class="mt-6 w-full border border-red-200 text-red-500 hover:bg-red-50 py-3 rounded-xl font-bold transition-colors">
                        Log out
                    </button>
                </div>
            </div>
        `;
    }

    // ==================== EVENT HANDLERS ====================

    async function handleAcceptErrand(errandId) {
        try {
            const errand = availableErrands.find(e => e.id === errandId);
            if (!errand) return;

            modalContent.innerHTML = `
                <div>
                    <p class="font-semibold text-lg">${escapeHtml(errand.title)}</p>
                    <div class="bg-slate-50 p-4 rounded-xl space-y-2 mt-2">
                        <p><span class="font-medium">Customer:</span> ${escapeHtml(errand.customer_name)}</p>
                        <p><span class="font-medium">Pickup:</span> ${escapeHtml(errand.pickup)}</p>
                        <p><span class="font-medium">Delivery:</span> ${escapeHtml(errand.delivery)}</p>
                        <p><span class="font-medium">Earnings:</span> <span class="text-primary font-bold">₦${errand.total_cost.toLocaleString()}</span></p>
                    </div>
                    <p class="text-amber-600 text-sm mt-3 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">warning</span>
                        By accepting, this errand will be removed from the available pool for other agents.
                    </p>
                    <div class="flex gap-2 mt-4">
                        <button id="confirmAcceptBtn" class="flex-1 bg-primary hover:bg-emerald-600 text-white py-3 rounded-xl font-bold">✅ Confirm Accept</button>
                        <button onclick="window.errandEaseUI?.closeModal()" class="flex-1 border border-slate-200 hover:bg-slate-50 py-3 rounded-xl font-medium">Cancel</button>
                    </div>
                </div>
            `;

            openModal();

            document.getElementById("confirmAcceptBtn")?.addEventListener("click", async () => {
                try {
                    closeModal();
                    showLoading();
                    
                    const result = await acceptErrand(errandId);
                    window.errandEaseUI.showToast('Errand accepted successfully!', 'success');
                    
                    await loadAllData();
                    setActiveTab('assigned');
                    
                } catch (error) {
                    window.errandEaseUI.showToast(error.message || 'Failed to accept errand', 'error');
                } finally {
                    hideLoading();
                }
            });

        } catch (error) {
            console.error('Error in accept flow:', error);
            window.errandEaseUI.showToast('Failed to process request', 'error');
        }
    }

    async function showErrandDetails(errandId) {
        try {
            showLoading();
            console.log('Fetching details for errand:', errandId);

            const errand = await fetchErrandDetails(errandId);
            console.log('Errand details received:', errand);

            if (!errand) {
                window.errandEaseUI.showToast('Could not load errand details - errand not found', 'error');
                return;
            }

            const statusColors = {
                'pending': 'text-amber-600',
                'accepted': 'text-blue-600',
                'in_progress': 'text-purple-600',
                'awaiting_confirmation': 'text-amber-600',
                'completed': 'text-emerald-600',
                'cancelled': 'text-slate-600'
            };

            let actionButtons = "";
            if (errand.status === 'accepted') {
                actionButtons = `
                    <button id="modalStartBtn" class="w-full bg-primary hover:bg-emerald-600 text-white py-3 rounded-xl font-bold mt-2">
                        🚀 Start Errand
                    </button>
                `;
            } else if (errand.status === 'in_progress') {
                actionButtons = `
                    <button id="modalCompleteBtn" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold mt-2">
                        ✅ Mark as Completed
                    </button>
                `;
            } else if (errand.status === 'awaiting_confirmation') {
                actionButtons = `
                    <p class="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg mt-2">
                        ⏳ Waiting for customer to confirm completion. You'll be notified once confirmed.
                    </p>
                `;
            }

            modalContent.innerHTML = `
                <div>
                    <p class="font-semibold text-lg">${escapeHtml(errand.title)}</p>
                    <div class="bg-slate-50 p-4 rounded-xl space-y-2 mt-2">
                        <p><span class="font-medium">Customer:</span> ${escapeHtml(errand.customer_name)}</p>
                        <p><span class="font-medium">Pickup:</span> ${escapeHtml(errand.pickup)}</p>
                        <p><span class="font-medium">Delivery:</span> ${escapeHtml(errand.delivery)}</p>
                        ${errand.preferred_time ? `<p><span class="font-medium">Preferred time:</span> ${new Date(errand.preferred_time).toLocaleString()}</p>` : ''}
                        <p><span class="font-medium">Description:</span> ${escapeHtml(errand.description) || '—'}</p>
                        <p><span class="font-medium">Budget:</span> ₦${errand.budget.toLocaleString()}</p>
                        <p><span class="font-medium">Service fee:</span> ₦${errand.service_fee.toLocaleString()}</p>
                        <p><span class="font-medium">Total cost:</span> <span class="text-primary font-bold">₦${errand.total_cost.toLocaleString()}</span></p>
                        <p><span class="font-medium">Status:</span> <span class="${statusColors[errand.status]}">${errand.status}</span></p>
                        <p><span class="font-medium">Requested:</span> ${new Date(errand.date_requested).toLocaleString()}</p>
                    </div>
                    ${actionButtons}
                </div>
            `;

            openModal();

            if (errand.status === 'accepted') {
                document.getElementById("modalStartBtn")?.addEventListener("click", async () => {
                    try {
                        closeModal();
                        showLoading();
                        
                        await startErrand(errandId);
                        window.errandEaseUI.showToast('Errand started!', 'success');
                        
                        await loadAllData();
                        setActiveTab('assigned');
                        
                    } catch (error) {
                        window.errandEaseUI.showToast(error.message || 'Failed to start errand', 'error');
                    } finally {
                        hideLoading();
                    }
                });
            } else if (errand.status === 'in_progress') {
                document.getElementById("modalCompleteBtn")?.addEventListener("click", async () => {
                    try {
                        closeModal();
                        showLoading();
                        
                        await completeErrand(errandId);
                        window.errandEaseUI.showToast('Errand marked as complete! Waiting for customer confirmation.', 'success');
                        
                        await loadAllData();
                        setActiveTab('assigned');
                        
                    } catch (error) {
                        window.errandEaseUI.showToast(error.message || 'Failed to complete errand', 'error');
                    } finally {
                        hideLoading();
                    }
                });
            }

        } catch (error) {
            console.error('Error loading errand details:', error);
            window.errandEaseUI.showToast('Could not load errand details: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            hideLoading();
        }
    }

    async function handleLogout() {
        window.errandEaseUI.showLogoutModal(async () => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            redirectToSignIn();
        });
    }

    // ==================== PAGE MANAGEMENT ====================

    async function loadAllData() {
        try {
            const [available, assigned, completed, earnings] = await Promise.all([
                fetchAvailableErrands(),
                fetchAssignedErrands(),
                fetchCompletedErrands(),
                fetchEarningsSummary()
            ]);
            
            availableErrands = available;
            assignedErrands = assigned;
            completedErrands = completed;
            earningsSummary = earnings;
            
            updateSidebarCounts();
            
        } catch (error) {
            console.error('Error loading data:', error);
            showError('Failed to load dashboard data');
        }
    }

    async function renderPage(tab) {
        showLoading();
        
        try {
            await loadAllData();
            
            let html = "";
            if (tab === "available") html = renderAvailableTab();
            else if (tab === "assigned") html = renderAssignedTab();
            else if (tab === "completed") html = renderCompletedTab();
            else if (tab === "earnings") html = renderEarningsTab();
            else if (tab === "profile") html = renderProfileTab();
            
            pageContainer.innerHTML = html;
            
            if (tab === "available") attachAvailableEvents();
            if (tab === "assigned") attachAssignedEvents();
            
        } catch (error) {
            console.error('Error rendering page:', error);
            showError('Failed to load page content');
        } finally {
            hideLoading();
        }
    }

    function attachAvailableEvents() {
        document.querySelectorAll(".accept-errand-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                handleAcceptErrand(id);
            });
        });
    }

    function attachAssignedEvents() {
        document.querySelectorAll(".view-details-agent").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                showErrandDetails(id);
            });
        });
    }

    // ==================== SIDEBAR FUNCTIONS ====================

    function closeSidebar() {
        sidebar.classList.add("-translate-x-full");
    }
    
    function openSidebar() {
        sidebar.classList.remove("-translate-x-full");
    }

    // ==================== TAB NAVIGATION ====================

    function handleNavClick(e, tabId) {
        e.preventDefault();
        if (window.innerWidth < 768) closeSidebar();
        setActiveTab(tabId);
    }

    async function setActiveTab(tabId) {
        currentTab = tabId;
        
        bottomNavItems.forEach((item) => {
            const tab = item.getAttribute("data-tab");
            if (tab === tabId) {
                item.classList.add("nav-active", "text-primary");
                item.querySelector(".material-symbols-outlined")?.classList.add("fill-1");
            } else {
                item.classList.remove("nav-active", "text-primary");
                item.querySelector(".material-symbols-outlined")?.classList.remove("fill-1");
            }
        });
        
        sidebarLinks.forEach((link) => {
            const tab = link.getAttribute("data-tab");
            if (tab === tabId) {
                link.classList.add("bg-primary/5", "text-primary", "font-semibold");
                link.classList.remove("text-slate-600");
            } else {
                link.classList.remove("bg-primary/5", "text-primary", "font-semibold");
                link.classList.add("text-slate-600");
            }
        });
        
        await renderPage(tabId);
    }

    // ==================== INITIALIZATION ====================

    async function initializeDashboard() {
        const token = localStorage.getItem('access_token');
        if (!token) {
            redirectToSignIn();
            return;
        }
        
        await fetchCurrentUser();
        if (!currentUser || currentUser.role !== 'agent') {
            redirectToSignIn();
            return;
        }
        
        try {
            const response = await makeAuthenticatedRequest('/api/agent/verification/status');
            if (response && response.ok) {
                const status = await response.json();
                console.log('Account status:', status);
                
                if (status.account_status === 'blocked' || status.is_blocked) {
                    const blockedUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-blocked.html'
                        : '/agent-blocked.html';
                    window.location.href = blockedUrl;
                    return;
                }
                
                if (status.verification_status === 'not_submitted') {
                    const verificationUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-verification.html'
                        : '/agent-verification.html';
                    window.location.href = verificationUrl;
                    return;
                } else if (status.verification_status === 'pending') {
                    renderPendingApproval();
                    
                    hamburgerBtn?.addEventListener("click", openSidebar);
                    closeSidebarBtn?.addEventListener("click", closeSidebar);
                    
                    bottomNavItems.forEach((item) =>
                        item.addEventListener("click", (e) => {
                            e.preventDefault();
                        })
                    );
                    
                    sidebarLinks.forEach((link) =>
                        link.addEventListener("click", (e) => {
                            e.preventDefault();
                        })
                    );
                    
                    document.addEventListener('click', (e) => {
                        if (e.target.id === 'logoutBtn') {
                            e.preventDefault();
                            handleLogout();
                        }
                    });
                    
                    return;
                } else if (status.verification_status === 'rejected') {
                    window.errandEaseUI.showToast('Your verification was rejected: ' + (status.rejection_reason || 'Please resubmit your documents'), 'error');
                    const verificationUrl = window.location.pathname.includes('/frontend/') 
                        ? '/frontend/agent-verification.html'
                        : '/agent-verification.html';
                    window.location.href = verificationUrl;
                    return;
                }
            } else {
                const verificationUrl = window.location.pathname.includes('/frontend/') 
                    ? '/frontend/agent-verification.html'
                    : '/agent-verification.html';
                window.location.href = verificationUrl;
                return;
            }
        } catch (error) {
            console.error('Error checking verification status:', error);
            showError('Failed to load verification status');
            return;
        }
        
        hamburgerBtn?.addEventListener("click", openSidebar);
        closeSidebarBtn?.addEventListener("click", closeSidebar);
        
        bottomNavItems.forEach((item) =>
            item.addEventListener("click", (e) =>
                handleNavClick(e, item.getAttribute("data-tab"))
            )
        );
        
        sidebarLinks.forEach((link) =>
            link.addEventListener("click", (e) =>
                handleNavClick(e, link.getAttribute("data-tab"))
            )
        );
        
        document.addEventListener('click', (e) => {
            if (e.target.id === 'logoutBtn') {
                e.preventDefault();
                handleLogout();
            }
        });
        
        refreshInterval = setInterval(async () => {
            if (currentTab === 'available') {
                await loadAllData();
                if (currentTab === 'available') {
                    renderPage('available');
                }
            }
        }, 30000);
        
        await setActiveTab("available");
    }

    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboard);
    } else {
        initializeDashboard();
    }

})();