// Configuration file for ErrandEase frontend
(function() {
    // Determine environment
    const isDevelopment = window.location.hostname === '127.0.0.1' || 
                         window.location.hostname === 'localhost';
    
    // Backend URL - make sure this is correct
    window.BACKEND_URL = isDevelopment 
        ? 'http://localhost:8000'  // Your FastAPI backend
        : 'https://errandeasebackend.onrender.com'; // Your production backend
    
    console.log('🔧 Environment:', isDevelopment ? 'Development' : 'Production');
    console.log('🔧 Backend URL:', window.BACKEND_URL);
    console.log('🔧 Auth mode: Token-based (Authorization headers)');
})();

