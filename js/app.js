// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    UI.initTheme();

    // Update auth status in navbar
    AuthPage.updateAuthStatus();

    // Register routes
    Router.register('auth', AuthPage.onRoute);
    Router.register('instances', InstancesPage.onRoute);
    Router.register('execution', ExecutionPage.onRoute);

    // Add before navigate callback to check authentication for protected routes
    Router.beforeNavigate((path, params) => {
        // Auth page is always accessible
        if (path === 'auth') return true;

        // For other pages, warn if not authenticated but still allow navigation
        if (!API.isAuthenticated()) {
            console.log('User not authenticated, but allowing navigation to:', path);
        }

        return true;
    });

    // Initialize router
    Router.init();

    // Handle navbar collapse on mobile after clicking a link
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (navbarCollapse.classList.contains('show')) {
                navbarToggler.click();
            }
        });
    });
});
