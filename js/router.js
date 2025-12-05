// Simple hash-based router for SPA navigation
const Router = (() => {
    const routes = {};
    let currentRoute = null;
    let beforeNavigateCallbacks = [];

    // Register a route with its handler
    function register(path, handler) {
        routes[path] = handler;
    }

    // Add a callback to run before navigation
    function beforeNavigate(callback) {
        beforeNavigateCallbacks.push(callback);
    }

    // Navigate to a specific route
    function navigate(path, params = {}) {
        // Run before navigate callbacks
        for (const callback of beforeNavigateCallbacks) {
            const result = callback(path, params);
            if (result === false) return; // Cancel navigation if callback returns false
        }

        // Update hash without triggering hashchange (we'll handle it manually)
        const hashPath = path.startsWith('#') ? path : `#${path}`;

        // Store params in sessionStorage for the route to access
        if (Object.keys(params).length > 0) {
            sessionStorage.setItem('routeParams', JSON.stringify(params));
        } else {
            sessionStorage.removeItem('routeParams');
        }

        // Update URL hash
        window.location.hash = hashPath;
    }

    // Get current route parameters
    function getParams() {
        const stored = sessionStorage.getItem('routeParams');
        return stored ? JSON.parse(stored) : {};
    }

    // Clear route parameters
    function clearParams() {
        sessionStorage.removeItem('routeParams');
    }

    // Handle route change
    function handleRouteChange() {
        const hash = window.location.hash.slice(1) || 'instances'; // Default to instances
        const path = hash.split('?')[0]; // Remove query string if present

        // Hide all pages first
        document.querySelectorAll('.page-container').forEach(page => {
            page.classList.add('d-none');
            page.classList.remove('active');
        });

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${path}`) {
                link.classList.add('active');
            }
        });

        // Find and execute route handler
        if (routes[path]) {
            currentRoute = path;
            const pageContainer = document.getElementById(`page-${path}`);
            if (pageContainer) {
                pageContainer.classList.remove('d-none');
                pageContainer.classList.add('active');
            }
            routes[path](getParams());
        } else {
            // Default to instances page if route not found
            console.warn(`Route not found: ${path}, redirecting to instances`);
            navigate('instances');
        }
    }

    // Initialize router
    function init() {
        // Listen for hash changes
        window.addEventListener('hashchange', handleRouteChange);

        // Handle initial route
        handleRouteChange();
    }

    // Get current route
    function getCurrentRoute() {
        return currentRoute;
    }

    return {
        register,
        navigate,
        getParams,
        clearParams,
        beforeNavigate,
        init,
        getCurrentRoute
    };
})();

window.Router = Router;
