/* ============================================================================
   workspace.js — collapsible list/detail sidebars
   ----------------------------------------------------------------------------
   Pages that use a list-sidebar + detail layout (Instances, Config, Execution,
   Integrations) mark up their grid with:
     <div class="row ws-row" data-ws="<key>">
       <div class="... ws-side"> ...list...  (contains a .ws-toggle button)
       <div class="... ws-main"> ...detail...

   Collapsing hides the sidebar and lets the detail area use the full width —
   maximising screen real estate on wide screens. State persists per page in
   localStorage. Only active ≥992px; below that the columns stack anyway.
   ============================================================================ */
(function () {
  const KEY = 'loggie:ws-collapsed';

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }

  // Ensure each detail column has a "show sidebar" button (shown only when
  // collapsed via CSS). Injected so page markup stays minimal.
  function ensureReopen(row) {
    const main = row.querySelector(':scope > .ws-main');
    if (main && !main.querySelector(':scope > .ws-reopen')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-reopen btn btn-sm btn-outline-secondary';
      btn.innerHTML = '<i class="bi bi-layout-sidebar"></i> <span>Show list</span>';
      main.insertBefore(btn, main.firstChild);
    }
  }

  function syncToggle(row) {
    const collapsed = row.classList.contains('ws-collapsed');
    row.querySelectorAll('.ws-toggle').forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'bi bi-layout-sidebar-inset';
      btn.title = 'Hide list';
      btn.setAttribute('aria-pressed', String(collapsed));
    });
  }

  function applyAll() {
    const s = readState();
    document.querySelectorAll('.ws-row[data-ws]').forEach(row => {
      ensureReopen(row);
      row.classList.toggle('ws-collapsed', !!s[row.dataset.ws]);
      syncToggle(row);
    });
  }

  function toggle(row) {
    row.classList.toggle('ws-collapsed');
    const s = readState();
    s[row.dataset.ws] = row.classList.contains('ws-collapsed');
    writeState(s);
    syncToggle(row);
    // Let Monaco / Chart.js recompute now that the detail width changed.
    window.dispatchEvent(new Event('resize'));
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ws-toggle, .ws-reopen');
    if (!btn) return;
    const row = btn.closest('.ws-row');
    if (row) { e.preventDefault(); toggle(row); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }
  // Re-apply after route changes render/replace dynamic content.
  window.addEventListener('hashchange', () => setTimeout(applyAll, 60));
})();
