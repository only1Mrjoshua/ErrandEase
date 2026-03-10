// agent-verification.js - Agent verification page

(function() {
    // Guard to prevent double initialization
    if (window.agentVerificationInitialized) {
        console.log('Agent verification already initialized, skipping...');
        return;
    }
    
    window.agentVerificationInitialized = true;
    console.log('Initializing agent verification...');

    // DOM Elements
    const form = document.getElementById('verificationForm');
    const submitBtn = document.getElementById('submitBtn');
    const ninInput = document.getElementById('ninNumber');
    const passportInput = document.getElementById('passportPhoto');
    const ninCardInput = document.getElementById('ninCardImage');
    const proofInput = document.getElementById('proofOfAddress');
    
    // File name displays
    const passportName = document.getElementById('passportPhotoName');
    const ninCardName = document.getElementById('ninCardImageName');
    const proofName = document.getElementById('proofOfAddressName');
    
    // Rejection message
    const rejectionMessage = document.getElementById('rejectionMessage');
    const rejectionReason = document.getElementById('rejectionReason');

    // Check authentication and verification status on load
    async function checkAuthAndStatus() {
        // Wait for agentAuth to be initialized
        if (!window.agentAuth) {
            console.log('Waiting for agentAuth to initialize...');
            setTimeout(checkAuthAndStatus, 500);
            return;
        }

        // Check if authenticated
        if (!window.agentAuth.isAuthenticated()) {
            redirectToSignIn();
            return;
        }

        // Check if user is agent
        if (!window.agentAuth.isAgent()) {
            redirectToCustomerDashboard();
            return;
        }

        // Get verification status
        try {
            const response = await window.agentAuth.authenticatedFetch(
                `${window.BACKEND_URL}/api/agent/verification/status`
            );
            
            if (response && response.ok) {
                const status = await response.json();
                console.log('Verification status:', status);
                
                // If already pending or approved, redirect to dashboard
                if (status.verification_status === 'pending') {
                    window.location.href = getEnvironmentUrl('/agent-dashboard.html');
                    return;
                }
                
                if (status.verification_status === 'approved') {
                    window.location.href = getEnvironmentUrl('/agent-dashboard.html');
                    return;
                }
                
                // If rejected, show rejection message
                if (status.verification_status === 'rejected' && status.rejection_reason) {
                    rejectionMessage.classList.remove('hidden');
                    rejectionReason.textContent = status.rejection_reason;
                }
            }
        } catch (error) {
            console.error('Error checking verification status:', error);
        }
    }

    function getEnvironmentUrl(path) {
        const isDev = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
        if (isDev) {
            return `/frontend${path}`;
        }
        return path;
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

    // File validation
    function validateFileType(file, allowedTypes) {
        return allowedTypes.includes(file.type);
    }

    function validateFileSize(file, maxSizeMB = 5) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return file.size <= maxSizeBytes;
    }

    // File input change handlers with validation feedback
    passportInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const isValidType = validateFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
            const isValidSize = validateFileSize(file);
            
            if (isValidType && isValidSize) {
                passportName.textContent = file.name;
                document.getElementById('passportPhotoLabel').classList.add('has-file');
                document.getElementById('passportPhotoLabel').classList.remove('border-red-300');
            } else {
                this.value = ''; // Clear invalid file
                passportName.textContent = '';
                document.getElementById('passportPhotoLabel').classList.remove('has-file');
                document.getElementById('passportPhotoLabel').classList.add('border-red-300');
                alert('Passport photo must be an image (JPEG, PNG, WebP) and less than 5MB');
            }
        } else {
            passportName.textContent = '';
            document.getElementById('passportPhotoLabel').classList.remove('has-file');
        }
    });

    ninCardInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const isValidType = validateFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
            const isValidSize = validateFileSize(file);
            
            if (isValidType && isValidSize) {
                ninCardName.textContent = file.name;
                document.getElementById('ninCardImageLabel').classList.add('has-file');
                document.getElementById('ninCardImageLabel').classList.remove('border-red-300');
            } else {
                this.value = '';
                ninCardName.textContent = '';
                document.getElementById('ninCardImageLabel').classList.remove('has-file');
                document.getElementById('ninCardImageLabel').classList.add('border-red-300');
                alert('NIN card image must be an image (JPEG, PNG, WebP) and less than 5MB');
            }
        } else {
            ninCardName.textContent = '';
            document.getElementById('ninCardImageLabel').classList.remove('has-file');
        }
    });

    proofInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            // Allow images and PDF for proof of address
            const isValidType = validateFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']);
            const isValidSize = validateFileSize(file);
            
            if (isValidType && isValidSize) {
                proofName.textContent = file.name;
                document.getElementById('proofOfAddressLabel').classList.add('has-file');
                document.getElementById('proofOfAddressLabel').classList.remove('border-red-300');
            } else {
                this.value = '';
                proofName.textContent = '';
                document.getElementById('proofOfAddressLabel').classList.remove('has-file');
                document.getElementById('proofOfAddressLabel').classList.add('border-red-300');
                alert('Proof of address must be an image (JPEG, PNG, WebP) or PDF and less than 5MB');
            }
        } else {
            proofName.textContent = '';
            document.getElementById('proofOfAddressLabel').classList.remove('has-file');
        }
    });

    // NIN input validation
    ninInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);
    });

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate NIN
        if (!/^\d{11}$/.test(ninInput.value)) {
            if (window.agentAuth) {
                window.agentAuth.showNotification('Please enter a valid 11-digit NIN', 'error');
            } else {
                alert('Please enter a valid 11-digit NIN');
            }
            return;
        }

        // Validate files
        if (!passportInput.files || !passportInput.files[0]) {
            if (window.agentAuth) {
                window.agentAuth.showNotification('Please upload your passport photograph', 'error');
            } else {
                alert('Please upload your passport photograph');
            }
            return;
        }

        if (!ninCardInput.files || !ninCardInput.files[0]) {
            if (window.agentAuth) {
                window.agentAuth.showNotification('Please upload your NIN card image', 'error');
            } else {
                alert('Please upload your NIN card image');
            }
            return;
        }

        if (!proofInput.files || !proofInput.files[0]) {
            if (window.agentAuth) {
                window.agentAuth.showNotification('Please upload your proof of address', 'error');
            } else {
                alert('Please upload your proof of address');
            }
            return;
        }

        // Validate file types and sizes again
        const passportFile = passportInput.files[0];
        const ninCardFile = ninCardInput.files[0];
        const proofFile = proofInput.files[0];
        
        if (!validateFileType(passportFile, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])) {
            window.agentAuth.showNotification('Passport photo must be an image (JPEG, PNG, WebP)', 'error');
            return;
        }
        
        if (!validateFileType(ninCardFile, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])) {
            window.agentAuth.showNotification('NIN card image must be an image (JPEG, PNG, WebP)', 'error');
            return;
        }
        
        if (!validateFileType(proofFile, ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'])) {
            window.agentAuth.showNotification('Proof of address must be an image or PDF', 'error');
            return;
        }
        
        if (!validateFileSize(passportFile) || !validateFileSize(ninCardFile) || !validateFileSize(proofFile)) {
            window.agentAuth.showNotification('All files must be less than 5MB', 'error');
            return;
        }

        // Disable submit button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        
        if (window.agentAuth) {
            window.agentAuth.showLoading('Submitting verification...');
        }

        try {
            // Create form data
            const formData = new FormData();
            formData.append('nin_number', ninInput.value);
            formData.append('passport_photo', passportInput.files[0]);
            formData.append('nin_card_image', ninCardInput.files[0]);
            formData.append('proof_of_address', proofInput.files[0]);

            // Submit verification
            const response = await fetch(`${window.BACKEND_URL}/api/agent/verification/submit`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Submission failed');
            }

            const data = await response.json();
            console.log('Submission successful:', data);

            if (window.agentAuth) {
                window.agentAuth.showNotification('Documents submitted successfully!', 'success');
            } else {
                alert('Documents submitted successfully!');
            }

            // Redirect to dashboard (will show pending state)
            setTimeout(() => {
                window.location.href = data.redirect_url;
            }, 1500);

        } catch (error) {
            console.error('Submission error:', error);
            if (window.agentAuth) {
                window.agentAuth.showNotification(error.message, 'error');
            } else {
                alert(error.message);
            }
            
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit for Verification';
        } finally {
            if (window.agentAuth) {
                window.agentAuth.hideLoading();
            }
        }
    });

    // Initialize
    // Wait for agentAuth to be ready
    const checkInterval = setInterval(() => {
        if (window.agentAuth) {
            clearInterval(checkInterval);
            checkAuthAndStatus();
        }
    }, 100);
})();