// admin-dashboard.js - Complete admin dashboard with unified UI feedback system

(function() {
    // Guard to prevent double initialization
    if (window.adminDashboardInitialized) {
        console.log('Admin dashboard already initialized, skipping...');
        return;
    }
    
    window.adminDashboardInitialized = true;
    console.log('Initializing admin dashboard...');

    // ==================== STATE MANAGEMENT ====================
    
    let currentTab = "overview";
    let currentUser = null;
    let isLoading = false;
    let refreshInterval = null;
    
    // Data states
    let stats = null;
    let customers = [];
    let agents = [];
    let errands = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    let itemsPerPage = 20;
    let searchQuery = "";
    let currentFilters = {};
    
    // Selected items for detail views
    let selectedCustomer = null;
    let selectedAgent = null;
    let selectedErrand = null;

    // ==================== DOM ELEMENTS ====================
    
    const pageContainer = document.getElementById("pageContainer");
    const sidebar = document.getElementById("desktopSidebar");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const closeSidebarBtn = document.getElementById("closeSidebarBtn");
    const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
    const sidebarLinks = document.querySelectorAll(".sidebar-link");
    const logoutBtn = document.getElementById("logoutBtn");
    const adminName = document.getElementById("adminName");
    const adminEmail = document.getElementById("adminEmail");
    const greeting = document.getElementById("greeting");
    
    // Count badges
    const customersCountEl = document.getElementById("customersCount");
    const agentsCountEl = document.getElementById("agentsCount");
    const errandsCountEl = document.getElementById("errandsCount");

    // ==================== AUTH & API HELPERS ====================

    async function makeAuthenticatedRequest(url, options = {}) {
        let token = localStorage.getItem('access_token');
        
        if (!token) {
            redirectToLogin();
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
                    redirectToLogin();
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
            redirectToLogin();
            return null;
        }

        try {
            const response = await makeAuthenticatedRequest('/api/auth/me');
            if (response && response.ok) {
                const userData = await response.json();
                
                // Verify user is admin
                if (userData.role !== 'admin') {
                    console.error('User is not an admin:', userData.role);
                    redirectToLogin();
                    return null;
                }
                
                currentUser = userData;
                localStorage.setItem('user', JSON.stringify(userData));
                
                // Update UI
                if (adminName) adminName.textContent = userData.name || 'Admin';
                if (adminEmail) adminEmail.textContent = userData.email || '';
                updateGreeting();
                
                return userData;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
        
        // Fallback to stored user
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                if (userData.role === 'admin') {
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
        if (greeting && currentUser) {
            const hour = new Date().getHours();
            let timeGreeting = 'Good afternoon';
            
            if (hour < 12) timeGreeting = 'Good morning';
            else if (hour < 17) timeGreeting = 'Good afternoon';
            else timeGreeting = 'Good evening';
            
            let firstName = currentUser.name || 'Admin';
            if (firstName.includes(' ')) {
                firstName = firstName.split(' ')[0];
            }
            
            greeting.textContent = `👋 ${timeGreeting}, ${firstName}`;
        }
    }

    function clearAuth() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        currentUser = null;
    }

    function redirectToLogin() {
        const path = window.location.pathname;
        const loginUrl = path.includes("/frontend/") 
            ? "/frontend/admin-login.html" 
            : "/admin-login.html";
        window.location.href = loginUrl;
    }

    // ==================== UNIFIED UI HELPERS ====================

    function showToast(message, type = 'info', duration = 5000) {
        if (window.errandEaseUI && window.errandEaseUI.showToast) {
            return window.errandEaseUI.showToast(message, type, { duration });
        }
        
        // Fallback if ui-feedback.js not loaded
        console.log(`Toast [${type}]: ${message}`);
    }

    function showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');
        if (overlay) {
            if (messageEl) messageEl.textContent = message;
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }
    }

    function hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    }

    function showConfirmModal(options = {}) {
        if (window.errandEaseUI && window.errandEaseUI.showConfirm) {
            return window.errandEaseUI.showConfirm({
                title: options.title || 'Confirm Action',
                message: options.message || 'Are you sure you want to perform this action?',
                confirmText: options.confirmText || 'Confirm',
                cancelText: options.cancelText || 'Cancel',
                onConfirm: options.onConfirm,
                onCancel: options.onCancel,
                destructive: options.destructive || false
            });
        }
        
        // Fallback
        if (confirm(options.message || 'Are you sure?')) {
            if (options.onConfirm) options.onConfirm();
        } else {
            if (options.onCancel) options.onCancel();
        }
    }

    function showDestructiveConfirm(options = {}) {
        return showConfirmModal({
            ...options,
            destructive: true,
            confirmText: options.confirmText || 'Delete'
        });
    }

    function showAlert(options = {}) {
        if (window.errandEaseUI && window.errandEaseUI.showAlert) {
            return window.errandEaseUI.showAlert({
                title: options.title || 'Notice',
                message: options.message,
                type: options.type || 'info',
                buttonText: options.buttonText || 'OK',
                onClose: options.onClose
            });
        }
        
        // Fallback
        alert(options.message);
        if (options.onClose) options.onClose();
    }

    // ==================== API CALLS ====================

    async function fetchDashboardStats() {
        try {
            const response = await makeAuthenticatedRequest('/api/admin/dashboard/stats');
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching stats:', error);
            return null;
        }
    }

    async function fetchCustomers(page = 1, search = '') {
        try {
            let url = `/api/admin/customers?page=${page}&limit=${itemsPerPage}`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }
            
            const response = await makeAuthenticatedRequest(url);
            if (response && response.ok) {
                const data = await response.json();
                customers = data.customers || [];
                totalItems = data.total || 0;
                totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
                currentPage = data.page || page;
                
                // Update badge
                if (customersCountEl) customersCountEl.textContent = totalItems;
                
                return data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching customers:', error);
            return null;
        }
    }

    async function fetchAgents(page = 1, filters = {}) {
        try {
            let url = `/api/admin/agents?page=${page}&limit=${itemsPerPage}`;
            if (filters.search) {
                url += `&search=${encodeURIComponent(filters.search)}`;
            }
            if (filters.verification_status) {
                url += `&verification_status=${filters.verification_status}`;
            }
            if (filters.account_status) {
                url += `&account_status=${filters.account_status}`;
            }
            
            const response = await makeAuthenticatedRequest(url);
            if (response && response.ok) {
                const data = await response.json();
                agents = data.agents || [];
                totalItems = data.total || 0;
                totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
                currentPage = data.page || page;
                
                // Update badge
                if (agentsCountEl) agentsCountEl.textContent = totalItems;
                
                return data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching agents:', error);
            return null;
        }
    }

    async function fetchErrands(page = 1, filters = {}) {
        try {
            let url = `/api/admin/errands?page=${page}&limit=${itemsPerPage}`;
            if (filters.status) {
                url += `&status=${filters.status}`;
            }
            if (filters.customer_id) {
                url += `&customer_id=${filters.customer_id}`;
            }
            if (filters.agent_id) {
                url += `&agent_id=${filters.agent_id}`;
            }
            if (filters.search) {
                url += `&search=${encodeURIComponent(filters.search)}`;
            }
            
            const response = await makeAuthenticatedRequest(url);
            if (response && response.ok) {
                const data = await response.json();
                errands = data.errands || [];
                totalItems = data.total || 0;
                totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
                currentPage = data.page || page;
                
                // Update badge
                if (errandsCountEl) errandsCountEl.textContent = totalItems;
                
                return data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching errands:', error);
            return null;
        }
    }

    async function fetchCustomerDetails(customerId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/customers/${customerId}`);
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching customer details:', error);
            return null;
        }
    }

    async function fetchCustomerErrands(customerId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/customers/${customerId}/errands`);
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching customer errands:', error);
            return [];
        }
    }

    async function fetchAgentDetails(agentId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/agents/${agentId}`);
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching agent details:', error);
            return null;
        }
    }

    async function fetchAgentErrands(agentId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/agents/${agentId}/errands`);
            if (response && response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            console.error('Error fetching agent errands:', error);
            return [];
        }
    }

    async function fetchErrandDetails(errandId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/errands/${errandId}`);
            if (response && response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error fetching errand details:', error);
            return null;
        }
    }

    async function createCustomer(customerData) {
        try {
            const response = await makeAuthenticatedRequest('/api/admin/customers', {
                method: 'POST',
                body: JSON.stringify(customerData)
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create customer');
            }
        } catch (error) {
            console.error('Error creating customer:', error);
            throw error;
        }
    }

    async function updateCustomer(customerId, updateData) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/customers/${customerId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to update customer');
            }
        } catch (error) {
            console.error('Error updating customer:', error);
            throw error;
        }
    }

    async function deleteCustomer(customerId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/customers/${customerId}`, {
                method: 'DELETE'
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete customer');
            }
        } catch (error) {
            console.error('Error deleting customer:', error);
            throw error;
        }
    }

    async function createAgent(agentData) {
        try {
            const response = await makeAuthenticatedRequest('/api/admin/agents', {
                method: 'POST',
                body: JSON.stringify(agentData)
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create agent');
            }
        } catch (error) {
            console.error('Error creating agent:', error);
            throw error;
        }
    }

    async function updateAgent(agentId, updateData) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/agents/${agentId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to update agent');
            }
        } catch (error) {
            console.error('Error updating agent:', error);
            throw error;
        }
    }

    async function deleteAgent(agentId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/agents/${agentId}`, {
                method: 'DELETE'
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete agent');
            }
        } catch (error) {
            console.error('Error deleting agent:', error);
            throw error;
        }
    }

    async function assignErrand(errandId, agentId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/errands/${errandId}/assign`, {
                method: 'PUT',
                body: JSON.stringify({ agent_id: agentId })
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to assign errand');
            }
        } catch (error) {
            console.error('Error assigning errand:', error);
            throw error;
        }
    }

    async function reassignErrand(errandId, agentId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/errands/${errandId}/reassign`, {
                method: 'PUT',
                body: JSON.stringify({ agent_id: agentId })
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to reassign errand');
            }
        } catch (error) {
            console.error('Error reassigning errand:', error);
            throw error;
        }
    }

    async function unassignErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/errands/${errandId}/unassign`, {
                method: 'PUT'
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to unassign errand');
            }
        } catch (error) {
            console.error('Error unassigning errand:', error);
            throw error;
        }
    }

    async function deleteErrand(errandId) {
        try {
            const response = await makeAuthenticatedRequest(`/api/admin/errands/${errandId}`, {
                method: 'DELETE'
            });
            
            if (response && response.ok) {
                return await response.json();
            } else if (response) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete errand');
            }
        } catch (error) {
            console.error('Error deleting errand:', error);
            throw error;
        }
    }

    // ==================== RENDER FUNCTIONS ====================

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return '₦0';
        return `₦${Number(amount).toLocaleString()}`;
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    }

    function renderOverviewTab() {
        if (!stats) {
            return `<div class="text-center py-8 text-slate-400">No statistics available</div>`;
        }

        return `
            <div class="space-y-6">
                <h1 class="text-2xl font-bold text-secondary">Dashboard Overview</h1>
                
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100 stat-card">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-slate-500">Total Customers</span>
                            <span class="material-symbols-outlined text-primary">people</span>
                        </div>
                        <p class="text-3xl font-bold text-secondary">${stats.total_customers || 0}</p>
                        <p class="text-xs text-slate-400 mt-2">Active users: ${stats.total_active_users || 0}</p>
                    </div>
                    
                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100 stat-card">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-slate-500">Total Agents</span>
                            <span class="material-symbols-outlined text-primary">support_agent</span>
                        </div>
                        <p class="text-3xl font-bold text-secondary">${stats.total_agents || 0}</p>
                        <p class="text-xs text-slate-400 mt-2">Blocked: ${stats.blocked_agents || 0} | Pending: ${stats.pending_verification_agents || 0}</p>
                    </div>
                    
                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100 stat-card">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-slate-500">Total Errands</span>
                            <span class="material-symbols-outlined text-primary">local_mall</span>
                        </div>
                        <p class="text-3xl font-bold text-secondary">${stats.total_errands || 0}</p>
                        <p class="text-xs text-slate-400 mt-2">All time</p>
                    </div>
                    
                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100 stat-card">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-slate-500">Active Errands</span>
                            <span class="material-symbols-outlined text-primary">pending_actions</span>
                        </div>
                        <p class="text-3xl font-bold text-secondary">${(stats.pending_errands || 0) + (stats.accepted_errands || 0) + (stats.in_progress_errands || 0)}</p>
                        <p class="text-xs text-slate-400 mt-2">Pending: ${stats.pending_errands || 0} | In Progress: ${stats.in_progress_errands || 0}</p>
                    </div>
                </div>

                <!-- Status Breakdown -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
                        <h2 class="text-lg font-bold text-secondary mb-4">Errand Status</h2>
                        <div class="space-y-3">
                            ${renderStatusBar('Pending', stats.pending_errands || 0, stats.total_errands || 1, 'bg-amber-500')}
                            ${renderStatusBar('Accepted', stats.accepted_errands || 0, stats.total_errands || 1, 'bg-blue-500')}
                            ${renderStatusBar('In Progress', stats.in_progress_errands || 0, stats.total_errands || 1, 'bg-purple-500')}
                            ${renderStatusBar('Awaiting Confirmation', stats.awaiting_confirmation_errands || 0, stats.total_errands || 1, 'bg-amber-500')}
                            ${renderStatusBar('Completed', stats.completed_errands || 0, stats.total_errands || 1, 'bg-emerald-500')}
                            ${renderStatusBar('Cancelled', stats.cancelled_errands || 0, stats.total_errands || 1, 'bg-slate-500')}
                        </div>
                    </div>

                    <div class="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
                        <h2 class="text-lg font-bold text-secondary mb-4">Agent Statistics</h2>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-slate-600">Total Agents</span>
                                <span class="font-semibold">${stats.total_agents || 0}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-slate-600">Verified Agents</span>
                                <span class="font-semibold">${(stats.total_agents || 0) - (stats.pending_verification_agents || 0) - (stats.blocked_agents || 0)}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-slate-600">Pending Verification</span>
                                <span class="font-semibold text-amber-600">${stats.pending_verification_agents || 0}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-slate-600">Blocked Agents</span>
                                <span class="font-semibold text-red-600">${stats.blocked_agents || 0}</span>
                            </div>
                        </div>
                        
                        <div class="mt-6 p-4 bg-primary/5 rounded-xl">
                            <h3 class="font-medium text-primary mb-2">Quick Actions</h3>
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="window.adminDashboard?.showCreateCustomerModal()" class="text-sm bg-white border border-slate-200 hover:bg-slate-50 py-2 px-3 rounded-lg transition-colors">
                                    Add Customer
                                </button>
                                <button onclick="window.adminDashboard?.showCreateAgentModal()" class="text-sm bg-white border border-slate-200 hover:bg-slate-50 py-2 px-3 rounded-lg transition-colors">
                                    Add Agent
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderStatusBar(label, value, total, colorClass) {
        const percentage = total > 0 ? (value / total * 100) : 0;
        return `
            <div>
                <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-600">${label}</span>
                    <span class="font-semibold">${value}</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2 mt-1">
                    <div class="${colorClass} h-2 rounded-full" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }

    function renderCustomersTab() {
        return `
            <div class="space-y-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 class="text-2xl font-bold text-secondary">Customer Management</h1>
                    <button onclick="window.adminDashboard?.showCreateCustomerModal()" class="bg-primary hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">add</span>
                        Add New Customer
                    </button>
                </div>

                <!-- Search Bar -->
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input type="text" id="customerSearch" placeholder="Search by name, email, or username..." 
                                class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                value="${escapeHtml(searchQuery)}">
                        </div>
                        <button id="searchBtn" class="bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                            Search
                        </button>
                    </div>
                </div>

                <!-- Customers Table -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full data-table">
                            <thead class="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Username</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Errands</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Total Spent</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Joined</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="customersTableBody">
                                ${renderCustomerRows()}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Pagination -->
                ${renderPagination()}
            </div>
        `;
    }

    function renderCustomerRows() {
        if (!customers || customers.length === 0) {
            return `
                <tr>
                    <td colspan="8" class="text-center py-8 text-slate-400">
                        No customers found
                    </td>
                </tr>
            `;
        }

        return customers.map(customer => `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="py-3 px-4">
                    <div class="font-medium">${escapeHtml(customer.name)}</div>
                </td>
                <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(customer.email)}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(customer.username)}</td>
                <td class="py-3 px-4 text-sm">${customer.errand_count || 0}</td>
                <td class="py-3 px-4 text-sm font-medium">${formatCurrency(customer.total_spent)}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${customer.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                        ${customer.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="py-3 px-4 text-sm text-slate-600">${customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}</td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button onclick="window.adminDashboard?.viewCustomer('${customer.id}')" class="text-primary hover:text-emerald-600" title="View">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        <button onclick="window.adminDashboard?.editCustomer('${customer.id}')" class="text-blue-600 hover:text-blue-700" title="Edit">
                            <span class="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button onclick="window.adminDashboard?.deleteCustomer('${customer.id}')" class="text-red-600 hover:text-red-700" title="Delete">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderAgentsTab() {
        return `
            <div class="space-y-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 class="text-2xl font-bold text-secondary">Agent Management</h1>
                    <button onclick="window.adminDashboard?.showCreateAgentModal()" class="bg-primary hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">add</span>
                        Add New Agent
                    </button>
                </div>

                <!-- Filters -->
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input type="text" id="agentSearch" placeholder="Search agents..." 
                                class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                value="${escapeHtml(searchQuery)}">
                        </div>
                        <select id="verificationFilter" class="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                            <option value="">All Verification Status</option>
                            <option value="not_submitted">Not Submitted</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <select id="accountFilter" class="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                            <option value="">All Account Status</option>
                            <option value="active">Active</option>
                            <option value="blocked">Blocked</option>
                        </select>
                    </div>
                    <div class="flex justify-end mt-4">
                        <button id="applyAgentFilters" class="bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                            Apply Filters
                        </button>
                    </div>
                </div>

                <!-- Agents Table -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full data-table">
                            <thead class="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Business</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Verification</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Errands</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Earnings</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="agentsTableBody">
                                ${renderAgentRows()}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Pagination -->
                ${renderPagination()}
            </div>
        `;
    }

    function renderAgentRows() {
        if (!agents || agents.length === 0) {
            return `
                <tr>
                    <td colspan="8" class="text-center py-8 text-slate-400">
                        No agents found
                    </td>
                </tr>
            `;
        }

        return agents.map(agent => {
            const verificationColors = {
                'approved': 'bg-emerald-100 text-emerald-700',
                'pending': 'bg-amber-100 text-amber-700',
                'rejected': 'bg-red-100 text-red-700',
                'not_submitted': 'bg-slate-100 text-slate-600'
            };
            
            const statusColors = {
                'active': 'bg-emerald-100 text-emerald-700',
                'blocked': 'bg-red-100 text-red-700'
            };

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="py-3 px-4">
                        <div class="font-medium">${escapeHtml(agent.name)}</div>
                    </td>
                    <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(agent.email)}</td>
                    <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(agent.business_name || '—')}</td>
                    <td class="py-3 px-4">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${verificationColors[agent.verification_status] || 'bg-slate-100 text-slate-600'}">
                            ${agent.verification_status ? agent.verification_status.replace('_', ' ') : 'N/A'}
                        </span>
                    </td>
                    <td class="py-3 px-4">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[agent.account_status] || 'bg-slate-100 text-slate-600'}">
                            ${agent.account_status || 'N/A'}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-sm">${agent.assigned_errands_count || 0} active</td>
                    <td class="py-3 px-4 text-sm font-medium">${formatCurrency(agent.total_earnings)}</td>
                    <td class="py-3 px-4">
                        <div class="flex gap-2">
                            <button onclick="window.adminDashboard?.viewAgent('${agent.id}')" class="text-primary hover:text-emerald-600" title="View">
                                <span class="material-symbols-outlined text-lg">visibility</span>
                            </button>
                            <button onclick="window.adminDashboard?.editAgent('${agent.id}')" class="text-blue-600 hover:text-blue-700" title="Edit">
                                <span class="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button onclick="window.adminDashboard?.deleteAgent('${agent.id}')" class="text-red-600 hover:text-red-700" title="Delete">
                                <span class="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderErrandsTab() {
        return `
            <div class="space-y-6">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 class="text-2xl font-bold text-secondary">Errand Management</h1>
                </div>

                <!-- Filters -->
                <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                            <input type="text" id="errandSearch" placeholder="Search errands..." 
                                class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                value="${escapeHtml(searchQuery)}">
                        </div>
                        <select id="statusFilter" class="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="accepted">Accepted</option>
                            <option value="in_progress">In Progress</option>
                            <option value="awaiting_confirmation">Awaiting Confirmation</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <input type="text" id="customerIdFilter" placeholder="Customer ID" 
                            class="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        <input type="text" id="agentIdFilter" placeholder="Agent ID" 
                            class="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    <div class="flex justify-end mt-4">
                        <button id="applyErrandFilters" class="bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                            Apply Filters
                        </button>
                    </div>
                </div>

                <!-- Errands Table -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full data-table">
                            <thead class="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Cost</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Pickup → Delivery</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Requested</th>
                                    <th class="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="errandsTableBody">
                                ${renderErrandRows()}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Pagination -->
                ${renderPagination()}
            </div>
        `;
    }

    function renderErrandRows() {
        if (!errands || errands.length === 0) {
            return `
                <tr>
                    <td colspan="8" class="text-center py-8 text-slate-400">
                        No errands found
                    </td>
                </tr>
            `;
        }

        const statusColors = {
            'pending': 'bg-amber-100 text-amber-700',
            'accepted': 'bg-blue-100 text-blue-700',
            'in_progress': 'bg-purple-100 text-purple-700',
            'awaiting_confirmation': 'bg-amber-100 text-amber-700',
            'completed': 'bg-emerald-100 text-emerald-700',
            'cancelled': 'bg-slate-100 text-slate-600'
        };

        return errands.map(errand => `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="py-3 px-4">
                    <div class="font-medium">${escapeHtml(errand.title)}</div>
                </td>
                <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(errand.customer_name)}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(errand.assigned_agent_name || 'Unassigned')}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[errand.status] || 'bg-slate-100 text-slate-600'}">
                        ${errand.status ? errand.status.replace('_', ' ') : 'N/A'}
                    </span>
                </td>
                <td class="py-3 px-4 text-sm font-medium">${formatCurrency(errand.total_cost)}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${escapeHtml(errand.pickup)} → ${escapeHtml(errand.delivery)}</td>
                <td class="py-3 px-4 text-sm text-slate-600">${errand.date_requested ? new Date(errand.date_requested).toLocaleDateString() : 'N/A'}</td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button onclick="window.adminDashboard?.viewErrand('${errand.id}')" class="text-primary hover:text-emerald-600" title="View">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        <button onclick="window.adminDashboard?.showAssignModal('${errand.id}')" class="text-blue-600 hover:text-blue-700" title="Assign/Reassign">
                            <span class="material-symbols-outlined text-lg">swap_horiz</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderProfileTab() {
        if (!currentUser) {
            return `<div class="text-center py-8">Loading profile...</div>`;
        }

        return `
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex flex-col items-center">
                        <div class="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-white text-5xl mb-3">
                            ${currentUser.picture ? 
                                `<img src="${escapeHtml(currentUser.picture)}" alt="${escapeHtml(currentUser.name)}" class="w-full h-full rounded-full object-cover">` : 
                                `<span class="material-symbols-outlined text-5xl">admin_panel_settings</span>`
                            }
                        </div>
                        <h2 class="text-2xl font-bold">${escapeHtml(currentUser.name || 'Admin')}</h2>
                        <p class="text-slate-500">Administrator</p>
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
                            <label class="text-sm text-slate-500">Username</label>
                            <input type="text" value="${escapeHtml(currentUser.username || '')}" 
                                class="w-full rounded-xl border-slate-200 bg-slate-50 p-3" readonly disabled>
                        </div>
                        <div>
                            <label class="text-sm text-slate-500">Role</label>
                            <p class="text-sm bg-slate-50 p-3 rounded-xl font-semibold text-primary">Administrator</p>
                        </div>
                        <div>
                            <label class="text-sm text-slate-500">Member since</label>
                            <p class="text-sm bg-slate-50 p-3 rounded-xl">
                                ${currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPagination() {
        if (totalPages <= 1) return '';

        return `
            <div class="flex justify-center gap-2 mt-4">
                <button onclick="window.adminDashboard?.goToPage(${currentPage - 1})" 
                    class="px-3 py-1 rounded-lg border border-slate-200 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}"
                    ${currentPage === 1 ? 'disabled' : ''}>
                    Previous
                </button>
                <span class="px-3 py-1">Page ${currentPage} of ${totalPages}</span>
                <button onclick="window.adminDashboard?.goToPage(${currentPage + 1})" 
                    class="px-3 py-1 rounded-lg border border-slate-200 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}"
                    ${currentPage === totalPages ? 'disabled' : ''}>
                    Next
                </button>
            </div>
        `;
    }

    // ==================== MODAL FUNCTIONS ====================

    function showCreateCustomerModal() {
        const modal = document.createElement('div');
        modal.id = 'customerModal';
        modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-secondary">Create New Customer</h3>
                    <button onclick="this.closest('#customerModal').remove()" class="text-slate-400 hover:text-primary">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <form id="createCustomerForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                        <input type="text" id="customerName" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                        <input type="email" id="customerEmail" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                        <input type="text" id="customerUsername" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        <p class="text-xs text-slate-400 mt-1">Only letters, numbers, and underscores</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                        <input type="password" id="customerPassword" required minlength="8"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        <p class="text-xs text-slate-400 mt-1">Minimum 8 characters</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                        <input type="tel" id="customerPhone"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
                        Create Customer
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createCustomerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = {
                name: document.getElementById('customerName').value.trim(),
                email: document.getElementById('customerEmail').value.trim(),
                username: document.getElementById('customerUsername').value.trim(),
                password: document.getElementById('customerPassword').value,
                phone_number: document.getElementById('customerPhone').value.trim() || null
            };

            try {
                showLoading('Creating customer...');
                await createCustomer(formData);
                showToast('Customer created successfully', 'success');
                modal.remove();
                await refreshCurrentTab();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    function showCreateAgentModal() {
        const modal = document.createElement('div');
        modal.id = 'agentModal';
        modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-secondary">Create New Agent</h3>
                    <button onclick="this.closest('#agentModal').remove()" class="text-slate-400 hover:text-primary">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <form id="createAgentForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                        <input type="text" id="agentName" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                        <input type="email" id="agentEmail" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                        <input type="text" id="agentUsername" required
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        <p class="text-xs text-slate-400 mt-1">Only letters, numbers, and underscores</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                        <input type="password" id="agentPassword" required minlength="8"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        <p class="text-xs text-slate-400 mt-1">Minimum 8 characters</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                        <input type="text" id="agentBusinessName"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                        <input type="tel" id="agentPhone"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
                        Create Agent
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createAgentForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = {
                name: document.getElementById('agentName').value.trim(),
                email: document.getElementById('agentEmail').value.trim(),
                username: document.getElementById('agentUsername').value.trim(),
                password: document.getElementById('agentPassword').value,
                business_name: document.getElementById('agentBusinessName').value.trim() || null,
                phone_number: document.getElementById('agentPhone').value.trim() || null
            };

            try {
                showLoading('Creating agent...');
                await createAgent(formData);
                showToast('Agent created successfully', 'success');
                modal.remove();
                await refreshCurrentTab();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    function showAssignModal(errandId) {
        const modal = document.createElement('div');
        modal.id = 'assignModal';
        modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-md w-full shadow-xl p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-secondary">Assign Errand</h3>
                    <button onclick="this.closest('#assignModal').remove()" class="text-slate-400 hover:text-primary">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <form id="assignErrandForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Agent ID</label>
                        <input type="text" id="agentId" required placeholder="Enter agent ID"
                            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                    </div>
                    
                    <div class="bg-blue-50 p-3 rounded-lg">
                        <p class="text-xs text-blue-700">
                            Enter the ID of the agent you want to assign this errand to.
                            The agent must be verified and active.
                        </p>
                    </div>
                    
                    <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
                        Assign Errand
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('assignErrandForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const agentId = document.getElementById('agentId').value.trim();

            if (!agentId) {
                showToast('Please enter an agent ID', 'error');
                return;
            }

            try {
                showLoading('Assigning errand...');
                await assignErrand(errandId, agentId);
                showToast('Errand assigned successfully', 'success');
                modal.remove();
                await refreshCurrentTab();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    async function viewCustomer(customerId) {
        try {
            showLoading('Loading customer details...');
            const customer = await fetchCustomerDetails(customerId);
            const errands = await fetchCustomerErrands(customerId);
            
            if (!customer) {
                showToast('Customer not found', 'error');
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'viewCustomerModal';
            modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };

            const errandsList = errands.map(e => `
                <div class="border-b border-slate-100 py-2 last:border-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-medium">${escapeHtml(e.title)}</p>
                            <p class="text-xs text-slate-500">${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}</p>
                        </div>
                        <span class="text-xs px-2 py-1 rounded-full ${e.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                            ${e.status ? e.status.replace('_', ' ') : 'N/A'}
                        </span>
                    </div>
                </div>
            `).join('') || '<p class="text-slate-400">No errands found</p>';

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-secondary">Customer Details</h3>
                        <button onclick="this.closest('#viewCustomerModal').remove()" class="text-slate-400 hover:text-primary">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Name</p>
                                <p class="font-medium">${escapeHtml(customer.name)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Email</p>
                                <p class="font-medium">${escapeHtml(customer.email)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Username</p>
                                <p class="font-medium">${escapeHtml(customer.username)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Phone</p>
                                <p class="font-medium">${escapeHtml(customer.phone_number || '—')}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Status</p>
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${customer.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                                    ${customer.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Joined</p>
                                <p class="font-medium">${customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}</p>
                            </div>
                        </div>

                        <div class="bg-slate-50 p-3 rounded-lg">
                            <p class="text-xs text-slate-500 mb-2">Statistics</p>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm font-medium">Total Errands</p>
                                    <p class="text-2xl font-bold text-primary">${customer.errand_count || 0}</p>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">Total Spent</p>
                                    <p class="text-2xl font-bold text-primary">${formatCurrency(customer.total_spent)}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 class="font-medium mb-3">Errands</h4>
                            <div class="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                                ${errandsList}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Error loading customer details', 'error');
        } finally {
            hideLoading();
        }
    }

    async function viewAgent(agentId) {
        try {
            showLoading('Loading agent details...');
            const agent = await fetchAgentDetails(agentId);
            const errands = await fetchAgentErrands(agentId);
            
            if (!agent) {
                showToast('Agent not found', 'error');
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'viewAgentModal';
            modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };

            const errandsList = errands.map(e => `
                <div class="border-b border-slate-100 py-2 last:border-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-medium">${escapeHtml(e.title)}</p>
                            <p class="text-xs text-slate-500">${escapeHtml(e.pickup)} → ${escapeHtml(e.delivery)}</p>
                        </div>
                        <span class="text-xs px-2 py-1 rounded-full ${e.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                            ${e.status ? e.status.replace('_', ' ') : 'N/A'}
                        </span>
                    </div>
                </div>
            `).join('') || '<p class="text-slate-400">No errands found</p>';

            const verificationColors = {
                'approved': 'bg-emerald-100 text-emerald-700',
                'pending': 'bg-amber-100 text-amber-700',
                'rejected': 'bg-red-100 text-red-700',
                'not_submitted': 'bg-slate-100 text-slate-600'
            };

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-secondary">Agent Details</h3>
                        <button onclick="this.closest('#viewAgentModal').remove()" class="text-slate-400 hover:text-primary">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Name</p>
                                <p class="font-medium">${escapeHtml(agent.name)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Email</p>
                                <p class="font-medium">${escapeHtml(agent.email)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Business Name</p>
                                <p class="font-medium">${escapeHtml(agent.business_name || '—')}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Phone</p>
                                <p class="font-medium">${escapeHtml(agent.phone_number || '—')}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Verification</p>
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${verificationColors[agent.verification_status]}">
                                    ${agent.verification_status ? agent.verification_status.replace('_', ' ') : 'N/A'}
                                </span>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Account Status</p>
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${agent.account_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
                                    ${agent.account_status || 'N/A'}
                                </span>
                            </div>
                        </div>

                        <div class="bg-slate-50 p-3 rounded-lg">
                            <p class="text-xs text-slate-500 mb-2">Earnings</p>
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <p class="text-sm font-medium">Total Earned</p>
                                    <p class="text-xl font-bold text-primary">${formatCurrency(agent.total_earnings)}</p>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">Pending</p>
                                    <p class="text-xl font-bold text-amber-500">${formatCurrency(agent.pending_earnings)}</p>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">Completed</p>
                                    <p class="text-xl font-bold text-primary">${agent.completed_errands_count || 0}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 class="font-medium mb-3">Assigned Errands</h4>
                            <div class="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                                ${errandsList}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Error loading agent details', 'error');
        } finally {
            hideLoading();
        }
    }

    async function viewErrand(errandId) {
        try {
            showLoading('Loading errand details...');
            const errand = await fetchErrandDetails(errandId);
            
            if (!errand) {
                showToast('Errand not found', 'error');
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'viewErrandModal';
            modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };

            const statusColors = {
                'pending': 'text-amber-600',
                'accepted': 'text-blue-600',
                'in_progress': 'text-purple-600',
                'awaiting_confirmation': 'text-amber-600',
                'completed': 'text-emerald-600',
                'cancelled': 'text-slate-600'
            };

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-secondary">Errand Details</h3>
                        <button onclick="this.closest('#viewErrandModal').remove()" class="text-slate-400 hover:text-primary">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="bg-slate-50 p-4 rounded-lg">
                            <h4 class="font-bold text-lg mb-2">${escapeHtml(errand.title)}</h4>
                            <p class="text-sm text-slate-600 mb-4">${escapeHtml(errand.description) || 'No description'}</p>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-xs text-slate-500">Customer</p>
                                    <p class="font-medium">${escapeHtml(errand.customer_name)}</p>
                                    <p class="text-xs text-slate-400">${escapeHtml(errand.customer_email || '')}</p>
                                </div>
                                <div>
                                    <p class="text-xs text-slate-500">Agent</p>
                                    <p class="font-medium">${escapeHtml(errand.assigned_agent_name || 'Unassigned')}</p>
                                    ${errand.assigned_agent_email ? `<p class="text-xs text-slate-400">${escapeHtml(errand.assigned_agent_email)}</p>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Status</p>
                                <p class="font-medium ${statusColors[errand.status]}">${errand.status ? errand.status.replace('_', ' ') : 'N/A'}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Total Cost</p>
                                <p class="font-bold text-primary">${formatCurrency(errand.total_cost)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Budget</p>
                                <p class="font-medium">${formatCurrency(errand.budget)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Service Fee</p>
                                <p class="font-medium">${formatCurrency(errand.service_fee)}</p>
                            </div>
                        </div>

                        <div class="bg-slate-50 p-3 rounded-lg">
                            <p class="text-xs text-slate-500 mb-2">Route</p>
                            <div class="flex items-center gap-2">
                                <span class="text-sm">${escapeHtml(errand.pickup)}</span>
                                <span class="material-symbols-outlined text-sm text-slate-400">arrow_forward</span>
                                <span class="text-sm">${escapeHtml(errand.delivery)}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Requested</p>
                                <p class="text-sm">${formatDate(errand.date_requested)}</p>
                            </div>
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Created</p>
                                <p class="text-sm">${formatDate(errand.created_at)}</p>
                            </div>
                            ${errand.accepted_at ? `
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Accepted</p>
                                <p class="text-sm">${formatDate(errand.accepted_at)}</p>
                            </div>
                            ` : ''}
                            ${errand.completed_at ? `
                            <div class="bg-slate-50 p-3 rounded-lg">
                                <p class="text-xs text-slate-500">Completed</p>
                                <p class="text-sm">${formatDate(errand.completed_at)}</p>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Error loading errand details', 'error');
        } finally {
            hideLoading();
        }
    }

    async function editCustomer(customerId) {
        try {
            showLoading('Loading customer data...');
            const customer = await fetchCustomerDetails(customerId);
            
            if (!customer) {
                showToast('Customer not found', 'error');
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'editCustomerModal';
            modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-secondary">Edit Customer</h3>
                        <button onclick="this.closest('#editCustomerModal').remove()" class="text-slate-400 hover:text-primary">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <form id="editCustomerForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                            <input type="text" id="editCustomerName" value="${escapeHtml(customer.name)}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input type="text" id="editCustomerUsername" value="${escapeHtml(customer.username)}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                            <input type="tel" id="editCustomerPhone" value="${escapeHtml(customer.phone_number || '')}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">New Password (leave blank to keep current)</label>
                            <input type="password" id="editCustomerPassword" minlength="8"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="editCustomerActive" ${customer.is_active ? 'checked' : ''}>
                            <label for="editCustomerActive" class="text-sm text-slate-700">Account Active</label>
                        </div>
                        
                        <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
                            Update Customer
                        </button>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('editCustomerForm').addEventListener('submit', async (e) => {
                e.preventDefault();

                const updateData = {
                    name: document.getElementById('editCustomerName').value.trim(),
                    username: document.getElementById('editCustomerUsername').value.trim(),
                    phone_number: document.getElementById('editCustomerPhone').value.trim() || null,
                    is_active: document.getElementById('editCustomerActive').checked
                };

                const password = document.getElementById('editCustomerPassword').value;
                if (password) {
                    updateData.password = password;
                }

                try {
                    showLoading('Updating customer...');
                    await updateCustomer(customerId, updateData);
                    showToast('Customer updated successfully', 'success');
                    modal.remove();
                    await refreshCurrentTab();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        } catch (error) {
            showToast('Error loading customer data', 'error');
        } finally {
            hideLoading();
        }
    }

    async function deleteCustomer(customerId) {
        showConfirmModal({
            title: 'Delete Customer',
            message: 'Are you sure you want to delete this customer? This action cannot be undone and will also delete all completed/cancelled errands.',
            confirmText: 'Delete',
            destructive: true,
            onConfirm: async () => {
                try {
                    showLoading('Deleting customer...');
                    await deleteCustomer(customerId);
                    showToast('Customer deleted successfully', 'success');
                    await refreshCurrentTab();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    hideLoading();
                }
            }
        });
    }

    async function editAgent(agentId) {
        try {
            showLoading('Loading agent data...');
            const agent = await fetchAgentDetails(agentId);
            
            if (!agent) {
                showToast('Agent not found', 'error');
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'editAgentModal';
            modal.className = 'fixed inset-0 z-[200] modal-backdrop flex items-center justify-center p-4';
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };

            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-secondary">Edit Agent</h3>
                        <button onclick="this.closest('#editAgentModal').remove()" class="text-slate-400 hover:text-primary">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <form id="editAgentForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                            <input type="text" id="editAgentName" value="${escapeHtml(agent.name)}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input type="text" id="editAgentUsername" value="${escapeHtml(agent.username)}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                            <input type="text" id="editAgentBusinessName" value="${escapeHtml(agent.business_name || '')}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                            <input type="tel" id="editAgentPhone" value="${escapeHtml(agent.phone_number || '')}"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">New Password (leave blank to keep current)</label>
                            <input type="password" id="editAgentPassword" minlength="8"
                                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Account Status</label>
                                <select id="editAgentAccountStatus" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                                    <option value="active" ${agent.account_status === 'active' ? 'selected' : ''}>Active</option>
                                    <option value="blocked" ${agent.account_status === 'blocked' ? 'selected' : ''}>Blocked</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Verification</label>
                                <select id="editAgentVerificationStatus" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                                    <option value="not_submitted" ${agent.verification_status === 'not_submitted' ? 'selected' : ''}>Not Submitted</option>
                                    <option value="pending" ${agent.verification_status === 'pending' ? 'selected' : ''}>Pending</option>
                                    <option value="approved" ${agent.verification_status === 'approved' ? 'selected' : ''}>Approved</option>
                                    <option value="rejected" ${agent.verification_status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="editAgentActive" ${agent.is_active ? 'checked' : ''}>
                            <label for="editAgentActive" class="text-sm text-slate-700">Account Active</label>
                        </div>
                        
                        <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
                            Update Agent
                        </button>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('editAgentForm').addEventListener('submit', async (e) => {
                e.preventDefault();

                const updateData = {
                    name: document.getElementById('editAgentName').value.trim(),
                    username: document.getElementById('editAgentUsername').value.trim(),
                    business_name: document.getElementById('editAgentBusinessName').value.trim() || null,
                    phone_number: document.getElementById('editAgentPhone').value.trim() || null,
                    account_status: document.getElementById('editAgentAccountStatus').value,
                    verification_status: document.getElementById('editAgentVerificationStatus').value,
                    is_active: document.getElementById('editAgentActive').checked
                };

                const password = document.getElementById('editAgentPassword').value;
                if (password) {
                    updateData.password = password;
                }

                try {
                    showLoading('Updating agent...');
                    await updateAgent(agentId, updateData);
                    showToast('Agent updated successfully', 'success');
                    modal.remove();
                    await refreshCurrentTab();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        } catch (error) {
            showToast('Error loading agent data', 'error');
        } finally {
            hideLoading();
        }
    }

    async function deleteAgent(agentId) {
        showConfirmModal({
            title: 'Delete Agent',
            message: 'Are you sure you want to delete this agent? This action cannot be undone and will remove all associated data.',
            confirmText: 'Delete',
            destructive: true,
            onConfirm: async () => {
                try {
                    showLoading('Deleting agent...');
                    await deleteAgent(agentId);
                    showToast('Agent deleted successfully', 'success');
                    await refreshCurrentTab();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    hideLoading();
                }
            }
        });
    }

    // ==================== PAGE MANAGEMENT ====================

    async function refreshCurrentTab() {
        await renderPage(currentTab);
    }

    async function goToPage(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        await refreshCurrentTab();
    }

    async function renderPage(tab) {
        showLoading();
        
        try {
            // Fetch data based on tab
            if (tab === "overview") {
                stats = await fetchDashboardStats();
            } else if (tab === "customers") {
                await fetchCustomers(currentPage, searchQuery);
            } else if (tab === "agents") {
                await fetchAgents(currentPage, currentFilters);
            } else if (tab === "errands") {
                await fetchErrands(currentPage, currentFilters);
            }
            
            let html = "";
            if (tab === "overview") html = renderOverviewTab();
            else if (tab === "customers") html = renderCustomersTab();
            else if (tab === "agents") html = renderAgentsTab();
            else if (tab === "errands") html = renderErrandsTab();
            else if (tab === "profile") html = renderProfileTab();
            
            pageContainer.innerHTML = html;
            
            // Attach events
            if (tab === "customers") attachCustomerEvents();
            if (tab === "agents") attachAgentEvents();
            if (tab === "errands") attachErrandEvents();
            
        } catch (error) {
            console.error('Error rendering page:', error);
            showToast('Failed to load page content', 'error');
        } finally {
            hideLoading();
        }
    }

    function attachCustomerEvents() {
        const searchBtn = document.getElementById('searchBtn');
        const searchInput = document.getElementById('customerSearch');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                searchQuery = searchInput.value;
                currentPage = 1;
                renderPage('customers');
            });
        }
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    searchQuery = searchInput.value;
                    currentPage = 1;
                    renderPage('customers');
                }
            });
        }
    }

    function attachAgentEvents() {
        const applyBtn = document.getElementById('applyAgentFilters');
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                currentFilters = {
                    search: document.getElementById('agentSearch').value,
                    verification_status: document.getElementById('verificationFilter').value,
                    account_status: document.getElementById('accountFilter').value
                };
                currentPage = 1;
                renderPage('agents');
            });
        }
    }

    function attachErrandEvents() {
        const applyBtn = document.getElementById('applyErrandFilters');
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                currentFilters = {
                    search: document.getElementById('errandSearch').value,
                    status: document.getElementById('statusFilter').value,
                    customer_id: document.getElementById('customerIdFilter').value,
                    agent_id: document.getElementById('agentIdFilter').value
                };
                currentPage = 1;
                renderPage('errands');
            });
        }
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
        currentPage = 1;
        searchQuery = "";
        currentFilters = {};
        
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
    }

    // ==================== LOGOUT ====================

    async function handleLogout() {
        showConfirmModal({
            title: 'Log Out',
            message: 'Are you sure you want to log out?',
            onConfirm: async () => {
                const refreshToken = localStorage.getItem('refresh_token');
                
                if (refreshToken) {
                    try {
                        await fetch(`${window.BACKEND_URL}/api/auth/logout?refresh_token=${refreshToken}`, {
                            method: 'POST'
                        });
                    } catch (e) {
                        console.warn('Logout API call failed:', e);
                    }
                }
                
                clearAuth();
                redirectToLogin();
            }
        });
    }

    // ==================== INITIALIZATION ====================

    async function initializeDashboard() {
        // Check authentication
        const token = localStorage.getItem('access_token');
        if (!token) {
            redirectToLogin();
            return;
        }
        
        // Load user and verify role
        await fetchCurrentUser();
        if (!currentUser || currentUser.role !== 'admin') {
            redirectToLogin();
            return;
        }
        
        // Set up event listeners
        hamburgerBtn?.addEventListener("click", openSidebar);
        closeSidebarBtn?.addEventListener("click", closeSidebar);
        
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
        
        // Logout button
        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });

        // Initial render
        await setActiveTab("overview");
        
        // Auto-refresh stats every 30 seconds
        refreshInterval = setInterval(async () => {
            if (currentTab === 'overview') {
                stats = await fetchDashboardStats();
                if (currentTab === 'overview') {
                    renderPage('overview');
                }
            }
        }, 30000);
    }

    // Clean up interval on page unload
    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    // Expose methods to global for onclick handlers
    window.adminDashboard = {
        showCreateCustomerModal,
        showCreateAgentModal,
        showAssignModal,
        viewCustomer,
        viewAgent,
        viewErrand,
        editCustomer,
        editAgent,
        deleteCustomer,
        deleteAgent,
        goToPage
    };

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboard);
    } else {
        initializeDashboard();
    }

})();