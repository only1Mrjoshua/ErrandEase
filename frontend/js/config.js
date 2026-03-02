const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'                   
    : 'https://errandeasebackend.onrender.com';   

console.log('🔧 Backend URL:', BACKEND_URL);