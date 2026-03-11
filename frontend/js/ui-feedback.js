// js/ui-feedback.js - Shared UI feedback system for ErrandEase dashboards
// Toast and modal system with consistent styling

(function() {
    // Guard to prevent double initialization
    if (window.errandEaseUI) {
        return;
    }

    // Container references
    let toastContainer = null;
    let modalContainer = null;
    let activeModal = null;

    // Create toast container if it doesn't exist
    function ensureToastContainer() {
        if (toastContainer) return toastContainer;
        
        toastContainer = document.getElementById('errandEaseToastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'errandEaseToastContainer';
            toastContainer.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    // Create modal container if it doesn't exist
    function ensureModalContainer() {
        if (modalContainer) return modalContainer;
        
        modalContainer = document.getElementById('errandEaseModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'errandEaseModalContainer';
            modalContainer.className = 'fixed inset-0 z-[9998] pointer-events-none';
            document.body.appendChild(modalContainer);
        }
        return modalContainer;
    }

    // Toast icons mapping
    const toastIcons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    // Toast colors mapping
    const toastColors = {
        success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        error: 'bg-red-50 border-red-200 text-red-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    const toastIconColors = {
        success: 'text-emerald-500',
        error: 'text-red-500',
        warning: 'text-amber-500',
        info: 'text-blue-500'
    };

    // Show toast notification
    function showToast(message, type = 'info', options = {}) {
        const {
            duration = 5000,
            dismissible = true
        } = options;

        const container = ensureToastContainer();
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `pointer-events-auto transform transition-all duration-300 ease-in-out translate-x-0 opacity-100 mb-2`;
        toast.setAttribute('role', 'alert');
        
        toast.innerHTML = `
            <div class="${toastColors[type]} border rounded-xl shadow-lg p-4 flex items-start gap-3">
                <span class="material-symbols-outlined ${toastIconColors[type]} text-2xl flex-shrink-0">
                    ${toastIcons[type]}
                </span>
                <div class="flex-1 text-sm font-medium pt-0.5">${escapeHtml(message)}</div>
                ${dismissible ? `
                    <button class="text-slate-400 hover:text-slate-600 transition-colors" onclick="(function(id){window.errandEaseUI?.dismissToast(id)})('${toastId}')">
                        <span class="material-symbols-outlined text-lg">close</span>
                    </button>
                ` : ''}
            </div>
        `;

        container.appendChild(toast);

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                dismissToast(toastId);
            }, duration);
        }

        return toastId;
    }

    // Dismiss toast
    function dismissToast(toastId) {
        const toast = document.getElementById(toastId);
        if (!toast) return;
        
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // Modal types configuration
    const modalIcons = {
        success: { icon: 'check_circle', color: 'text-emerald-500', bg: 'bg-emerald-50' },
        error: { icon: 'error', color: 'text-red-500', bg: 'bg-red-50' },
        warning: { icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-50' },
        info: { icon: 'info', color: 'text-blue-500', bg: 'bg-blue-50' },
        destructive: { icon: 'warning', color: 'text-red-500', bg: 'bg-red-50' },
        confirm: { icon: 'help', color: 'text-primary', bg: 'bg-primary/5' },
        logout: { icon: 'logout', color: 'text-red-500', bg: 'bg-red-50' }
    };

    // Show modal
    function showModal(options) {
        const {
            title = 'Confirm action',
            message = '',
            type = 'confirm', // confirm, destructive, success, error, warning, info, logout
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            onConfirm,
            onCancel,
            showCancel = true,
            destructive = false,
            loading = false
        } = options;

        // Close existing modal
        if (activeModal) {
            closeModal();
        }

        const container = ensureModalContainer();
        const modalId = 'modal-' + Date.now();
        
        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = modalId;
        modalBackdrop.className = 'absolute inset-0 flex items-center justify-center p-4 pointer-events-auto';
        
        const iconConfig = modalIcons[type] || modalIcons.info;
        const confirmButtonClass = destructive || type === 'destructive' || type === 'logout'
            ? 'bg-red-600 hover:bg-red-700 text-white font-bold'
            : 'bg-primary hover:bg-emerald-600 text-white font-bold';

        modalBackdrop.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px]" data-modal-close></div>
            <div class="relative bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden transform transition-all duration-200 scale-100">
                <div class="p-5">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl ${iconConfig.bg} flex items-center justify-center ${iconConfig.color} flex-shrink-0">
                            <span class="material-symbols-outlined text-2xl">${iconConfig.icon}</span>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-bold text-slate-900">${escapeHtml(title)}</h3>
                            <p class="text-sm text-slate-600 mt-1">${escapeHtml(message)}</p>
                        </div>
                    </div>
                    
                    <div class="mt-5 flex gap-3">
                        ${showCancel ? `
                            <button class="modal-cancel flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors" ${loading ? 'disabled' : ''}>
                                ${escapeHtml(cancelText)}
                            </button>
                        ` : ''}
                        <button class="modal-confirm flex-1 py-3 rounded-xl ${confirmButtonClass} transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}" ${loading ? 'disabled' : ''}>
                            ${loading ? 'Please wait...' : escapeHtml(confirmText)}
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(modalBackdrop);
        activeModal = { id: modalId, backdrop: modalBackdrop };

        // Close on backdrop click
        modalBackdrop.querySelectorAll('[data-modal-close]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!loading) {
                    closeModal();
                    if (onCancel) onCancel();
                }
            });
        });

        // Cancel button
        const cancelBtn = modalBackdrop.querySelector('.modal-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!loading) {
                    closeModal();
                    if (onCancel) onCancel();
                }
            });
        }

        // Confirm button
        const confirmBtn = modalBackdrop.querySelector('.modal-confirm');
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!loading && onConfirm) {
                onConfirm();
            }
        });

        // Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape' && !loading) {
                closeModal();
                if (onCancel) onCancel();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Store cleanup
        const originalClose = closeModal;
        window.errandEaseUI.closeModal = () => {
            document.removeEventListener('keydown', escapeHandler);
            originalClose();
        };

        return modalId;
    }

    // Close modal
    function closeModal() {
        if (activeModal) {
            const modal = document.getElementById(activeModal.id);
            if (modal) {
                modal.remove();
            }
            activeModal = null;
        }
    }

    // Show confirm modal (convenience)
    function showConfirm(options) {
        return showModal({
            type: 'confirm',
            ...options
        });
    }

    // Show destructive confirm modal
    function showDestructiveConfirm(options) {
        return showModal({
            type: 'destructive',
            destructive: true,
            ...options
        });
    }

    // Show alert modal
    function showAlert(options) {
        const {
            title = 'Notice',
            message = '',
            type = 'info',
            buttonText = 'OK',
            onClose
        } = options;

        return showModal({
            title,
            message,
            type,
            confirmText: buttonText,
            showCancel: false,
            onConfirm: () => {
                closeModal();
                if (onClose) onClose();
            }
        });
    }

    // Show logout modal
    function showLogoutModal(onConfirm) {
        return showModal({
            title: 'Log out?',
            message: 'This will clear your session on this device.',
            type: 'logout',
            confirmText: 'Log out',
            cancelText: 'Cancel',
            destructive: true,
            onConfirm: () => {
                closeModal();
                if (onConfirm) onConfirm();
            }
        });
    }

    // Helper escape function
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Public API
    window.errandEaseUI = {
        showToast,
        dismissToast,
        showModal,
        showConfirm,
        showDestructiveConfirm,
        showAlert,
        showLogoutModal,
        closeModal
    };

    // Add global styles for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        #errandEaseToastContainer > div {
            animation: slideIn 0.3s ease-out;
        }
    `;
    document.head.appendChild(style);

})();