// Environment detection
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Backend URL configuration
const BACKEND_URL = isLocalhost
    ? 'http://localhost:8000'                   
    : 'https://errandeasebackend.onrender.com';

// Security configuration for token-based auth
const SECURITY_CONFIG = {
    // Using localStorage for tokens (with XSS precautions)
    useLocalStorage: true,
    tokenKey: 'access_token',
    refreshTokenKey: 'refresh_token',
    userKey: 'user',
    
    // Default fetch options without credentials
    fetchOptions: {
        headers: {
            'Content-Type': 'application/json',
        }
    },
    
    // Helper to add auth header
    getAuthHeaders: (token) => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    })
};

console.log('🔧 Environment:', isLocalhost ? 'Development' : 'Production');
console.log('🔧 Backend URL:', BACKEND_URL);
console.log('🔧 Auth mode: Token-based (Authorization headers)');