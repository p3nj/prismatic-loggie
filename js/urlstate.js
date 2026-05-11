// URL state codec — single source of truth for hash-token encoding.
//
// Encodes {route, params} as URL-safe base64 of JSON so every shareable URL is
// a single opaque token: https://.../#<base64>
//
// Empty-state ({route:'analysis', params:{}}) round-trips to an empty token so
// the bare site URL stays clean.
const UrlState = (() => {
    const DEFAULT_ROUTE = 'analysis';

    function toBase64Url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromBase64Url(b64) {
        const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function encode(state) {
        const route = state?.route || DEFAULT_ROUTE;
        const params = state?.params || {};
        // Empty default state -> empty token; keeps bare URLs clean.
        if (route === DEFAULT_ROUTE && Object.keys(params).length === 0) return '';
        const payload = { r: route, p: params };
        const json = JSON.stringify(payload);
        return toBase64Url(new TextEncoder().encode(json));
    }

    function decode(token) {
        if (!token) return { route: DEFAULT_ROUTE, params: {} };
        try {
            const json = new TextDecoder().decode(fromBase64Url(token));
            const obj = JSON.parse(json);
            if (!obj || typeof obj !== 'object') return null;
            return { route: obj.r || DEFAULT_ROUTE, params: obj.p || {} };
        } catch (e) {
            return null;
        }
    }

    function buildHref(route, params) {
        const token = encode({ route, params });
        return token ? `#${token}` : `#`;
    }

    function buildShareUrl(route, params) {
        return `${location.origin}${location.pathname}${buildHref(route, params)}`;
    }

    return { encode, decode, buildHref, buildShareUrl, DEFAULT_ROUTE };
})();

window.UrlState = UrlState;
