// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    UI.initTheme();

    // Initialize auth (populates dropdowns and sets up event listeners)
    AuthPage.init();

    // Update auth status in navbar
    AuthPage.updateAuthStatus();

    // Register routes
    Router.register('auth', AuthPage.onRoute);
    Router.register('instances', InstancesPage.onRoute);
    Router.register('integrations', IntegrationsPage.onRoute);
    Router.register('config', ConfigPage.onRoute);
    Router.register('analysis', AnalysisPage.onRoute);
    Router.register('execution', ExecutionPage.onRoute);

    // Tear down the outgoing page on EVERY route change. This must be an
    // onRouteChange hook, not beforeNavigate: navbar links are plain #<hash>
    // anchors that fire hashchange without going through Router.navigate(), and
    // Back/Forward fire popstate — in both cases beforeNavigate never runs, so
    // live-poll timers and charts would otherwise leak and keep hitting the API
    // after the user has left the page.
    Router.onRouteChange(() => {
        if (typeof ExecutionPage !== 'undefined' && ExecutionPage.stopPolling) {
            ExecutionPage.stopPolling();
        }
        if (typeof InstancesPage !== 'undefined' && InstancesPage.stopExecPolling) {
            InstancesPage.stopExecPolling();
        }
        if (typeof AnalysisPage !== 'undefined' && AnalysisPage.cleanup) {
            AnalysisPage.cleanup();
        }
    });

    // Auth check (can cancel navigation). Runs only via Router.navigate().
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
            if (navbarCollapse && navbarToggler && navbarCollapse.classList.contains('show')) {
                navbarToggler.click();
            }
        });
    });
});
