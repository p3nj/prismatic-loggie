// Trigger Page Handler
// Select an instance, pick one of its flows, compose a payload + headers, and
// trigger the flow via the testInstanceFlowConfig mutation (same thing
// Prismatic's instance test page does). The resulting execution is linked so
// the user can jump straight to its logs on the Execution page.
const TriggerPage = (() => {
    let initialized = false;
    let selectedInstance = null;      // { id, name }
    let selectedFlowConfigId = null;

    // ----- helpers -------------------------------------------------------

    function el(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return (window.UI && UI.escapeHtml) ? UI.escapeHtml(s) : String(s ?? '');
    }
    function escapeAttr(s) {
        return (window.UI && UI.escapeAttr) ? UI.escapeAttr(s) : String(s ?? '');
    }

    function setTriggerEnabled() {
        const btn = el('triggerRunBtn');
        if (btn) btn.disabled = !(selectedInstance && selectedFlowConfigId);
    }

    // ----- init ----------------------------------------------------------

    function init() {
        if (initialized) return;
        setupEventListeners();
        // Start with one empty header row for convenience.
        addHeaderRow('', '');
        initialized = true;
    }

    function setupEventListeners() {
        const flowSelect = el('triggerFlowSelect');
        if (flowSelect) {
            flowSelect.addEventListener('change', (e) => {
                selectedFlowConfigId = e.target.value || null;
                setTriggerEnabled();
            });
        }

        const addHeaderBtn = el('triggerAddHeaderBtn');
        if (addHeaderBtn) addHeaderBtn.addEventListener('click', () => addHeaderRow('', ''));

        // Header row remove (delegated).
        const headers = el('triggerHeaders');
        if (headers) {
            headers.addEventListener('click', (e) => {
                const rm = e.target.closest('[data-remove-header]');
                if (rm) rm.closest('.trigger-header-row')?.remove();
            });
        }

        const runBtn = el('triggerRunBtn');
        if (runBtn) runBtn.addEventListener('click', triggerFlow);
    }

    // ----- flows ---------------------------------------------------------

    async function loadFlows(instanceId) {
        const flowSelect = el('triggerFlowSelect');
        if (!flowSelect) return;
        flowSelect.disabled = true;
        flowSelect.innerHTML = '<option value="">Loading flows…</option>';
        try {
            const instance = await API.fetchInstanceFlows(instanceId);
            const nodes = instance?.flowConfigs?.nodes || [];
            if (!nodes.length) {
                flowSelect.innerHTML = '<option value="">No flows on this instance</option>';
                return;
            }
            const opts = ['<option value="">Select a flow…</option>'];
            nodes.forEach(n => {
                if (!n?.id) return;
                const label = n.flow?.name || '(unnamed flow)';
                opts.push(`<option value="${escapeAttr(n.id)}">${escapeHtml(label)}</option>`);
            });
            flowSelect.innerHTML = opts.join('');
            flowSelect.disabled = false;
        } catch (err) {
            flowSelect.innerHTML = `<option value="">Failed to load flows</option>`;
            showResultError(`Failed to load flows: ${err.message}`);
        }
    }

    // ----- headers -------------------------------------------------------

    function addHeaderRow(key, value) {
        const container = el('triggerHeaders');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'trigger-header-row d-flex gap-2 mb-2';
        row.innerHTML = `
            <input type="text" class="form-control form-control-sm trigger-header-key" placeholder="Header name" value="${escapeAttr(key)}">
            <input type="text" class="form-control form-control-sm trigger-header-value" placeholder="Value" value="${escapeAttr(value)}">
            <button type="button" class="btn btn-sm btn-outline-danger" data-remove-header title="Remove header"><i class="bi bi-x-lg"></i></button>
        `;
        container.appendChild(row);
    }

    // Collect non-empty header rows into a JSON string, or null if none.
    function collectHeaders() {
        const rows = document.querySelectorAll('#triggerHeaders .trigger-header-row');
        const obj = {};
        rows.forEach(r => {
            const k = r.querySelector('.trigger-header-key')?.value.trim();
            const v = r.querySelector('.trigger-header-value')?.value ?? '';
            if (k) obj[k] = v;
        });
        return Object.keys(obj).length ? JSON.stringify(obj) : null;
    }

    // ----- trigger -------------------------------------------------------

    async function triggerFlow() {
        if (!selectedInstance || !selectedFlowConfigId) return;

        const payload = el('triggerPayload')?.value ?? '';
        const contentType = el('triggerContentType')?.value.trim() || 'application/json';
        const headers = collectHeaders();

        const btn = el('triggerRunBtn');
        const statusEl = el('triggerStatus');
        const resultEl = el('triggerResult');
        const originalBtn = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Triggering…';
        if (statusEl) statusEl.textContent = '';
        if (resultEl) resultEl.innerHTML = '';

        try {
            const result = await API.testInstanceFlowConfig(selectedFlowConfigId, { payload, contentType, headers });
            renderResult(result);
        } catch (err) {
            showResultError(err.message);
        } finally {
            btn.innerHTML = originalBtn;
            btn.disabled = false;
            setTriggerEnabled();
        }
    }

    function showResultError(message) {
        const resultEl = el('triggerResult');
        if (resultEl) {
            resultEl.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(message)}</div>`;
        }
    }

    function renderResult(result) {
        const resultEl = el('triggerResult');
        if (!resultEl) return;
        if (!result) { showResultError('No response returned.'); return; }

        const code = result.statusCode;
        const ok = typeof code === 'number' && code >= 200 && code < 400;
        const badgeClass = ok ? 'bg-success' : (code ? 'bg-danger' : 'bg-secondary');
        const execId = result.execution?.id || null;

        // Pretty-print headers/body if they're JSON.
        let headersText = result.headers || '';
        try { headersText = JSON.stringify(JSON.parse(headersText), null, 2); } catch (e) { /* leave as-is */ }
        let bodyText = result.body || '';
        try { bodyText = JSON.stringify(JSON.parse(bodyText), null, 2); } catch (e) { /* leave as-is */ }

        resultEl.innerHTML = `
            <div class="card">
                <div class="card-header d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-check2-circle me-2"></i>Trigger result</span>
                    <span class="badge ${badgeClass}">HTTP ${escapeHtml(code ?? '—')}</span>
                </div>
                <div class="card-body">
                    ${execId ? `<div class="mb-3">
                        <button type="button" class="btn btn-sm btn-outline-primary" id="triggerViewExecBtn" data-execution-id="${escapeAttr(execId)}">
                            <i class="bi bi-journal-text me-1"></i>View Execution
                        </button>
                        <span class="text-muted small ms-2">${escapeHtml(execId)}</span>
                    </div>` : '<div class="text-muted small mb-3">No execution id was returned.</div>'}
                    ${headersText ? `<div class="mb-3">
                        <div class="fw-semibold small mb-1">Response headers</div>
                        <pre class="mb-0 p-2 border rounded bg-light small" style="max-height:200px;overflow:auto">${escapeHtml(headersText)}</pre>
                    </div>` : ''}
                    <div>
                        <div class="fw-semibold small mb-1">Response body</div>
                        <pre class="mb-0 p-2 border rounded bg-light small" style="max-height:320px;overflow:auto">${escapeHtml(bodyText || '(empty)')}</pre>
                    </div>
                </div>
            </div>
        `;

        const viewBtn = el('triggerViewExecBtn');
        if (viewBtn && execId) {
            viewBtn.addEventListener('click', () => {
                Router.navigate('execution', { executionId: execId });
            });
        }
    }

    // ----- embedded in Instances page ------------------------------------

    // Mount the trigger UI for an instance already selected on the Instances
    // page. Loads that instance's flows, then optionally prefills a shared
    // request (flow + content-type + headers + payload).
    async function mountForInstance(id, name, shareState) {
        init();
        selectedInstance = { id, name };
        selectedFlowConfigId = null;
        const resultEl = el('triggerResult');
        if (resultEl) resultEl.innerHTML = '';
        setTriggerEnabled();
        await loadFlows(id);
        if (shareState) applyShareState(shareState);
    }

    // Capture the current request so it can be encoded into a shareable URL.
    function getShareState() {
        return {
            flowId: selectedFlowConfigId || (el('triggerFlowSelect')?.value || ''),
            contentType: el('triggerContentType')?.value || '',
            payload: el('triggerPayload')?.value || '',
            headers: collectHeaders() || ''
        };
    }

    // Prefill the form from a shared state (called after flows are loaded).
    function applyShareState(st) {
        if (!st) return;
        if (st.contentType != null && el('triggerContentType')) el('triggerContentType').value = st.contentType;
        if (st.payload != null && el('triggerPayload')) el('triggerPayload').value = st.payload;
        const hc = el('triggerHeaders');
        if (hc && st.headers) {
            hc.innerHTML = '';
            try {
                const obj = typeof st.headers === 'string' ? JSON.parse(st.headers) : st.headers;
                Object.entries(obj).forEach(([k, v]) => addHeaderRow(k, v));
            } catch (e) { addHeaderRow('', ''); }
        }
        if (st.flowId && el('triggerFlowSelect')) {
            el('triggerFlowSelect').value = st.flowId;
            selectedFlowConfigId = el('triggerFlowSelect').value || null;
            setTriggerEnabled();
        }
    }

    return {
        init,
        mountForInstance,
        getShareState
    };
})();

window.TriggerPage = TriggerPage;
