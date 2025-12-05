// Authentication Page Handler
const AuthPage = (() => {
    let initialized = false;

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
                updateAuthStatus();
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
    function saveAuth() {
        const endpointSelect = document.getElementById('authEndpointSelect');
        const tokenInput = document.getElementById('authApiToken');
        const messageDiv = document.getElementById('authMessage');

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

        // Update auth status
        updateAuthStatus();

        // Show success message
        showMessage('Token saved successfully! You can now access your instances.', 'success');

        // Redirect to instances page after a short delay
        setTimeout(() => {
            Router.navigate('instances');
        }, 1500);
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

    // Update auth status in navbar
    function updateAuthStatus() {
        const statusText = document.getElementById('authStatusText');
        const authLink = document.getElementById('authNavLink');

        if (statusText && authLink) {
            if (API.isAuthenticated()) {
                statusText.textContent = 'Connected';
                authLink.classList.add('text-success');
                authLink.classList.remove('text-warning');
            } else {
                statusText.textContent = 'Setup Token';
                authLink.classList.add('text-warning');
                authLink.classList.remove('text-success');
            }
        }
    }

    // Route handler
    function onRoute(params) {
        init();
        loadSavedAuth();
    }

    return {
        init,
        onRoute,
        updateAuthStatus
    };
})();

window.AuthPage = AuthPage;
