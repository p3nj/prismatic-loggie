// Authentication Page Handler
const AuthPage = (() => {
    let initialized = false;
    let validationCache = { endpoint: null, token: null, result: null };

    // Initialize the auth page
    function init() {
        if (initialized) return;

        // Populate endpoint options
        populateEndpoints();

        // Load saved config
        loadSavedAuth();

        // Setup event listeners
        setupEventListeners();

        initialized = true;
    }

    // Populate endpoint dropdown with options (supports both page and navbar dropdown)
    function populateEndpoints() {
        // Populate page dropdown
        const select = document.getElementById('authEndpointSelect');
        if (select) {
            select.innerHTML = '';
            API.ENDPOINTS.forEach(endpoint => {
                const option = document.createElement('option');
                option.value = endpoint.value;
                option.textContent = endpoint.label;
                select.appendChild(option);
            });
        }

        // Populate navbar dropdown
        const dropdownSelect = document.getElementById('authEndpointDropdown');
        if (dropdownSelect) {
            dropdownSelect.innerHTML = '';
            API.ENDPOINTS.forEach(endpoint => {
                const option = document.createElement('option');
                option.value = endpoint.value;
                option.textContent = endpoint.label;
                dropdownSelect.appendChild(option);
            });
        }
    }

    // Load saved authentication config (supports both page and navbar dropdown)
    function loadSavedAuth() {
        const savedEndpoint = API.getEndpoint();
        const savedToken = API.getToken();

        // Page elements
        const select = document.getElementById('authEndpointSelect');
        const tokenInput = document.getElementById('authApiToken');

        if (select) {
            select.value = savedEndpoint;
        }

        if (tokenInput && savedToken) {
            tokenInput.value = savedToken;
        }

        // Navbar dropdown elements
        const dropdownSelect = document.getElementById('authEndpointDropdown');
        const dropdownTokenInput = document.getElementById('authApiTokenDropdown');

        if (dropdownSelect) {
            dropdownSelect.value = savedEndpoint;
        }

        if (dropdownTokenInput && savedToken) {
            dropdownTokenInput.value = savedToken;
        }

        // Update auth status in navbar
        updateAuthStatus();
    }

    // Check if viewport is mobile-sized
    function isMobileView() {
        return window.innerWidth < 992;
    }

    // Setup event listeners (supports both page and navbar dropdown)
    function setupEventListeners() {
        // === Page elements ===
        // Endpoint change - load token for that endpoint
        const endpointSelect = document.getElementById('authEndpointSelect');
        if (endpointSelect) {
            endpointSelect.addEventListener('change', () => {
                handleEndpointChange(endpointSelect.value, 'authApiToken', 'authEndpointDropdown', 'authApiTokenDropdown');
            });
        }

        // Save button
        const saveBtn = document.getElementById('saveAuthButton');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => saveAuth('page'));
        }

        // Get token link
        const getTokenBtn = document.getElementById('getTokenLink');
        if (getTokenBtn) {
            getTokenBtn.addEventListener('click', () => {
                window.open(API.getTokenUrl(), '_blank');
            });
        }

        // Toggle token visibility
        const toggleBtn = document.getElementById('toggleTokenVisibility');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                toggleTokenVisibility('authApiToken', toggleBtn);
            });
        }

        // === Navbar auth link - redirect to full page on mobile ===
        const authNavLink = document.getElementById('authNavLink');
        if (authNavLink) {
            authNavLink.addEventListener('click', (e) => {
                if (isMobileView()) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Collapse the navbar menu
                    const navbarCollapse = document.getElementById('navbarNav');
                    const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
                    if (bsCollapse) bsCollapse.hide();
                    // Navigate to full-page auth
                    Router.navigate('auth');
                }
            });
        }

        // === Navbar dropdown elements ===
        // Endpoint change for dropdown
        const dropdownEndpointSelect = document.getElementById('authEndpointDropdown');
        if (dropdownEndpointSelect) {
            dropdownEndpointSelect.addEventListener('change', () => {
                handleEndpointChange(dropdownEndpointSelect.value, 'authApiTokenDropdown', 'authEndpointSelect', 'authApiToken');
            });
        }

        // Save button for dropdown
        const dropdownSaveBtn = document.getElementById('saveAuthDropdownButton');
        if (dropdownSaveBtn) {
            dropdownSaveBtn.addEventListener('click', () => saveAuth('dropdown'));
        }

        // Get token link for dropdown
        const dropdownGetTokenBtn = document.getElementById('getTokenDropdownLink');
        if (dropdownGetTokenBtn) {
            dropdownGetTokenBtn.addEventListener('click', () => {
                window.open(API.getTokenUrl(), '_blank');
            });
        }

        // Toggle token visibility for dropdown
        const dropdownToggleBtn = document.getElementById('toggleTokenVisibilityDropdown');
        if (dropdownToggleBtn) {
            dropdownToggleBtn.addEventListener('click', () => {
                toggleTokenVisibility('authApiTokenDropdown', dropdownToggleBtn);
            });
        }
    }

    // Handle endpoint change - sync both forms
    function handleEndpointChange(newEndpoint, tokenInputId, otherEndpointId, otherTokenInputId) {
        API.setEndpoint(newEndpoint);

        // Update current token input
        const tokenInput = document.getElementById(tokenInputId);
        if (tokenInput) {
            tokenInput.value = API.getToken() || '';
        }

        // Sync other form
        const otherEndpoint = document.getElementById(otherEndpointId);
        if (otherEndpoint) {
            otherEndpoint.value = newEndpoint;
        }

        const otherTokenInput = document.getElementById(otherTokenInputId);
        if (otherTokenInput) {
            otherTokenInput.value = API.getToken() || '';
        }

        // Clear cache and re-validate for new endpoint
        validationCache = { endpoint: null, token: null, result: null };
        updateAuthStatus(true);
    }

    // Toggle token visibility
    function toggleTokenVisibility(tokenInputId, toggleBtn) {
        const tokenInput = document.getElementById(tokenInputId);
        const icon = toggleBtn.querySelector('i');
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            icon.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            tokenInput.type = 'password';
            icon.classList.replace('bi-eye-slash', 'bi-eye');
        }
    }

    // Save authentication (supports both page and dropdown modes)
    async function saveAuth(mode = 'page') {
        const isDropdown = mode === 'dropdown';

        const endpointSelect = document.getElementById(isDropdown ? 'authEndpointDropdown' : 'authEndpointSelect');
        const tokenInput = document.getElementById(isDropdown ? 'authApiTokenDropdown' : 'authApiToken');
        const saveBtn = document.getElementById(isDropdown ? 'saveAuthDropdownButton' : 'saveAuthButton');
        const messageId = isDropdown ? 'authDropdownMessage' : 'authMessage';

        if (!tokenInput || !endpointSelect) return;

        const token = tokenInput.value.trim();
        const endpoint = endpointSelect.value;

        if (!token) {
            showMessage('Please enter an API token.', 'warning', messageId);
            return;
        }

        // Save endpoint and token
        API.setEndpoint(endpoint);
        API.setToken(token);

        // Sync to other form
        const otherEndpointId = isDropdown ? 'authEndpointSelect' : 'authEndpointDropdown';
        const otherTokenId = isDropdown ? 'authApiToken' : 'authApiTokenDropdown';
        const otherEndpoint = document.getElementById(otherEndpointId);
        const otherToken = document.getElementById(otherTokenId);
        if (otherEndpoint) otherEndpoint.value = endpoint;
        if (otherToken) otherToken.value = token;

        // Show validating state
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Validating...';
        }

        // Clear cache and validate the new token
        validationCache = { endpoint: null, token: null, result: null };
        const result = await API.validateToken();

        // Cache the result
        validationCache = { endpoint, token, result };

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Connect';
        }

        if (result.valid) {
            // Update auth status
            await updateAuthStatus(true);

            // Show success message with user info
            const userName = result.user?.name || result.user?.email || '';
            showMessage(`Connected successfully${userName ? ` as ${userName}` : ''}!`, 'success', messageId);

            // Close dropdown if in dropdown mode and redirect
            if (isDropdown) {
                const dropdown = bootstrap.Dropdown.getInstance(document.getElementById('authNavLink'));
                if (dropdown) {
                    setTimeout(() => dropdown.hide(), 800);
                }
            }

            // Redirect to instances page after a short delay
            setTimeout(() => {
                Router.navigate('instances');
            }, 1000);
        } else {
            // Update auth status to show expired
            await updateAuthStatus(true);

            // Show error message
            if (result.reason === 'expired') {
                showMessage('Token is invalid or expired. Please get a new token from Prismatic.', 'danger', messageId);
            } else if (result.reason === 'network') {
                showMessage('Network error. Please check your connection and try again.', 'danger', messageId);
            } else {
                showMessage('Failed to validate token. Please try again.', 'danger', messageId);
            }
        }
    }

    // Show message (supports both page and dropdown)
    function showMessage(text, type, elementId = 'authMessage') {
        const messageDiv = document.getElementById(elementId);
        if (!messageDiv) return;

        messageDiv.className = `alert alert-${type} small`;
        messageDiv.textContent = text;
        messageDiv.classList.remove('d-none');

        // Auto-hide after 5 seconds
        setTimeout(() => {
            messageDiv.classList.add('d-none');
        }, 5000);
    }

    // Update auth status in navbar (with actual token validation)
    async function updateAuthStatus(forceValidate = false) {
        const statusText = document.getElementById('authStatusText');
        const authLink = document.getElementById('authNavLink');

        if (!statusText || !authLink) return;

        const currentEndpoint = API.getEndpoint();
        const currentToken = API.getToken();

        // No token - show setup state
        if (!currentToken) {
            setAuthStatusUI(statusText, authLink, 'no_token');
            return;
        }

        // Check cache to avoid repeated API calls
        if (!forceValidate &&
            validationCache.endpoint === currentEndpoint &&
            validationCache.token === currentToken &&
            validationCache.result) {
            setAuthStatusUI(statusText, authLink, validationCache.result.valid ? 'valid' : 'expired');
            return;
        }

        // Show validating state
        setAuthStatusUI(statusText, authLink, 'validating');

        // Actually validate the token
        const result = await API.validateToken();

        // Cache the result
        validationCache = { endpoint: currentEndpoint, token: currentToken, result };

        if (result.valid) {
            setAuthStatusUI(statusText, authLink, 'valid', result.user?.name || result.user?.email);
        } else {
            setAuthStatusUI(statusText, authLink, 'expired');
        }
    }

    // Set the UI state for auth status
    function setAuthStatusUI(statusText, authLink, state, userName = null) {
        authLink.classList.remove('text-success', 'text-warning', 'text-danger', 'text-muted');

        switch (state) {
            case 'valid':
                statusText.textContent = userName ? `Connected (${userName})` : 'Connected';
                authLink.classList.add('text-success');
                break;
            case 'expired':
                statusText.textContent = 'Token Expired';
                authLink.classList.add('text-danger');
                break;
            case 'validating':
                statusText.textContent = 'Checking...';
                authLink.classList.add('text-muted');
                break;
            case 'no_token':
            default:
                statusText.textContent = 'Setup Token';
                authLink.classList.add('text-warning');
                break;
        }
    }

    // Route handler
    function onRoute(params) {
        init();
        loadSavedAuth();
    }

    // Clear validation cache (useful when token might have changed externally)
    function clearValidationCache() {
        validationCache = { endpoint: null, token: null, result: null };
    }

    return {
        init,
        onRoute,
        updateAuthStatus,
        clearValidationCache
    };
})();

window.AuthPage = AuthPage;
