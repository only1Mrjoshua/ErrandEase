// customer-dashboard.js - Production version with real API integration and completion verification
(function() {
    // Guard to prevent double initialization
    if (window.customerDashboardInitialized) {
        console.log('Customer dashboard already initialized, skipping...');
        return;
    }
    
    window.customerDashboardInitialized = true;
    console.log('Initializing customer dashboard with real API...');

    // State management
    let currentTab = "request";
    let currentUser = null;
    let ongoingErrands = [];
    let historyErrands = [];
    let isLoading = false;
    let refreshInterval = null;

    // DOM Elements
    const pageContainer = document.getElementById("pageContainer");
    const sidebar = document.getElementById("desktopSidebar");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const closeSidebarBtn = document.getElementById("closeSidebarBtn");
    const desktopToggleBtn = document.getElementById("desktopToggleBtn");
    const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
    const sidebarLinks = document.querySelectorAll(".sidebar-link");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalContent = document.getElementById("modalContent");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const profileIconLink = document.getElementById("profile-icon-link");
    const greetingContainer = document.getElementById("greeting-container");

    // ==================== AUTH & API HELPERS ====================

    async function makeAuthenticatedRequest(url, options = {}) {
        let token = localStorage.getItem('access_token');
        
        if (!token) {
            redirectToSignIn();
            return null;
        }

        const fullUrl = url.startsWith('http') ? url : `${window.BACKEND_URL}${url}`;

        // Set up default headers
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            let response = await fetch(fullUrl, { ...options, headers });

            // If token expired, try to refresh
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
                console.log('Token refreshed successfully');
                return data.access_token;
            } else {
                console.log('Refresh failed, clearing auth');
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
            const response = await makeAuthenticatedRequest(`${window.BACKEND_URL}/api/auth/me`);
            if (response && response.ok) {
                const userData = await response.json();
                currentUser = userData;
                localStorage.setItem('user', JSON.stringify(userData));
                return userData;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
        
        // Fallback to stored user
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
        const signInUrl = path.includes("/frontend/") ? "/frontend/sign-in.html" : "/sign-in.html";
        window.location.href = signInUrl;
    }

    // ==================== ERRAND API CALLS ====================

    async function fetchErrands(scope) {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/errands?scope=${scope}`
            );
            
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error(`Error fetching ${scope} errands:`, error);
            return [];
        }
    }

    async function fetchErrandDetails(errandId) {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/errands/${errandId}`
            );
            
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching errand details:', error);
            return null;
        }
    }

    async function createErrand(errandData) {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/errands`,
                {
                    method: 'POST',
                    body: JSON.stringify(errandData)
                }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create errand');
            }
        } catch (error) {
            console.error('Error creating errand:', error);
            throw error;
        }
    }

    async function cancelErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/errands/${errandId}/cancel`,
                {
                    method: 'PATCH'
                }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to cancel errand');
            }
        } catch (error) {
            console.error('Error cancelling errand:', error);
            throw error;
        }
    }

    // ==================== COMPLETION VERIFICATION API CALLS ====================

    async function fetchPendingConfirmations() {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/customer/errands/pending-confirmation`
            );
            
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching pending confirmations:', error);
            return [];
        }
    }

    async function submitCompletionConfirmation(errandId, confirmed, rejectionReason = null) {
        try {
            const response = await makeAuthenticatedRequest(
                `${window.BACKEND_URL}/api/customer/errands/${errandId}/confirm-completion`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        confirmed: confirmed,
                        rejection_reason: rejectionReason
                    })
                }
            );
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to process confirmation');
            }
        } catch (error) {
            console.error('Confirmation error:', error);
            throw error;
        }
    }

    // ==================== UI UPDATE FUNCTIONS ====================

    async function updateGreeting() {
        if (!currentUser) {
            currentUser = await fetchCurrentUser();
        }
        
        if (greetingContainer && currentUser) {
            const hour = new Date().getHours();
            let timeGreeting = 'Good afternoon';
            
            if (hour < 12) timeGreeting = 'Good morning';
            else if (hour < 17) timeGreeting = 'Good afternoon';
            else timeGreeting = 'Good evening';
            
            let username = currentUser.name || 'User';
            if (username.includes(' ')) {
                username = username.split(' ')[0];
            }
            
            greetingContainer.textContent = `👋 ${timeGreeting}, ${username}`;
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

    function showSuccess(message) {
        // Create temporary toast
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-fade-in-down';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // ==================== COMPLETION VERIFICATION UI ====================

    async function checkAndShowPendingConfirmations() {
        try {
            console.log('Checking for pending confirmations...');
            const pending = await fetchPendingConfirmations();
            console.log('Pending confirmations:', pending);
            
            if (pending && pending.length > 0) {
                // Show banner notification
                showPendingConfirmationsNotification(pending);
                
                // Automatically show the first pending errand modal
                // But only if not already showing one
                if (!document.getElementById('completionModal')) {
                    showCompletionModal(pending[0]);
                }
            }
        } catch (error) {
            console.error('Error checking pending confirmations:', error);
        }
    }

    function showPendingConfirmationsNotification(pendingErrands) {
        // Remove existing banner if any
        const existingBanner = document.getElementById('pendingConfirmationsBanner');
        if (existingBanner) existingBanner.remove();

        const banner = document.createElement('div');
        banner.id = 'pendingConfirmationsBanner';
        banner.className = 'bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 rounded-r-lg shadow-md animate-fade-in-down';
        
        const content = document.createElement('div');
        content.className = 'flex items-start justify-between';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'flex-1';
        
        const title = document.createElement('h3');
        title.className = 'text-sm font-medium text-amber-800';
        title.textContent = `${pendingErrands.length} errand${pendingErrands.length > 1 ? 's' : ''} waiting for your confirmation`;
        
        const desc = document.createElement('p');
        desc.className = 'text-xs text-amber-700 mt-1';
        desc.textContent = 'Please confirm if these errands have been completed correctly.';
        
        textDiv.appendChild(title);
        textDiv.appendChild(desc);
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'ml-4 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full transition-colors';
        viewBtn.textContent = 'View';
        viewBtn.onclick = () => {
            const modal = document.getElementById('completionModal');
            if (!modal) {
                showCompletionModal(pendingErrands[0]);
            }
        };
        
        content.appendChild(textDiv);
        content.appendChild(viewBtn);
        banner.appendChild(content);
        
        // Insert at top of page container
        if (pageContainer && pageContainer.firstChild) {
            pageContainer.insertBefore(banner, pageContainer.firstChild);
        } else if (pageContainer) {
            pageContainer.appendChild(banner);
        }
    }

    function showCompletionModal(errand) {
        // Remove any existing modal
        const existingModal = document.getElementById('completionModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'completionModal';
        modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-xl p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-secondary">Confirm Completion</h3>
                    <button onclick="this.closest('#completionModal').remove()" class="text-slate-400 hover:text-primary">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div class="space-y-4">
                    <p class="text-slate-700">
                        Has <span class="font-semibold">${escapeHtml(errand.assigned_agent_name || 'the agent')}</span> completed this errand?
                    </p>
                    
                    <div class="bg-slate-50 p-4 rounded-xl space-y-2">
                        <p><span class="font-medium">Errand:</span> ${escapeHtml(errand.title)}</p>
                        <p><span class="font-medium">Pickup:</span> ${escapeHtml(errand.pickup)}</p>
                        <p><span class="font-medium">Delivery:</span> ${escapeHtml(errand.delivery)}</p>
                        <p><span class="font-medium">Amount:</span> <span class="text-primary font-bold">₦${errand.total_cost.toLocaleString()}</span></p>
                    </div>
                    
                    <div class="flex flex-col gap-3">
                        <button id="confirmYesBtn" class="w-full bg-primary hover:bg-emerald-600 text-white py-3 rounded-xl font-bold">
                            ✅ Yes, errand is completed
                        </button>
                        
                        <button id="confirmNoBtn" class="w-full border border-red-200 text-red-500 hover:bg-red-50 py-3 rounded-xl font-medium transition-colors">
                            ❌ No, errand is not completed
                        </button>
                    </div>
                    
                    <div id="rejectionSection" class="hidden space-y-3 mt-2">
                        <label class="block text-sm font-medium text-slate-700">
                            Please explain what's incomplete or wrong:
                        </label>
                        <textarea 
                            id="rejectionReason" 
                            rows="3"
                            class="w-full rounded-xl border-slate-200 bg-slate-50 p-3 focus:ring-primary focus:border-primary"
                            placeholder="e.g., Items missing, wrong delivery location, etc."
                        ></textarea>
                        <button id="submitRejectionBtn" class="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold">
                            Submit Report & Block Agent
                        </button>
                        <p class="text-xs text-slate-400">
                            ⚠️ This will block the agent from further actions and flag them for review.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle Yes button
        document.getElementById('confirmYesBtn').addEventListener('click', async () => {
            await handleCompletionConfirmation(errand.id, true);
            modal.remove();
        });
        
        // Handle No button - show rejection section
        document.getElementById('confirmNoBtn').addEventListener('click', () => {
            document.getElementById('rejectionSection').classList.remove('hidden');
            document.getElementById('confirmYesBtn').disabled = true;
            document.getElementById('confirmNoBtn').disabled = true;
        });
        
        // Handle rejection submit
        document.getElementById('submitRejectionBtn').addEventListener('click', async () => {
            const reason = document.getElementById('rejectionReason').value.trim();
            if (!reason) {
                alert('Please provide a reason');
                return;
            }
            
            await handleCompletionConfirmation(errand.id, false, reason);
            modal.remove();
        });
    }

    async function handleCompletionConfirmation(errandId, confirmed, rejectionReason = null) {
        try {
            showLoading();
            
            const result = await submitCompletionConfirmation(errandId, confirmed, rejectionReason);
            
            if (confirmed) {
                showSuccess('Thank you for confirming! The errand is now marked as completed.');
            } else {
                showSuccess('Your report has been submitted. The agent has been blocked and our team will investigate.');
            }
            
            // Refresh errands data
            await loadErrands();
            
            // Remove banner if exists
            const banner = document.getElementById('pendingConfirmationsBanner');
            if (banner) banner.remove();
            
            // Check for more pending confirmations
            await checkAndShowPendingConfirmations();
            
            // Refresh current tab
            await renderPage(currentTab);
            
        } catch (error) {
            console.error('Confirmation error:', error);
            showError(error.message || 'Failed to process confirmation');
        } finally {
            hideLoading();
        }
    }

    // ==================== RENDER FUNCTIONS ====================

    function renderRequestTab() {
        const stats = {
            total: ongoingErrands.length + historyErrands.length,
            active: ongoingErrands.length,
            completed: historyErrands.length
        };

        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between">
                    <h1 class="text-2xl font-bold text-secondary">Request an errand</h1>
                    <span class="text-sm text-slate-500 bg-white px-4 py-2 rounded-full shadow-sm">📍 Lagos</span>
                </div>
                
                <!-- Stats Cards -->
                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex justify-between items-center">
                    <div><p class="text-slate-500 text-sm">Total errands</p><p class="text-2xl font-bold">${stats.total}</p></div>
                    <div class="w-px h-10 bg-slate-200"></div>
                    <div><p class="text-slate-500 text-sm">Active now</p><p class="text-2xl font-bold text-primary">${stats.active}</p></div>
                    <div class="w-px h-10 bg-slate-200"></div>
                    <div><p class="text-slate-500 text-sm">Completed</p><p class="text-2xl font-bold">${stats.completed}</p></div>
                </div>
                
                <!-- Request Form -->
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h2 class="font-bold text-lg mb-4">New errand request</h2>
                    <form id="errandForm" class="space-y-4">
                        <div>
                            <label class="text-sm font-medium text-slate-600">Title <span class="text-red-400">*</span></label>
                            <input type="text" id="title" required 
                                class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary" 
                                placeholder="e.g., Market shopping at Mile 12"
                                maxlength="100">
                        </div>
                        
                        <div>
                            <label class="text-sm font-medium text-slate-600">Description</label>
                            <textarea id="desc" rows="2" 
                                class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary" 
                                placeholder="Items, special instructions..."
                                maxlength="500"></textarea>
                            <p class="text-xs text-slate-400 mt-1">Max 500 characters</p>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-sm font-medium text-slate-600">Pickup location <span class="text-red-400">*</span></label>
                                <input type="text" id="pickup" required 
                                    class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50"
                                    placeholder="e.g., Mile 12 market"
                                    maxlength="200">
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-600">Delivery location <span class="text-red-400">*</span></label>
                                <input type="text" id="delivery" required 
                                    class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50"
                                    placeholder="e.g., Ikeja"
                                    maxlength="200">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-sm font-medium text-slate-600">Preferred time</label>
                                <input type="datetime-local" id="time" 
                                    class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50">
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-600">Budget (₦) <span class="text-red-400">*</span></label>
                                <input type="number" id="budget" required min="1000" max="1000000" value="3000"
                                    class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50">
                                <p class="text-xs text-slate-400 mt-1">Min ₦1,000 · Max ₦1,000,000</p>
                            </div>
                        </div>
                        
                        <!-- Cost Preview (informational only) -->
                        <div class="bg-slate-50 p-4 rounded-xl">
                            <div class="flex justify-between items-center text-sm text-slate-600">
                                <span>Budget</span>
                                <span id="budgetDisplay">₦3,000</span>
                            </div>
                            <div class="flex justify-between items-center text-sm text-slate-600 mt-1">
                                <span>Service fee (10% min ₦200)</span>
                                <span id="feeDisplay">₦300</span>
                            </div>
                            <div class="border-t border-slate-200 my-2"></div>
                            <div class="flex justify-between items-center font-bold">
                                <span>Total estimate</span>
                                <span class="text-primary text-xl" id="totalDisplay">₦3,300</span>
                            </div>
                            <p class="text-xs text-slate-400 mt-2">Final cost calculated on server</p>
                        </div>
                        
                        <button type="submit" 
                            class="w-full bg-primary hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            id="submitErrandBtn">
                            Request Errand
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    function renderOngoingTab() {
        if (ongoingErrands.length === 0) {
            return `
                <div class="h-[70vh] flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-6xl text-slate-300">pending_actions</span>
                    <p class="text-slate-400 text-lg font-medium mt-4">No ongoing errands yet</p>
                    <p class="text-sm text-slate-400">Your active errands will appear here.</p>
                    <button onclick="document.querySelector('[data-tab=\\'request\\']').click()" 
                        class="mt-4 px-6 py-2 bg-primary text-white rounded-xl hover:bg-emerald-600">
                        Request an errand
                    </button>
                </div>
            `;
        }
        
        let cards = "";
        ongoingErrands.forEach((e) => {
            const statusColors = {
                'pending': 'bg-amber-100 text-amber-700',
                'accepted': 'bg-blue-100 text-blue-700',
                'in_progress': 'bg-purple-100 text-purple-700',
                'awaiting_confirmation': 'bg-amber-100 text-amber-700 border-2 border-amber-300 animate-pulse'
            };
            
            const statusText = {
                'pending': 'Pending',
                'accepted': 'Accepted',
                'in_progress': 'In Progress',
                'awaiting_confirmation': '⚠️ Awaiting Your Confirmation'
            };
            
            const statusClass = statusColors[e.status] || 'bg-slate-100 text-slate-700';
            
            // Add highlight for awaiting confirmation
            const awaitingHighlight = e.status === 'awaiting_confirmation' ? 'ring-2 ring-amber-300 ring-opacity-50 bg-amber-50/30' : '';
            
            cards += `
                <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm card-hover ${awaitingHighlight}" data-id="${e.id}">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-lg">${escapeHtml(e.title)}</h3>
                        <span class="${statusClass} text-xs px-3 py-1 rounded-full font-semibold">${statusText[e.status] || e.status}</span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1">
                        👤 ${escapeHtml(e.assigned_agent_name || 'Unassigned')}
                    </p>
                    <div class="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                        <span>💰 ₦${e.total_cost.toLocaleString()}</span>
                        <span>📍 ${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}</span>
                        <span>📅 ${new Date(e.date_requested).toLocaleDateString()}</span>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button class="view-details-btn flex-1 bg-slate-100 hover:bg-primary hover:text-white py-3 rounded-xl font-medium text-sm transition-colors" 
                                data-id="${e.id}">
                            View Details
                        </button>
                        ${e.status === 'pending' ? `
                            <button class="cancel-errand-btn px-4 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                    data-id="${e.id}"
                                    title="Cancel errand">
                                <span class="material-symbols-outlined text-xl">close</span>
                            </button>
                        ` : ''}
                        ${e.status === 'awaiting_confirmation' ? `
                            <button class="confirm-errand-btn px-4 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl transition-colors font-medium text-sm"
                                    data-id="${e.id}"
                                    title="Confirm completion">
                                Confirm
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        return `
            <div class="space-y-4">
                <h2 class="text-xl font-bold text-secondary">Ongoing errands (${ongoingErrands.length})</h2>
                ${cards}
            </div>
        `;
    }

    function renderHistoryTab() {
        if (historyErrands.length === 0) {
            return `
                <div class="h-[70vh] flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-6xl text-slate-300">history</span>
                    <p class="text-slate-400 text-lg font-medium mt-4">No completed errands yet</p>
                </div>
            `;
        }
        
        let cards = "";
        historyErrands.forEach((e) => {
            const statusColors = {
                'completed': 'bg-emerald-100 text-emerald-700',
                'cancelled': 'bg-slate-100 text-slate-600'
            };
            
            cards += `
                <div class="bg-white/70 rounded-xl p-5 border border-slate-100 shadow-sm ${e.status === 'completed' ? '' : 'opacity-70'}">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-slate-700">${escapeHtml(e.title)}</h3>
                        <span class="${statusColors[e.status]} text-xs px-3 py-1 rounded-full">
                            ${e.status === 'completed' ? 'Completed' : 'Cancelled'}
                        </span>
                    </div>
                    <p class="text-sm text-slate-500 mt-1">
                        👤 ${escapeHtml(e.assigned_agent_name || 'N/A')}
                    </p>
                    <div class="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                        <span>💰 ₦${e.total_cost.toLocaleString()}</span>
                        <span>📍 ${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}</span>
                        ${e.date_completed ? `<span>✅ ${new Date(e.date_completed).toLocaleDateString()}</span>` : ''}
                    </div>
                    <button class="view-details-btn mt-4 w-full bg-slate-100 hover:bg-primary hover:text-white py-3 rounded-xl font-medium text-sm transition-colors"
                            data-id="${e.id}">
                        View Details
                    </button>
                </div>
            `;
        });
        
        const totalSpent = historyErrands
            .filter(e => e.status === 'completed')
            .reduce((sum, e) => sum + e.total_cost, 0);
        
        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold">Errand history</h2>
                    <div class="bg-white px-4 py-2 rounded-full shadow-sm text-primary font-bold">
                        Total spent: ₦${totalSpent.toLocaleString()}
                    </div>
                </div>
                ${cards}
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
                                `<span class="material-symbols-outlined text-5xl">account_circle</span>`
                            }
                        </div>
                        <h2 class="text-2xl font-bold">${escapeHtml(currentUser.name || 'User')}</h2>
                        <p class="text-slate-500">Customer since ${new Date().getFullYear()}</p>
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
                            <label class="text-sm text-slate-500">Member since</label>
                            <p class="text-sm bg-slate-50 p-3 rounded-xl">
                                ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold mb-3">Account Statistics</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-slate-50 p-4 rounded-xl text-center">
                            <p class="text-2xl font-bold text-primary">${ongoingErrands.length + historyErrands.length}</p>
                            <p class="text-xs text-slate-500">Total Errands</p>
                        </div>
                        <div class="bg-slate-50 p-4 rounded-xl text-center">
                            <p class="text-2xl font-bold text-primary">${historyErrands.filter(e => e.status === 'completed').length}</p>
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

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==================== EVENT HANDLERS ====================

    async function handleFormSubmit(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitErrandBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
        }
        
        try {
            const formData = {
                title: document.getElementById('title').value.trim(),
                description: document.getElementById('desc').value.trim(),
                pickup: document.getElementById('pickup').value.trim(),
                delivery: document.getElementById('delivery').value.trim(),
                preferred_time: document.getElementById('time').value || null,
                budget: parseInt(document.getElementById('budget').value)
            };
            
            const newErrand = await createErrand(formData);
            
            // Reset form
            document.getElementById('errandForm').reset();
            document.getElementById('budget').value = '3000';
            updateCostPreview();
            
            showSuccess('✅ Errand requested successfully!');
            
            // Refresh ongoing errands and switch tab
            await loadErrands();
            setActiveTab('ongoing');
            
        } catch (error) {
            alert(error.message || 'Failed to create errand. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Request Errand';
            }
        }
    }

    function updateCostPreview() {
        const budget = parseInt(document.getElementById('budget')?.value) || 3000;
        const fee = Math.max(200, Math.round(budget * 0.1));
        const total = budget + fee;
        
        document.getElementById('budgetDisplay').textContent = `₦${budget.toLocaleString()}`;
        document.getElementById('feeDisplay').textContent = `₦${fee.toLocaleString()}`;
        document.getElementById('totalDisplay').textContent = `₦${total.toLocaleString()}`;
    }

    async function showErrandDetails(errandId) {
        const errand = await fetchErrandDetails(errandId);
        if (!errand) {
            alert('Could not load errand details');
            return;
        }
        
        const statusColors = {
            'pending': 'text-amber-600',
            'accepted': 'text-blue-600',
            'in_progress': 'text-purple-600',
            'awaiting_confirmation': 'text-amber-600 font-bold',
            'completed': 'text-emerald-600',
            'cancelled': 'text-slate-600'
        };
        
        const statusText = errand.status === 'awaiting_confirmation' 
            ? 'Awaiting Your Confirmation - Please verify if this errand is completed'
            : errand.status;
        
        modalContent.innerHTML = `
            <div class="space-y-3">
                <p><span class="font-semibold">Title:</span> ${escapeHtml(errand.title)}</p>
                <p><span class="font-semibold">Description:</span> ${escapeHtml(errand.description) || '—'}</p>
                <p><span class="font-semibold">Pickup:</span> ${escapeHtml(errand.pickup)}</p>
                <p><span class="font-semibold">Delivery:</span> ${escapeHtml(errand.delivery)}</p>
                ${errand.preferred_time ? `<p><span class="font-semibold">Preferred time:</span> ${new Date(errand.preferred_time).toLocaleString()}</p>` : ''}
                <p><span class="font-semibold">Budget:</span> ₦${errand.budget.toLocaleString()}</p>
                <p><span class="font-semibold">Service fee:</span> ₦${errand.service_fee.toLocaleString()}</p>
                <p><span class="font-semibold">Total cost:</span> ₦${errand.total_cost.toLocaleString()}</p>
                <p><span class="font-semibold">Status:</span> <span class="${statusColors[errand.status]}">${statusText}</span></p>
                <p><span class="font-semibold">Requested:</span> ${new Date(errand.date_requested).toLocaleString()}</p>
                ${errand.date_completed ? `<p><span class="font-semibold">Completed:</span> ${new Date(errand.date_completed).toLocaleString()}</p>` : ''}
                ${errand.assigned_agent_name ? `<p><span class="font-semibold">Assigned Agent:</span> ${escapeHtml(errand.assigned_agent_name)}</p>` : ''}
                ${errand.status === 'awaiting_confirmation' ? `
                    <div class="mt-4 flex gap-2">
                        <button id="modalConfirmYesBtn" class="flex-1 bg-primary hover:bg-emerald-600 text-white py-2 rounded-lg font-medium">✅ Yes, Completed</button>
                        <button id="modalConfirmNoBtn" class="flex-1 border border-red-200 text-red-500 hover:bg-red-50 py-2 rounded-lg font-medium">❌ No, Report Issue</button>
                    </div>
                ` : ''}
            </div>
        `;
        
        modalOverlay.classList.remove("hidden");
        modalOverlay.classList.add("flex");
        
        // Handle modal confirmation buttons
        if (errand.status === 'awaiting_confirmation') {
            document.getElementById('modalConfirmYesBtn')?.addEventListener('click', async () => {
                closeModal();
                await handleCompletionConfirmation(errand.id, true);
            });
            
            document.getElementById('modalConfirmNoBtn')?.addEventListener('click', async () => {
                closeModal();
                // Show full confirmation modal
                showCompletionModal(errand);
            });
        }
    }

    async function handleCancelErrand(errandId) {
        if (!confirm('Are you sure you want to cancel this errand? This action cannot be undone.')) {
            return;
        }
        
        try {
            await cancelErrand(errandId);
            showSuccess('Errand cancelled successfully');
            await loadErrands();
            
            // Refresh current tab
            if (currentTab === 'ongoing') {
                await renderPage('ongoing');
                attachOngoingEvents();
            }
        } catch (error) {
            alert(error.message || 'Failed to cancel errand');
        }
    }

    // ==================== PAGE MANAGEMENT ====================

    async function loadErrands() {
        try {
            const [ongoing, history] = await Promise.all([
                fetchErrands('ongoing'),
                fetchErrands('history')
            ]);
            
            ongoingErrands = ongoing;
            historyErrands = history;
            
            // Log for debugging
            const awaitingConfirmation = ongoing.filter(e => e.status === 'awaiting_confirmation');
            if (awaitingConfirmation.length > 0) {
                console.log('Found errands awaiting confirmation:', awaitingConfirmation);
            }
        } catch (error) {
            console.error('Error loading errands:', error);
            showError('Failed to load errands. Please refresh the page.');
        }
    }

    async function renderPage(tab) {
        showLoading();
        
        try {
            // Load fresh data
            await loadErrands();
            
            let html = "";
            if (tab === "request") html = renderRequestTab();
            else if (tab === "ongoing") html = renderOngoingTab();
            else if (tab === "history") html = renderHistoryTab();
            else if (tab === "profile") html = renderProfileTab();
            
            pageContainer.innerHTML = html;
            
            // Attach events based on tab
            if (tab === "request") attachRequestEvents();
            if (tab === "ongoing") attachOngoingEvents();
            if (tab === "history") attachHistoryEvents();
            
        } catch (error) {
            console.error('Error rendering page:', error);
            showError('Failed to load page content');
        } finally {
            hideLoading();
        }
    }

    function attachRequestEvents() {
        const budgetInput = document.getElementById("budget");
        if (budgetInput) {
            budgetInput.addEventListener("input", updateCostPreview);
            updateCostPreview();
        }
        
        document.getElementById("errandForm")?.addEventListener("submit", handleFormSubmit);
    }

    function attachOngoingEvents() {
        document.querySelectorAll(".view-details-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                showErrandDetails(id);
            });
        });
        
        document.querySelectorAll(".cancel-errand-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                handleCancelErrand(id);
            });
        });
        
        document.querySelectorAll(".confirm-errand-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                const errand = ongoingErrands.find(e => e.id === id);
                if (errand) {
                    showCompletionModal(errand);
                }
            });
        });
    }

    function attachHistoryEvents() {
        document.querySelectorAll(".view-details-btn").forEach((btn) => {
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
        
        // Update bottom nav active styles
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
        
        // Update sidebar links active
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
        
        // Check for pending confirmations when switching to ongoing tab
        if (tabId === 'ongoing') {
            await checkAndShowPendingConfirmations();
        }
    }

    // ==================== MODAL FUNCTIONS ====================

    function closeModal() {
        modalOverlay.classList.add("hidden");
        modalOverlay.classList.remove("flex");
    }

    // ==================== LOGOUT FUNCTIONS ====================

    async function callBackendLogout() {
        const refreshToken = localStorage.getItem('refresh_token');
        
        if (refreshToken) {
            try {
                await fetch(`${window.BACKEND_URL}/api/auth/logout?refresh_token=${refreshToken}`, {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                console.warn('Logout API call failed:', e);
            }
        }
    }

    function ensureLogoutModal() {
        let overlay = document.getElementById("logoutModalOverlay");
        if (overlay) return overlay;
    
        overlay = document.createElement("div");
        overlay.id = "logoutModalOverlay";
        overlay.className = "fixed inset-0 z-[200] hidden items-center justify-center p-4";
        
        const backdrop = document.createElement("div");
        backdrop.className = "absolute inset-0 bg-black/40 backdrop-blur-[2px]";
        
        const card = document.createElement("div");
        card.className = "relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden";
        
        const cardContent = document.createElement("div");
        cardContent.className = "p-5";
        
        const flexDiv = document.createElement("div");
        flexDiv.className = "flex items-start gap-3";
        
        const iconDiv = document.createElement("div");
        iconDiv.className = "w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600";
        
        const iconSpan = document.createElement("span");
        iconSpan.className = "material-symbols-outlined";
        iconSpan.textContent = "logout";
        iconDiv.appendChild(iconSpan);
        
        const textDiv = document.createElement("div");
        textDiv.className = "flex-1";
        
        const title = document.createElement("h3");
        title.className = "text-lg font-bold text-slate-900";
        title.textContent = "Log out?";
        
        const desc = document.createElement("p");
        desc.className = "text-sm text-slate-600 mt-1";
        desc.textContent = "This will clear your session on this device.";
        
        textDiv.appendChild(title);
        textDiv.appendChild(desc);
        
        flexDiv.appendChild(iconDiv);
        flexDiv.appendChild(textDiv);
        
        const buttonsDiv = document.createElement("div");
        buttonsDiv.className = "mt-5 flex gap-3";
        
        const cancelBtn = document.createElement("button");
        cancelBtn.id = "logoutCancelBtn";
        cancelBtn.className = "flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50";
        cancelBtn.textContent = "Cancel";
        
        const confirmBtn = document.createElement("button");
        confirmBtn.id = "logoutConfirmBtn";
        confirmBtn.className = "flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700";
        confirmBtn.textContent = "Log out";
        
        buttonsDiv.appendChild(cancelBtn);
        buttonsDiv.appendChild(confirmBtn);
        
        cardContent.appendChild(flexDiv);
        cardContent.appendChild(buttonsDiv);
        card.appendChild(cardContent);
        overlay.appendChild(backdrop);
        overlay.appendChild(card);
    
        document.body.appendChild(overlay);
    
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay || e.target === backdrop) {
                hideLogoutModal();
            }
        });
    
        cancelBtn.addEventListener("click", hideLogoutModal);
        confirmBtn.addEventListener("click", performLogout);
    
        return overlay;
    }
    
    function showLogoutModal() {
        const overlay = ensureLogoutModal();
        overlay.classList.remove("hidden");
        overlay.classList.add("flex");
    }
    
    function hideLogoutModal() {
        const overlay = document.getElementById("logoutModalOverlay");
        if (!overlay) return;
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
    }
    
    async function performLogout() {
        const overlay = document.getElementById("logoutModalOverlay");
        const confirmBtn = overlay?.querySelector("#logoutConfirmBtn");
        const cancelBtn = overlay?.querySelector("#logoutCancelBtn");
    
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Logging out...";
            confirmBtn.classList.add("opacity-80");
        }
        if (cancelBtn) cancelBtn.disabled = true;
    
        await callBackendLogout();
        clearAuth();
        window.location.href = getSignInUrl();
    }
    
    function getSignInUrl() {
        const p = window.location.pathname || "";
        return p.includes("/frontend/") ? "/frontend/sign-in.html" : "/sign-in.html";
    }
    
    function injectLogoutButtonIntoSidebar() {
        const sidebar = document.getElementById("desktopSidebar");
        if (!sidebar) return;
        if (document.getElementById("sidebarLogoutWrap")) return;
    
        const footer = sidebar.querySelector(".p-4.border-t.border-slate-100.text-xs");
        const wrap = document.createElement("div");
        wrap.id = "sidebarLogoutWrap";
        wrap.className = "p-4 border-t border-slate-100";
    
        const button = document.createElement("button");
        button.id = "sidebarLogoutBtn";
        button.className = "w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors";
        
        const iconSpan = document.createElement("span");
        iconSpan.className = "material-symbols-outlined";
        iconSpan.textContent = "logout";
        
        const textSpan = document.createElement("span");
        textSpan.textContent = "Log out";
        
        button.appendChild(iconSpan);
        button.appendChild(textSpan);
        wrap.appendChild(button);
    
        if (footer && footer.parentElement) {
            footer.parentElement.insertBefore(wrap, footer);
        } else {
            sidebar.appendChild(wrap);
        }
    
        button.addEventListener("click", (e) => {
            e.preventDefault();
            showLogoutModal();
        });
    }

    // ==================== INITIALIZATION ====================

    async function initializeDashboard() {
        // Check authentication first
        const token = localStorage.getItem('access_token');
        if (!token) {
            redirectToSignIn();
            return;
        }
        
        // Load user data
        await fetchCurrentUser();
        await updateGreeting();
        
        // Set up event listeners
        hamburgerBtn.addEventListener("click", openSidebar);
        closeSidebarBtn.addEventListener("click", closeSidebar);
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener("click", closeModal);
        }
        
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        
        // Desktop toggle
        let sidebarVisible = true;
        desktopToggleBtn.addEventListener("click", () => {
            if (sidebarVisible) {
                sidebar.classList.add("-translate-x-full");
                desktopToggleBtn.innerHTML = '<span class="material-symbols-outlined">menu</span>';
            } else {
                sidebar.classList.remove("-translate-x-full");
                desktopToggleBtn.innerHTML = '<span class="material-symbols-outlined">menu_open</span>';
            }
            sidebarVisible = !sidebarVisible;
        });

        // Nav listeners
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

        // Profile icon click
        if (profileIconLink) {
            profileIconLink.addEventListener("click", (e) => {
                e.preventDefault();
                setActiveTab("profile");
                if (window.innerWidth < 768) closeSidebar();
            });
        }

        // Logout button in profile tab (delegation)
        document.addEventListener('click', (e) => {
            if (e.target.id === 'logoutBtn') {
                e.preventDefault();
                showLogoutModal();
            }
        });

        injectLogoutButtonIntoSidebar();

        // Load errands first
        await loadErrands();
        
        // CRITICAL: Check for pending confirmations immediately and show modal
        await checkAndShowPendingConfirmations();

        // Initial tab
        await setActiveTab("request");
        
        // Set up periodic check for pending confirmations (every 15 seconds)
        refreshInterval = setInterval(async () => {
            if (currentTab === 'ongoing' || currentTab === 'request') {
                await checkAndShowPendingConfirmations();
            }
        }, 15000);
    }

    // Clean up interval on page unload
    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    // Start everything
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboard);
    } else {
        initializeDashboard();
    }

})();