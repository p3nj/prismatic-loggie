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

    // Populate endpoint dropdown with options
    function populateEndpoints() {
        const select = document.getElementById('authEndpointSelect');
        if (!select) return;

        select.innerHTML = '';
        API.ENDPOINTS.forEach(endpoint => {
            const option = document.createElement('option');
            option.value = endpoint.value;
            option.textContent = endpoint.label;
            select.appendChild(option);
        });
    }

    // Load saved authentication config
    function loadSavedAuth() {
        const select = document.getElementById('authEndpointSelect');
        const tokenInput = document.getElementById('authApiToken');

        if (select) {
            const savedEndpoint = API.getEndpoint();
            select.value = savedEndpoint;
        }

        if (tokenInput) {
            const savedToken = API.getToken();
            if (savedToken) {
                tokenInput.value = savedToken;
            }
        }

        // Update auth status in navbar
        updateAuthStatus();
    }

    // Setup event listeners
    function setupEventListeners() {
        // Endpoint change - load token for that endpoint
        const endpointSelect = document.getElementById('authEndpointSelect');
        if (endpointSelect) {
            endpointSelect.addEventListener('change', () => {
                API.setEndpoint(endpointSelect.value);
                const tokenInput = document.getElementById('authApiToken');
                if (tokenInput) {
                    tokenInput.value = API.getToken();
                }
                // Clear cache and re-validate for new endpoint
                validationCache = { endpoint: null, token: null, result: null };
                updateAuthStatus(true);
            });
        }

        // Save button
        const saveBtn = document.getElementById('saveAuthButton');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveAuth);
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
                const tokenInput = document.getElementById('authApiToken');
                const icon = toggleBtn.querySelector('i');
                if (tokenInput.type === 'password') {
                    tokenInput.type = 'text';
                    icon.classList.replace('bi-eye', 'bi-eye-slash');
                } else {
                    tokenInput.type = 'password';
                    icon.classList.replace('bi-eye-slash', 'bi-eye');
                }
            });
        }
    }

    // Save authentication
    async function saveAuth() {
        const endpointSelect = document.getElementById('authEndpointSelect');
        const tokenInput = document.getElementById('authApiToken');
        const saveBtn = document.getElementById('saveAuthButton');

        if (!tokenInput || !endpointSelect) return;

        const token = tokenInput.value.trim();
        const endpoint = endpointSelect.value;

        if (!token) {
            showMessage('Please enter an API token.', 'warning');
            return;
        }

        // Save endpoint and token
        API.setEndpoint(endpoint);
        API.setToken(token);

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
            showMessage(`Connected successfully${userName ? ` as ${userName}` : ''}!`, 'success');

            // Redirect to instances page after a short delay
            setTimeout(() => {
                Router.navigate('instances');
            }, 1000);
        } else {
            // Update auth status to show expired
            await updateAuthStatus(true);

            // Show error message
            if (result.reason === 'expired') {
                showMessage('Token is invalid or expired. Please get a new token from Prismatic.', 'danger');
            } else if (result.reason === 'network') {
                showMessage('Network error. Please check your connection and try again.', 'danger');
            } else {
                showMessage('Failed to validate token. Please try again.', 'danger');
            }
        }
    }

    // Show message
    function showMessage(text, type) {
        const messageDiv = document.getElementById('authMessage');
        if (!messageDiv) return;

        messageDiv.className = `alert alert-${type} mt-3`;
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
