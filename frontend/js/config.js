// Environment detection
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Backend URL configuration
const BACKEND_URL = isLocalhost
    ? 'http://localhost:8000'                   
    : 'https://errandeasebackend.onrender.com';

// Security configuration
const SECURITY_CONFIG = {
    // Don't store tokens in localStorage - use HttpOnly cookies
    useLocalStorage: false,
    
    // Always use credentials: 'include' for cookie-based auth
    fetchOptions: {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        }
    }
};

console.log('🔧 Environment:', isLocalhost ? 'Development' : 'Production');
console.log('🔧 Backend URL:', BACKEND_URL);