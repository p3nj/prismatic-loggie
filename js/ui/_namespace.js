// Shared namespace for the UI module. Loaded first; subsequent ui/*.js files
// mutate this object so call sites can keep using `UI.foo`.
window.UI = window.UI || {};
