// customer-dashboard.js - Complete dashboard functionality with token-based auth

// Wrap everything in an IIFE with execution guard
(function() {
    // Guard to prevent double initialization
    if (window.customerDashboardInitialized) {
        console.log('Customer dashboard already initialized, skipping...');
        return;
    }
    
    // Set flag immediately
    window.customerDashboardInitialized = true;
    console.log('Initializing customer dashboard...');

    // Cache for user data to prevent multiple API calls
    let cachedUser = null;
    let userFetchPromise = null;

    // ==================== MOCK DATA & LOCAL STATE ====================
    let ongoingErrands = [
        {
            id: "e1",
            title: "Market shopping (Mile 12)",
            status: "in-progress",
            cost: 4500,
            dateRequested: "2026-02-27",
            description: "5kg rice, tomatoes, pepper",
            pickup: "Mile 12 market",
            delivery: "Ikeja",
            budget: 5000,
            preferredTime: "10:00 AM",
        },
        {
            id: "e2",
            title: "Document delivery",
            status: "in-progress",
            cost: 3200,
            dateRequested: "2026-02-26",
            description: "Envelope to client",
            pickup: "Marina",
            delivery: "VI",
            budget: 4000,
            preferredTime: "2:00 PM",
        },
    ];
    
    let historyErrands = [
        {
            id: "h1",
            title: "Pharmacy pickup",
            status: "completed",
            cost: 2800,
            dateCompleted: "2026-02-25",
            description: "Prescription meds",
            pickup: "Lekki Pharmacy",
            delivery: "Home",
        },
        {
            id: "h2",
            title: "Bank deposit",
            status: "completed",
            cost: 3500,
            dateCompleted: "2026-02-24",
            description: "Check deposit at Access bank",
            pickup: "VI",
            delivery: "Bank",
        },
    ];

    const totalSpent = historyErrands.reduce((sum, e) => sum + e.cost, 0);

    // ==================== DOM ELEMENTS ====================
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

    let currentTab = "request";

    // ==================== AUTH FUNCTIONS ====================
    async function fetchCurrentUser(forceRefresh = false) {
        if (!forceRefresh && cachedUser) {
            console.log('Returning cached user');
            return cachedUser;
        }

        if (userFetchPromise) {
            console.log('Fetch already in progress, waiting...');
            return userFetchPromise;
        }

        console.log('Fetching user from API...');
        
        const token = localStorage.getItem('access_token');
        
        if (!token) {
            console.log('No access token found');
            cachedUser = { name: 'User' };
            return cachedUser;
        }
        
        userFetchPromise = (async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.status === 401) {
                    console.log('Token expired, attempting to refresh...');
                    const newToken = await refreshAccessToken();
                    if (newToken) {
                        const retryResponse = await fetch(`${BACKEND_URL}/api/auth/me`, {
                            headers: {
                                'Authorization': `Bearer ${newToken}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (retryResponse.ok) {
                            const userData = await retryResponse.json();
                            localStorage.setItem('user', JSON.stringify(userData));
                            cachedUser = userData;
                            return userData;
                        }
                    }
                } else if (response.ok) {
                    const userData = await response.json();
                    localStorage.setItem('user', JSON.stringify(userData));
                    cachedUser = userData;
                    return userData;
                }
            } catch (e) {
                console.error('Error fetching user from API:', e);
            }
            
            const userStr = localStorage.getItem('user');
            if (userStr) {
                try {
                    const userData = JSON.parse(userStr);
                    cachedUser = userData;
                    return userData;
                } catch (e) {
                    console.error('Error parsing user data:', e);
                }
            }
            
            cachedUser = { name: 'User' };
            return cachedUser;
        })();

        const result = await userFetchPromise;
        userFetchPromise = null;
        return result;
    }

    async function refreshAccessToken() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) return null;
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/refresh?refresh_token=${refreshToken}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                return data.access_token;
            } else {
                clearAuthStorage();
                window.location.href = getSignInUrl();
                return null;
            }
        } catch (e) {
            console.error('Error refreshing token:', e);
            return null;
        }
    }

    function getSignInUrl() {
        const p = window.location.pathname || "";
        return p.includes("/frontend/") ? "/frontend/sign-in.html" : "/sign-in.html";
    }

    function clearAuthStorage() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        cachedUser = null;
    }

    // ==================== UI UPDATE FUNCTIONS ====================
    async function updateGreeting() {
        const user = await fetchCurrentUser();
        const greetingElement = document.getElementById('greeting-container');
        
        if (greetingElement) {
            const hour = new Date().getHours();
            let timeGreeting = 'Good afternoon';
            
            if (hour < 12) timeGreeting = 'Good morning';
            else if (hour < 17) timeGreeting = 'Good afternoon';
            else timeGreeting = 'Good evening';
            
            let username = user.name || 'User';
            if (username.includes(' ')) {
                username = username.split(' ')[0];
            }
            
            greetingElement.textContent = `👋 ${timeGreeting}, ${username}`;
        }
    }

    async function updateProfileInfo() {
        const user = await fetchCurrentUser();
        if (!user) return;
        
        let username = user.name || 'User';
        if (username.includes(' ')) {
            username = username.split(' ')[0];
        }
        
        // Only update profile elements when on profile tab
        if (currentTab === 'profile') {
            // Update profile name - be more specific to avoid affecting "Request an errand"
            const profileNameElement = document.querySelector('.flex.flex-col.items-center h2.text-2xl.font-bold');
            if (profileNameElement) {
                profileNameElement.textContent = user.name || username;
            }
            
            // Update email - target the profile email input specifically
            const emailInputs = document.querySelectorAll('input[type="email"]');
            emailInputs.forEach(input => {
                if (input.closest('.max-w-2xl')) { // Only if in profile section
                    input.value = user.email || '';
                }
            });
            
            // Update name input
            const nameInputs = document.querySelectorAll('input[type="text"]');
            nameInputs.forEach(input => {
                if (input.closest('.max-w-2xl') && !input.value.includes('@')) {
                    input.value = user.name || username;
                }
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

    function setActiveTab(tabId) {
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
        
        renderPage(tabId);
        
        // Update profile info if profile tab is selected
        if (tabId === 'profile') {
            setTimeout(updateProfileInfo, 100);
        }
    }

    // ==================== PAGE RENDERING ====================
    function renderPage(tab) {
        let html = "";
        if (tab === "request") html = renderRequestTab();
        else if (tab === "ongoing") html = renderOngoingTab();
        else if (tab === "history") html = renderHistoryTab();
        else if (tab === "profile") html = renderProfileTab();
        
        pageContainer.innerHTML = html;
        
        if (tab === "request") attachRequestEvents();
        if (tab === "ongoing") attachOngoingEvents();
    }

    function renderRequestTab() {
        const totalErrands = ongoingErrands.length + historyErrands.length;
        const activeCount = ongoingErrands.length;
        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between">
                    <h1 class="text-2xl font-bold text-secondary">Request an errand</h1>
                    <span class="text-sm text-slate-500 bg-white px-4 py-2 rounded-full shadow-sm">📍 Ikeja</span>
                </div>
                <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex justify-between items-center">
                    <div><p class="text-slate-500 text-sm">Total errands</p><p class="text-2xl font-bold">${totalErrands}</p></div>
                    <div class="w-px h-10 bg-slate-200"></div>
                    <div><p class="text-slate-500 text-sm">Active now</p><p class="text-2xl font-bold text-primary">${activeCount}</p></div>
                    <div class="w-px h-10 bg-slate-200"></div>
                    <div><p class="text-slate-500 text-sm">Completed</p><p class="text-2xl font-bold">${historyErrands.length}</p></div>
                </div>
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h2 class="font-bold text-lg mb-4">New errand request</h2>
                    <form id="errandForm" class="space-y-4">
                        <div><label class="text-sm font-medium text-slate-600">Title</label><input type="text" id="title" required class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary" placeholder="e.g., Market shopping"></div>
                        <div><label class="text-sm font-medium text-slate-600">Description</label><textarea id="desc" rows="2" class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary" placeholder="Items, details..."></textarea></div>
                        <div class="grid grid-cols-2 gap-3"><div><label class="text-sm">Pickup</label><input type="text" id="pickup" class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50" value="Ikeja"></div><div><label class="text-sm">Delivery</label><input type="text" id="delivery" class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50" value="VI"></div></div>
                        <div class="grid grid-cols-2 gap-3"><div><label class="text-sm">Preferred time</label><input type="time" id="time" class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50"></div><div><label class="text-sm">Budget (₦)</label><input type="number" id="budget" value="3000" class="w-full mt-1 rounded-xl border-slate-200 bg-slate-50"></div></div>
                        <div class="bg-slate-50 p-4 rounded-xl flex justify-between items-center"><span class="font-medium">Auto‑calculated cost</span><span class="text-xl font-bold text-primary" id="costPreview">₦3,200</span></div>
                        <button type="submit" class="w-full bg-primary hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all">Request Errand</button>
                    </form>
                </div>
            </div>
        `;
    }

    function attachRequestEvents() {
        const budgetInput = document.getElementById("budget");
        const costSpan = document.getElementById("costPreview");
        if (budgetInput) {
            const updateCost = () => {
                const val = parseInt(budgetInput.value) || 0;
                const fee = Math.max(200, Math.round(val * 0.1));
                costSpan.innerText = `₦${(val + fee).toLocaleString()}`;
            };
            budgetInput.addEventListener("input", updateCost);
            updateCost();
        }
        
        document.getElementById("errandForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const title = document.getElementById("title").value.trim();
            if (!title) return;
            
            const desc = document.getElementById("desc").value || "—";
            const pickup = document.getElementById("pickup").value;
            const delivery = document.getElementById("delivery").value;
            const time = document.getElementById("time").value || "12:00";
            const budget = parseInt(document.getElementById("budget").value) || 2000;
            const cost = budget + Math.max(200, Math.round(budget * 0.1));
            
            const newErrand = {
                id: "e" + Date.now(),
                title,
                status: "in-progress",
                cost,
                dateRequested: new Date().toISOString().slice(0, 10),
                description: desc,
                pickup,
                delivery,
                budget,
                preferredTime: time,
            };
            
            ongoingErrands.push(newErrand);
            alert("✅ Errand requested! It has been added to Ongoing.");
            setActiveTab("ongoing");
        });
    }

    function renderOngoingTab() {
        if (ongoingErrands.length === 0) {
            return `<div class="h-[70vh] flex flex-col items-center justify-center text-center"><span class="material-symbols-outlined text-6xl text-slate-300">pending_actions</span><p class="text-slate-400 text-lg font-medium mt-4">No ongoing errands yet</p><p class="text-sm text-slate-400">Your active errands will appear here.</p></div>`;
        }
        
        let cards = "";
        ongoingErrands.forEach((e) => {
            cards += `
                <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm card-hover" data-id="${e.id}">
                    <div class="flex justify-between items-start"><h3 class="font-bold text-lg">${e.title}</h3><span class="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-semibold">In Progress</span></div>
                    <div class="flex gap-4 mt-2 text-sm text-slate-500"><span>💰 ₦${e.cost.toLocaleString()}</span><span>📅 ${e.dateRequested}</span></div>
                    <button class="view-details-btn mt-4 w-full bg-slate-100 hover:bg-primary hover:text-white py-3 rounded-xl font-medium text-sm transition-colors" data-id="${e.id}">View Details</button>
                </div>
            `;
        });
        
        return `<div class="space-y-4"><h2 class="text-xl font-bold text-secondary">Ongoing errands (${ongoingErrands.length})</h2>${cards}</div>`;
    }

    function attachOngoingEvents() {
        document.querySelectorAll(".view-details-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const id = btn.getAttribute("data-id");
                const errand = ongoingErrands.find((e) => e.id === id);
                if (!errand) return;
                
                modalContent.innerHTML = `
                    <p><span class="font-semibold">Title:</span> ${errand.title}</p>
                    <p><span class="font-semibold">Description:</span> ${errand.description}</p>
                    <p><span class="font-semibold">Pickup:</span> ${errand.pickup}</p>
                    <p><span class="font-semibold">Delivery:</span> ${errand.delivery}</p>
                    <p><span class="font-semibold">Time:</span> ${errand.preferredTime || "asap"}</p>
                    <p><span class="font-semibold">Budget:</span> ₦${errand.budget}</p>
                    <p><span class="font-semibold">Cost:</span> ₦${errand.cost}</p>
                    <p><span class="font-semibold">Status:</span> <span class="text-amber-600">In Progress</span></p>
                    <button id="fakeCompleteBtn" class="mt-4 w-full bg-primary text-white py-3 rounded-xl font-bold">Mark as completed (demo)</button>
                `;
                
                modalOverlay.classList.remove("hidden");
                modalOverlay.classList.add("flex");
                
                document.getElementById("fakeCompleteBtn")?.addEventListener("click", () => {
                    const index = ongoingErrands.findIndex((x) => x.id === id);
                    if (index !== -1) {
                        const completed = {
                            ...ongoingErrands[index],
                            status: "completed",
                            dateCompleted: new Date().toISOString().slice(0, 10),
                        };
                        delete completed.preferredTime;
                        historyErrands.push(completed);
                        ongoingErrands.splice(index, 1);
                        closeModal();
                        setActiveTab("ongoing");
                    }
                });
            });
        });
    }

    function renderHistoryTab() {
        if (historyErrands.length === 0) {
            return `<div class="h-[70vh] flex flex-col items-center justify-center"><span class="material-symbols-outlined text-6xl text-slate-300">history</span><p class="text-slate-400">No completed errands yet.</p></div>`;
        }
        
        let cards = "";
        historyErrands.forEach((e) => {
            cards += `
                <div class="bg-white/70 rounded-xl p-5 border border-slate-100 shadow-sm opacity-80">
                    <div class="flex justify-between"><h3 class="font-bold text-slate-700">${e.title}</h3><span class="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full">Completed</span></div>
                    <div class="flex gap-4 mt-2 text-sm text-slate-500"><span>💰 ₦${e.cost}</span><span>✅ ${e.dateCompleted}</span></div>
                </div>
            `;
        });
        
        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center"><h2 class="text-xl font-bold">Errand history</h2><div class="bg-white px-4 py-2 rounded-full shadow-sm text-primary font-bold">Total spent: ₦${totalSpent.toLocaleString()}</div></div>
                ${cards}
            </div>
        `;
    }

    function renderProfileTab() {
        const user = cachedUser || { name: 'Tunde Bakare', email: 'tunde@errand.ng' };
        
        return `
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex flex-col items-center">
                        <div class="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-5xl mb-3"><span class="material-symbols-outlined text-5xl">account_circle</span></div>
                        <h2 class="text-2xl font-bold">${user.name || 'Tunde Bakare'}</h2>
                        <p class="text-slate-500">Customer since 2025</p>
                    </div>
                    <div class="mt-6 space-y-4">
                        <div><label class="text-sm text-slate-500">Full name</label><input type="text" value="${user.name || 'Tunde Bakare'}" class="w-full rounded-xl border-slate-200 bg-slate-50 p-3"></div>
                        <div><label class="text-sm text-slate-500">Email</label><input type="email" value="${user.email || 'tunde@errand.ng'}" class="w-full rounded-xl border-slate-200 bg-slate-50 p-3"></div>
                        <div><label class="text-sm text-slate-500">Phone</label><input type="tel" value="+234 812 345 6789" class="w-full rounded-xl border-slate-200 bg-slate-50 p-3"></div>
                    </div>
                </div>
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold mb-3">Account info</h3>
                    <p class="text-sm text-slate-600">Email verified · Phone verified</p>
                    <h3 class="font-bold mt-5 mb-2">Saved addresses</h3>
                    <p class="text-sm bg-slate-50 p-3 rounded-xl">🏠 12, Adeola Odeku, VI</p>
                    <p class="text-sm bg-slate-50 p-3 rounded-xl mt-2">🏢 35, Marina, Lagos</p>
                    <button id="logoutBtn" class="mt-6 w-full border border-red-200 text-red-500 hover:bg-red-50 py-3 rounded-xl font-bold transition-colors">Log out</button>
                </div>
            </div>
        `;
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
                await fetch(`${BACKEND_URL}/api/auth/logout?refresh_token=${refreshToken}`, {
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
        clearAuthStorage();
        window.location.href = getSignInUrl();
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
    function initializeDashboard() {
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
                handleNavClick(e, item.getAttribute("data-tab")),
            ),
        );
        
        sidebarLinks.forEach((link) =>
            link.addEventListener("click", (e) =>
                handleNavClick(e, link.getAttribute("data-tab")),
            ),
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

        // Fetch user and update UI
        fetchCurrentUser().then(() => {
            updateGreeting();
            injectLogoutButtonIntoSidebar();
        });

        // Initial tab
        setActiveTab("request");
    }

    // Start everything
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboard);
    } else {
        initializeDashboard();
    }

})();