/* ============================================================================
   workspace.js — universal master–detail collapse
   ----------------------------------------------------------------------------
   Every list/detail page uses the same shell:
     <div class="row ws-row" data-ws="<key>">
       <div class="... ws-side">        list / nav  (card with .ws-side-header
                                        containing a .ws-toggle button)
       <div class="... ws-main">        detail / editor / form

   Collapsing shrinks the sidebar to a thin rail (CSS) and lets the content take
   the freed width. The toggle lives at the top-left of the sidebar header and
   stays there in both states, so it never jumps. State persists per page in
   localStorage. Only meaningful ≥992px; below that the grid stacks.
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

  function syncToggle(row) {
    const collapsed = row.classList.contains('ws-collapsed');
    row.querySelectorAll('.ws-toggle').forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) icon.className = collapsed ? 'bi bi-layout-sidebar' : 'bi bi-layout-sidebar-inset';
      btn.title = collapsed ? 'Show list' : 'Hide list';
      btn.setAttribute('aria-pressed', String(collapsed));
    });
  }

  function applyAll() {
    const s = readState();
    document.querySelectorAll('.ws-row[data-ws]').forEach(row => {
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
    // Let Monaco / Chart.js recompute now that the content width changed.
    window.dispatchEvent(new Event('resize'));
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ws-toggle');
    if (!btn) return;
    const row = btn.closest('.ws-row');
    if (row) { e.preventDefault(); toggle(row); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }
  window.addEventListener('hashchange', () => setTimeout(applyAll, 60));
})();
