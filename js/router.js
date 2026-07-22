// Hash-based SPA router. The hash is a single URL-safe base64 token that
// encodes both the route and its params: #<base64>. UrlState owns the codec.
//
// LEGACY: handleRouteChange also accepts the old `#route?key=value&f=...` form
// and immediately rewrites it to base64 via history.replaceState. Safe to
// delete the legacy branch once any shared old links have aged out.
const Router = (() => {
    const routes = {};
    let currentRoute = null;
    let beforeNavigateCallbacks = [];
    let pageContainers = null;
    let navLinks = null;
    let redirectingToDefault = false;

    // Memoized decode for the current hash so repeated getParams() calls in
    // one render don't re-base64-decode.
    let decodedCacheHash = null;
    let decodedCacheValue = null;

    function getDecoded() {
        const hash = window.location.hash.slice(1);
        if (decodedCacheHash === hash) return decodedCacheValue;
        const decoded = UrlState.decode(hash);
        decodedCacheHash = hash;
        decodedCacheValue = decoded;
        return decoded;
    }

    function invalidateDecodeCache() {
        decodedCacheHash = null;
        decodedCacheValue = null;
    }

    function register(path, handler) {
        routes[path] = handler;
    }

    function beforeNavigate(callback) {
        beforeNavigateCallbacks.push(callback);
    }

    // Teardown callbacks run on EVERY actual route change (hashchange, popstate
    // or navigate), unlike beforeNavigate which only fires inside navigate().
    // This is where page cleanup (stopping live-poll timers, destroying charts)
    // must live, because navbar links are plain #<hash> anchors that fire
    // hashchange without ever going through navigate().
    let routeChangeCallbacks = [];
    function onRouteChange(callback) {
        routeChangeCallbacks.push(callback);
    }
    function runRouteChange() {
        for (const cb of routeChangeCallbacks) {
            try { cb(); } catch (e) { console.error('onRouteChange callback threw:', e); }
        }
    }

    function runBeforeNavigate(route, params) {
        for (const cb of beforeNavigateCallbacks) {
            try {
                if (cb(route, params) === false) return false;
            } catch (e) {
                console.error('beforeNavigate callback threw:', e);
            }
        }
        return true;
    }

    function navigate(route, params = {}) {
        if (!runBeforeNavigate(route, params)) return;
        const href = UrlState.buildHref(route, params);
        if (window.location.hash === href || (href === '#' && !window.location.hash)) {
            // Same target — force a route handler run. Clear the dedupe baseline
            // first, otherwise handleRouteChange short-circuits on the identical
            // hash and the forced re-run never happens.
            lastRenderedHash = null;
            handleRouteChange();
        } else {
            window.location.hash = href;
        }
    }

    // Replace current history entry without triggering navigation callbacks.
    // Used for in-page state sync (e.g., applyFilters, executionId updates).
    function replaceState(route, params = {}, historyState = null) {
        const href = UrlState.buildHref(route, params);
        const fullUrl = `${location.pathname}${location.search}${href}`;
        if (window.location.hash !== href) {
            window.history.replaceState(historyState, '', fullUrl);
            invalidateDecodeCache();
            // Keep the dedupe baseline aligned with the URL we just wrote, so a
            // later navigate() back to the previous hash isn't dropped as a
            // "same hash" no-op. Read back the browser-normalized hash.
            lastRenderedHash = window.location.hash;
        }
    }

    function getParams() {
        return getDecoded()?.params || {};
    }

    // Params live entirely in the URL token now, so there's nothing to clear
    // off-URL. Kept as a no-op so legacy callers (execution.js) keep working
    // without inadvertently rewriting the URL mid-route-handler.
    function clearParams() { /* no-op */ }

    // LEGACY: parse the pre-base64 URL form (#route?k=v&f=...).
    function parseLegacy(hash) {
        if (!hash || !hash.includes('?')) return null;
        const [route, query] = hash.split('?');
        if (!route) return null;
        const usp = new URLSearchParams(query);
        const params = {};
        for (const [k, v] of usp) {
            if (k === 'f') {
                // Old base64 filter blob; expand back into top-level params.
                try {
                    const padded = v.replace(/-/g, '+').replace(/_/g, '/');
                    const json = decodeURIComponent(escape(atob(padded)));
                    const filters = JSON.parse(json);
                    Object.assign(params, filters);
                } catch (e) { /* ignore */ }
            } else {
                params[k] = v;
            }
        }
        return { route, params };
    }

    function resolveCurrentState() {
        const hash = window.location.hash.slice(1);
        if (!hash) return { route: UrlState.DEFAULT_ROUTE, params: {} };

        // Modern: base64 token.
        const decoded = UrlState.decode(hash);
        if (decoded) return decoded;

        // LEGACY: old #route?... URLs; decode and upgrade in place.
        const legacy = parseLegacy(hash);
        if (legacy) {
            const upgraded = UrlState.buildHref(legacy.route, legacy.params);
            const fullUrl = `${location.pathname}${location.search}${upgraded}`;
            window.history.replaceState(null, '', fullUrl);
            invalidateDecodeCache();
            return legacy;
        }
        return null;
    }

    let lastRenderedHash = null;

    function handleRouteChange() {
        invalidateDecodeCache();
        // Both hashchange and popstate can fire for a single navigation.
        // Dedupe so onRoute (and any auto-load it triggers) runs once.
        const currentHash = window.location.hash;
        if (currentHash === lastRenderedHash) return;
        lastRenderedHash = currentHash;

        // Tear down the outgoing page (stop pollers, destroy charts) before we
        // render the next one. Runs for every real route change, including
        // navbar-anchor hashchanges and Back/Forward popstate.
        runRouteChange();

        const state = resolveCurrentState();

        if (!state || !routes[state.route]) {
            if (redirectingToDefault) {
                // Already redirecting once — give up, render nothing, log.
                console.warn('Router: default route missing or recursive redirect; aborting.');
                redirectingToDefault = false;
                return;
            }
            redirectingToDefault = true;
            console.warn(`Route not found, redirecting to ${UrlState.DEFAULT_ROUTE}`);
            navigate(UrlState.DEFAULT_ROUTE);
            return;
        }
        redirectingToDefault = false;

        const { route, params } = state;
        currentRoute = route;

        if (pageContainers) {
            pageContainers.forEach(page => {
                page.classList.add('d-none');
                page.classList.remove('active');
            });
        }
        if (navLinks) {
            navLinks.forEach(link => link.classList.remove('active'));
        }

        const pageContainer = document.getElementById(`page-${route}`);
        if (pageContainer) {
            pageContainer.classList.remove('d-none');
            pageContainer.classList.add('active');
        }
        // Mark the matching navbar link as active.
        if (navLinks) {
            navLinks.forEach(link => {
                if (link.getAttribute('data-route') === route) link.classList.add('active');
            });
        }

        routes[route](params);
    }

    function init() {
        pageContainers = document.querySelectorAll('.page-container');
        navLinks = document.querySelectorAll('.nav-link');

        // Rewrite static navbar hrefs (e.g. href="#analysis") to base64 form
        // and tag each link with its route so handleRouteChange can mark it
        // active without parsing the href string.
        navLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.startsWith('#') && href.length > 1) {
                const route = href.slice(1).split('?')[0];
                if (route) {
                    link.setAttribute('data-route', route);
                    link.setAttribute('href', UrlState.buildHref(route));
                }
            }
        });

        window.addEventListener('hashchange', handleRouteChange);

        // popstate fires for entries written via pushState/replaceState. The
        // hash also typically changes here, so hashchange would fire too, but
        // we route off popstate explicitly to handle same-hash state entries.
        window.addEventListener('popstate', () => handleRouteChange());

        handleRouteChange();
    }

    function getCurrentRoute() {
        return currentRoute;
    }

    return {
        register,
        navigate,
        replaceState,
        getParams,
        clearParams,
        beforeNavigate,
        onRouteChange,
        init,
        getCurrentRoute
    };
})();

window.Router = Router;
