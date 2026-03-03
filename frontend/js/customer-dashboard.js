// customer-dashboard.js

async function fetchCurrentUser() {
    // Try to get token (just for logging)
    const token = localStorage.getItem('auth_token');
    console.log('Token found:', token ? 'Yes' : 'No');
    
    // Get user data directly from localStorage (stored during login)
    const userStr = localStorage.getItem('user');
    console.log('User data from localStorage:', userStr ? 'Yes' : 'No');
    
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            let username = userData.name || 'User';
            if (username.includes(' ')) {
                username = username.split(' ')[0];
            }
            return { username };
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
    
    return { username: 'User' };
}

async function updateGreeting() {
    const user = await fetchCurrentUser();
    const greetingElement = document.getElementById('greeting-container');
    
    if (greetingElement) {
        const hour = new Date().getHours();
        let timeGreeting = 'Good afternoon';
        
        if (hour < 12) timeGreeting = 'Good morning';
        else if (hour < 17) timeGreeting = 'Good afternoon';
        else timeGreeting = 'Good evening';
        
        greetingElement.textContent = `👋 ${timeGreeting}, ${user.username}`;
        console.log('Greeting updated to:', greetingElement.textContent);
    }
}

async function updateProfileInfo() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    
    try {
        const userData = JSON.parse(userStr);
        let username = userData.name || 'User';
        if (username.includes(' ')) {
            username = username.split(' ')[0];
        }
        
        // Update profile name if on profile tab
        const profileNameElement = document.querySelector('.text-2xl.font-bold');
        if (profileNameElement && profileNameElement.textContent?.includes('Tunde Bakare')) {
            profileNameElement.textContent = userData.name || username;
        }
        
        // Update email
        const emailInput = document.querySelector('input[type="email"]');
        if (emailInput && emailInput.value === 'tunde@errand.ng') {
            emailInput.value = userData.email || '';
        }
        
        // Update name input
        const nameInput = document.querySelector('input[value="Tunde Bakare"]');
        if (nameInput) {
            nameInput.value = userData.name || username;
        }
    } catch (error) {
        console.error('Error updating profile:', error);
    }
}

// Run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        updateGreeting();
        setTimeout(updateProfileInfo, 500);
    });
} else {
    updateGreeting();
    setTimeout(updateProfileInfo, 500);
}

// Listen for tab changes
const originalRenderPage = window.renderPage;
if (originalRenderPage) {
    window.renderPage = function(tab) {
        originalRenderPage(tab);
        if (tab === 'profile') {
            setTimeout(updateProfileInfo, 100);
        }
    };
}

/* ===========================
   LOGOUT + CONFIRM MODAL (JS-only)
   Paste this at the BOTTOM of customer-dashboard.js
=========================== */

(function () {
  // ---- Config: storage keys you use
  const STORAGE_KEYS = [
    "auth_token",
    "user",
    "token",
    "access_token",
    "refresh_token",
  ];

  function getApiBase() {
    // If you already have a config, replace this.
    // This assumes same-origin API (Render serves both or you proxy).
    return "";
  }

  function getSignInUrl() {
    // Works for both local "/frontend/" and production root
    const p = window.location.pathname || "";
    return p.includes("/frontend/") ? "/frontend/sign-in.html" : "/sign-in.html";
  }

  function clearAuthStorage() {
    try {
      STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      STORAGE_KEYS.forEach((k) => sessionStorage.removeItem(k));
      // Also clear anything auth-ish you might have added later
      localStorage.removeItem("oauth_state");
      localStorage.removeItem("oauth_redirect_uri");
      localStorage.removeItem("oauth_action");
    } catch (e) {
      console.warn("Failed to clear storage:", e);
    }
  }

  async function callBackendLogout() {
    // Best-effort: if you use cookies/session on backend, include credentials
    try {
      const res = await fetch(`${getApiBase()}/api/auth/logout`, {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" },
      });

      // Not required to be 200; logout should still proceed client-side
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function ensureLogoutModal() {
    let overlay = document.getElementById("logoutModalOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "logoutModalOverlay";
    overlay.className =
      "fixed inset-0 z-[200] hidden items-center justify-center p-4";
    overlay.innerHTML = `
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
      <div class="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div class="p-5">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <span class="material-symbols-outlined">logout</span>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-bold text-slate-900">Log out?</h3>
              <p class="text-sm text-slate-600 mt-1">
                This will clear your session on this device.
              </p>
            </div>
          </div>

          <div class="mt-5 flex gap-3">
            <button id="logoutCancelBtn"
              class="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50">
              Cancel
            </button>
            <button id="logoutConfirmBtn"
              class="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">
              Log out
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // close if click outside card
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target === overlay.firstElementChild) {
        hideLogoutModal();
      }
    });

    // buttons
    overlay.querySelector("#logoutCancelBtn").addEventListener("click", hideLogoutModal);
    overlay.querySelector("#logoutConfirmBtn").addEventListener("click", performLogout);

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

    // 1) backend best-effort
    await callBackendLogout();

    // 2) clear client tokens/session
    clearAuthStorage();

    // 3) redirect to sign-in
    window.location.href = getSignInUrl();
  }

  function injectLogoutButtonIntoSidebar() {
    const sidebar = document.getElementById("desktopSidebar");
    if (!sidebar) return;

    // Avoid duplicates
    if (document.getElementById("sidebarLogoutWrap")) return;

    // Try to place it near the bottom (above version footer if present)
    const footer = sidebar.querySelector(".p-4.border-t.border-slate-100.text-xs");
    const wrap = document.createElement("div");
    wrap.id = "sidebarLogoutWrap";
    wrap.className = "p-4 border-t border-slate-100";

    wrap.innerHTML = `
      <button id="sidebarLogoutBtn"
        class="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors">
        <span class="material-symbols-outlined">logout</span>
        <span>Log out</span>
      </button>
    `;

    if (footer && footer.parentElement) {
      footer.parentElement.insertBefore(wrap, footer);
    } else {
      sidebar.appendChild(wrap);
    }

    wrap.querySelector("#sidebarLogoutBtn").addEventListener("click", (e) => {
      e.preventDefault();
      showLogoutModal();
    });
  }

  function wireProfileLogoutButtonIfExists(root = document) {
    // Your profile tab has: "Log out (UI only)" — we’ll make it real
    const btns = Array.from(root.querySelectorAll("button"));
    const logoutBtn = btns.find((b) =>
      (b.textContent || "").toLowerCase().includes("log out")
    );

    if (logoutBtn && !logoutBtn.dataset.logoutWired) {
      logoutBtn.dataset.logoutWired = "true";
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showLogoutModal();
      });
    }
  }

  function observeDynamicContent() {
    // Your tab content swaps inside #pageContainer
    const container = document.getElementById("pageContainer");
    if (!container) return;

    const obs = new MutationObserver(() => {
      wireProfileLogoutButtonIfExists(container);
    });

    obs.observe(container, { childList: true, subtree: true });
  }

  // ---- init
  function initLogoutFeature() {
    injectLogoutButtonIntoSidebar();
    ensureLogoutModal();
    wireProfileLogoutButtonIfExists(document);
    observeDynamicContent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLogoutFeature);
  } else {
    initLogoutFeature();
  }
})();