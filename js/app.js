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
    // Trigger now lives inside the Instances page (Executions ⇄ Trigger toggle).
    // Redirect the legacy #trigger route there.
    Router.register('trigger', () => Router.navigate('instances'));

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

    // A present-but-invalid/expired token surfaces as a 401 from any API call.
    // Route it to the SAME canonical "connect" state as the no-token case, on
    // whichever page is currently active. Debounced so parallel 401s don't spam.
    let _authInvalidAt = 0;
    const PAGE_NOUNS = {
        'page-analysis': 'organization analytics',
        'page-instances': 'instances',
        'page-config': 'instance configuration',
        'page-execution': 'execution logs',
        'page-trigger': 'the flow trigger',
        'page-integrations': 'integrations'
    };
    window.addEventListener('prismatic:auth-invalid', () => {
        const now = Date.now();
        if (now - _authInvalidAt < 3000) return;
        _authInvalidAt = now;

        if (AuthPage.clearValidationCache) AuthPage.clearValidationCache();
        AuthPage.updateAuthStatus();

        const active = document.querySelector('.page-container:not(.d-none)');
        if (active && active.id && active.id !== 'page-auth' && UI.showAuthRequired) {
            UI.showAuthRequired(active.id, PAGE_NOUNS[active.id] || 'this data');
        }
        AuthPage.openSetup();
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
