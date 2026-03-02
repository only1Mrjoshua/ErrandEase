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