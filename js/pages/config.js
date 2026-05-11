// Config Page Handler - Instance Configuration Management with Better UX
const ConfigPage = (() => {
    let initialized = false;
    let instancesData = null;
    let selectedInstance = null;
    let selectedInstanceConfig = null;
    let searchTimeout = null;
    let monacoEditor = null;
    let nextPageInfo = null;
    let currentSearchTerm = '';
    let editMode = false;
    let hasUnsavedChanges = false;
    let configChanges = {};
    let valueMap = {};            // configVarId -> { key, value, dataType }
    let modalEditor = null;       // the Monaco editor instance currently shown in the modal

    const PREVIEW_LINES = 3;
    const PREVIEW_MAX_CHARS = 240;

    // Initialize the config page
    function init() {
        if (initialized) return;
        setupEventListeners();
        initialized = true;
    }

    // Get current theme for Monaco
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs';
    }

    // Setup event listeners
    function setupEventListeners() {
        // Refresh instances button
        const refreshBtn = document.getElementById('refreshConfigBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadInstances(true));
        }

        // Search input with debounce
        const searchInput = document.getElementById('configSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentSearchTerm = e.target.value;
                    loadInstances(true, currentSearchTerm);
                }, 300);
            });
        }

        // Load more instances button
        const loadMoreBtn = document.getElementById('loadMoreConfigBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMoreInstances);
        }

        // Tab switching, edit-mode toggle, and save button are delegated to
        // document because the buttons are injected after `displayInstanceConfig`
        // runs, not at page-init time.
        document.addEventListener('click', (e) => {
            const tab = e.target.closest('[data-config-tab]');
            if (tab) {
                e.preventDefault();
                switchTab(tab.dataset.configTab);
                return;
            }
            if (e.target.closest('#toggleEditBtn')) {
                toggleEditMode();
                return;
            }
            if (e.target.closest('#saveConfigBtn')) {
                saveConfiguration();
                return;
            }
        });

        // Listen for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName !== 'data-theme') return;
                if (typeof monaco !== 'undefined' && monaco.editor) {
                    monaco.editor.setTheme(getCurrentTheme());
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    // Route handler
    async function onRoute(params) {
        init();
        
        // Check authentication
        if (!API.isAuthenticated()) {
            showToast('Please authenticate first', 'warning');
            Router.navigate('auth');
            return;
        }

        // Load instances when page is accessed
        await loadInstances(false);

        // If there's an instance ID in params, select it
        if (params.instanceId) {
            selectInstanceById(params.instanceId);
        }
    }

    // Load instances (without config - lazy loading)
    async function loadInstances(reset = false, searchTerm = '') {
        const listContainer = document.getElementById('configList');
        const loadMoreContainer = document.getElementById('configLoadMore');
        
        if (!listContainer) return;

        // Reset pagination if needed
        if (reset) {
            instancesData = null;
            nextPageInfo = null;
            listContainer.innerHTML = '<div class="p-3 text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading instances...</div>';
        }

        try {
            const options = { first: 25 };
            if (!reset && instancesData && instancesData.pageInfo?.endCursor) {
                options.after = instancesData.pageInfo.endCursor;
            }
            if (searchTerm) {
                options.searchTerm = searchTerm;
            }

            // Use regular instances query for faster loading
            const data = await API.fetchInstances(options);

            if (reset) {
                instancesData = data;
                listContainer.innerHTML = '';
            } else {
                // Append new edges
                if (instancesData) {
                    instancesData.edges = [...instancesData.edges, ...data.edges];
                    instancesData.pageInfo = data.pageInfo;
                } else {
                    instancesData = data;
                }
            }

            renderInstancesList(reset);

            // Show/hide load more button
            if (loadMoreContainer) {
                if (instancesData.pageInfo?.hasNextPage) {
                    loadMoreContainer.classList.remove('d-none');
                } else {
                    loadMoreContainer.classList.add('d-none');
                }
            }

            if (!instancesData.edges || instancesData.edges.length === 0) {
                listContainer.innerHTML = '<div class="p-3 text-center text-muted">No instances found</div>';
            }
        } catch (error) {
            console.error('Error loading instances:', error);
            listContainer.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load instances: ${error.message}
                </div>
            `;
        }
    }

    // Load more instances
    function loadMoreInstances() {
        if (nextPageInfo && nextPageInfo.hasNextPage) {
            loadInstances(false, currentSearchTerm);
        }
    }

    // Render instances list
    function renderInstancesList(reset = false) {
        const listContainer = document.getElementById('configList');
        if (!listContainer) return;

        if (reset) {
            listContainer.innerHTML = '';
        }

        if (!instancesData || !instancesData.edges || instancesData.edges.length === 0) {
            return;
        }

        // Get the edges to render
        const edges = instancesData.edges;
        const startIndex = reset ? 0 : listContainer.children.length;
        const edgesToRender = edges.slice(startIndex);

        edgesToRender.forEach(edge => {
            const instance = edge.node;
            const item = document.createElement('div');
            item.className = 'config-list-item';
            item.dataset.instanceId = instance.id;

            // Determine instance status
            const isEnabled = instance.enabled;
            const statusIcon = isEnabled ? 'bi-check-circle-fill text-success' : 'bi-pause-circle-fill text-warning';
            const statusText = isEnabled ? 'Enabled' : 'Disabled';

            // Create elements safely
            const mainDiv = document.createElement('div');
            mainDiv.className = 'd-flex justify-content-between align-items-start';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex-grow-1 overflow-hidden';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'fw-semibold text-truncate';
            nameDiv.textContent = instance.name;
            
            const integrationDiv = document.createElement('div');
            integrationDiv.className = 'small text-muted';
            integrationDiv.innerHTML = '<i class="bi bi-diagram-3 me-1"></i>';
            const integrationText = document.createTextNode(instance.integration?.name || 'Unknown Integration');
            integrationDiv.appendChild(integrationText);
            
            contentDiv.appendChild(nameDiv);
            contentDiv.appendChild(integrationDiv);
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'text-end';
            statusDiv.innerHTML = `<i class="${statusIcon}" title="${statusText}"></i>`;
            
            mainDiv.appendChild(contentDiv);
            mainDiv.appendChild(statusDiv);
            item.appendChild(mainDiv);
            
            // Add customer info if available
            if (instance.customer) {
                const customerDiv = document.createElement('div');
                customerDiv.className = 'small text-muted mt-1';
                customerDiv.innerHTML = '<i class="bi bi-building me-1"></i>';
                const customerText = document.createTextNode(instance.customer.name);
                customerDiv.appendChild(customerText);
                item.appendChild(customerDiv);
            }

            item.addEventListener('click', () => selectInstance(instance));
            listContainer.appendChild(item);
        });
    }

    // Select an instance and load its config
    async function selectInstance(instance) {
        selectedInstance = instance;
        hasUnsavedChanges = false;
        configChanges = {};

        // Update UI selection
        document.querySelectorAll('.config-list-item').forEach(item => {
            item.classList.toggle('active', item.dataset.instanceId === instance.id);
        });

        // Update the header
        const headerElement = document.getElementById('selectedConfigName');
        if (headerElement) {
            headerElement.textContent = instance.name;
        }

        // Show loading state
        const contentContainer = document.getElementById('configContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading configuration...</span>
                    </div>
                    <p class="mt-3 text-muted">Loading configuration for ${instance.name}...</p>
                </div>
            `;
        }

        // Enable/disable edit button
        updateEditButton();

        // Fetch detailed config for this instance
        try {
            const configData = await API.fetchInstanceConfig(instance.id);
            selectedInstanceConfig = configData;
            displayInstanceConfig(configData);
        } catch (error) {
            console.error('Error loading instance config:', error);
            // Show detailed error message
            let errorDetails = error.message;
            if (error.message.includes('400')) {
                errorDetails += '\n\nThis usually means the GraphQL query has invalid fields or structure.';
                errorDetails += '\n\nPlease check the browser console for more details.';
            }
            contentContainer.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Failed to load configuration</strong>
                    <pre class="mt-2 mb-0">${escapeHtml(errorDetails)}</pre>
                </div>
            `;
        }
    }

    // Select instance by ID
    function selectInstanceById(instanceId) {
        const edge = instancesData?.edges?.find(e => e.node.id === instanceId);
        if (edge) {
            selectInstance(edge.node);
        }
    }

    // Display instance configuration with tabs
    function displayInstanceConfig(instance) {
        const contentContainer = document.getElementById('configContent');
        if (!contentContainer) return;

        // Close any open value modal and tear down the JSON-view editor from
        // a previously displayed instance.
        closeValueModal();
        if (monacoEditor) {
            monacoEditor.dispose();
            monacoEditor = null;
        }

        // Build the in-memory value map (source of truth for the modal).
        rebuildValueMap(instance);

        contentContainer.innerHTML = `
            <div class="config-tabs mb-3">
                <ul class="nav nav-tabs">
                    <li class="nav-item">
                        <a class="nav-link active" href="#" data-config-tab="variables">
                            <i class="bi bi-sliders me-1"></i>Config Variables
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" data-config-tab="json">
                            <i class="bi bi-code-square me-1"></i>JSON View
                        </a>
                    </li>
                </ul>
            </div>
            <div class="config-tab-content">
                <div id="variables-tab" class="tab-pane active">
                    ${renderConfigVariables(instance)}
                </div>
                <div id="json-tab" class="tab-pane d-none">
                    <div id="monacoContainer" style="height: 600px; border: 1px solid var(--bs-border-color); border-radius: 0.375rem;"></div>
                </div>
            </div>
        `;
    }

    const TYPE_GROUPS = [
        { key: 'connection', label: 'Connections',  icon: 'bi-plug-fill',    types: ['CONNECTION'],                          badgeClass: 'bg-primary'   },
        { key: 'schedule',   label: 'Schedules',    icon: 'bi-clock-fill',   types: ['SCHEDULE'],                            badgeClass: 'bg-info'      },
        { key: 'values',     label: 'Values',       icon: 'bi-sliders',      types: ['STRING', 'NUMBER', 'BOOLEAN', 'PICKLIST'], badgeClass: 'bg-success' },
        { key: 'code',       label: 'Code',         icon: 'bi-code-slash',   types: ['CODE'],                                badgeClass: 'bg-secondary' },
        { key: 'other',      label: 'Other',        icon: 'bi-gear-fill',    types: [],                                      badgeClass: 'bg-dark'      },
    ];

    // Render config variables grouped by type
    function renderConfigVariables(instance) {
        const configVars = instance.configVariables?.edges || [];

        if (configVars.length === 0) {
            return `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-inbox display-4"></i>
                    <p class="mt-2">No configuration variables</p>
                </div>
            `;
        }

        // Bucket each variable into its group
        const buckets = Object.fromEntries(TYPE_GROUPS.map(g => [g.key, []]));
        configVars.forEach(edge => {
            const node = edge.node;
            const dt = node.requiredConfigVariable?.dataType || 'STRING';
            const group = TYPE_GROUPS.find(g => g.types.includes(dt)) || TYPE_GROUPS.find(g => g.key === 'other');
            buckets[group.key].push(node);
        });

        let html = `
            <div class="config-variables-container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <span class="text-muted small">${configVars.length} variable${configVars.length !== 1 ? 's' : ''}</span>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-secondary" id="toggleEditBtn">
                            <i class="bi ${editMode ? 'bi-eye' : 'bi-pencil'} me-1"></i>${editMode ? 'View Mode' : 'Edit Mode'}
                        </button>
                        <button class="btn btn-sm btn-success ${!editMode || !hasUnsavedChanges ? 'd-none' : ''}" id="saveConfigBtn">
                            <i class="bi bi-save me-1"></i>Save Changes
                        </button>
                    </div>
                </div>
        `;

        TYPE_GROUPS.forEach(group => {
            const items = buckets[group.key];
            if (!items.length) return;

            html += `
                <section class="config-group mb-4">
                    <h5 class="config-group-heading">
                        <i class="bi ${group.icon} me-2"></i>${group.label}
                        <span class="badge ${group.badgeClass} ms-2">${items.length}</span>
                    </h5>
                    <div class="config-group-items border rounded">
            `;

            items.forEach((node, idx) => {
                const key         = node.requiredConfigVariable?.key || 'Unknown';
                const value       = node.value || '';
                const dataType    = node.requiredConfigVariable?.dataType || 'STRING';
                const description = node.requiredConfigVariable?.description || '';
                const isLast      = idx === items.length - 1;
                const rendered    = renderConfigValue(node.id, key, value, dataType, editMode);
                const isBlock     = rendered.layout === 'block';

                const meta = `
                    <div class="config-var-meta">
                        <h6 class="config-var-key mb-0">${escapeHtml(key)}</h6>
                        ${description ? `<p class="text-muted small mb-0 mt-1">${escapeHtml(description)}</p>` : ''}
                    </div>
                `;

                if (isBlock) {
                    html += `
                        <div class="config-var-item px-3 py-3 ${isLast ? '' : 'border-bottom'}">
                            ${meta}
                            <div class="config-var-value-block mt-2">${rendered.html}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="config-var-item px-3 py-3 ${isLast ? '' : 'border-bottom'}">
                            <div class="d-flex justify-content-between align-items-start gap-3">
                                ${meta}
                                <div class="config-var-value-col flex-shrink-0">${rendered.html}</div>
                            </div>
                        </div>
                    `;
                }
            });

            html += `</div></section>`;
        });

        html += `</div>`;
        return html;
    }

    // Render the value cell for a config variable.
    // Returns { layout: 'inline' | 'block', html }.
    function renderConfigValue(id, key, value, dataType, isEditable) {
        const inputId = `config-${id}`;
        const safeKey = escapeHtml(key);
        const inline  = (html) => ({ layout: 'inline', html });
        const block   = (html) => ({ layout: 'block', html });

        // STRING and CODE share a compact preview card that opens a full-screen
        // Monaco-backed editor modal on click. The card shows the first few
        // lines of the value plus a type label and an expand hint.
        if (dataType === 'STRING' || dataType === 'CODE') {
            return block(renderValuePreview(id, value, dataType, isEditable));
        }

        // ── View mode for badge-style types ───────────────────────────────────
        if (!isEditable) {
            if (dataType === 'CONNECTION') {
                return inline(value
                    ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Connected</span>`
                    : `<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Not configured</span>`);
            }
            if (dataType === 'BOOLEAN') {
                return inline(value === 'true'
                    ? `<span class="badge bg-success">Enabled</span>`
                    : `<span class="badge bg-secondary">Disabled</span>`);
            }
            if (dataType === 'SCHEDULE') {
                return inline(`<span class="badge bg-info text-dark"><i class="bi bi-clock me-1"></i>${escapeHtml(value || 'Custom')}</span>`);
            }
            if (dataType === 'NUMBER') {
                return inline(`<span class="badge bg-light text-dark border">${escapeHtml(value || '—')}</span>`);
            }
            if (dataType === 'PICKLIST') {
                return inline(`<span class="badge bg-light text-dark border">${escapeHtml(value || '—')}</span>`);
            }
            return inline(`<span class="badge bg-light text-muted border">—</span>`);
        }

        // ── Edit mode for the remaining types ─────────────────────────────────
        if (dataType === 'NUMBER') {
            return inline(`<input type="number" class="form-control form-control-sm config-input" id="${inputId}"
                        value="${escapeHtml(value)}" data-config-id="${id}" data-config-key="${safeKey}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.value)">`);
        }
        if (dataType === 'BOOLEAN') {
            return inline(`
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input config-input" type="checkbox" id="${inputId}"
                           data-config-id="${id}" data-config-key="${safeKey}"
                           ${value === 'true' ? 'checked' : ''}
                           onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.checked ? 'true' : 'false')">
                    <label class="form-check-label small" for="${inputId}">${value === 'true' ? 'Enabled' : 'Disabled'}</label>
                </div>`);
        }
        if (dataType === 'PICKLIST') {
            return inline(`
                <select class="form-select form-select-sm config-input" id="${inputId}"
                        data-config-id="${id}" data-config-key="${safeKey}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.value)">
                    <option value="${escapeHtml(value)}">${escapeHtml(value || 'Select...')}</option>
                </select>`);
        }
        // CONNECTION, SCHEDULE — read-only in edit mode
        return inline(`<span class="badge bg-light text-muted border small">Read-only</span>`);
    }

    // Detect a sensible Monaco language for a CODE value. Falls back to
    // 'javascript' so curly-braced blobs still get reasonable highlighting.
    function detectCodeLanguage(value) {
        const trimmed = (value || '').trim();
        if (!trimmed) return 'plaintext';
        try { JSON.parse(trimmed); return 'json'; } catch (_e) {}
        if (/^<\?xml|^<[a-zA-Z][^>]*>/.test(trimmed)) return 'xml';
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(trimmed)) return 'sql';
        return 'javascript';
    }

    // Human-friendly type label shown on the preview card.
    function valueTypeLabel(value, dataType) {
        if (dataType === 'STRING') return 'String';
        if (dataType === 'CODE') {
            const lang = detectCodeLanguage(value);
            if (lang === 'json') return 'JSON';
            if (lang === 'xml') return 'XML';
            if (lang === 'sql') return 'SQL';
            if (lang === 'javascript') return 'Code';
            return 'Code';
        }
        return dataType;
    }

    // Get the first PREVIEW_LINES of a value, capped at PREVIEW_MAX_CHARS,
    // and report whether content was truncated.
    function getPreviewText(value) {
        const v = value || '';
        const lines = v.split('\n').slice(0, PREVIEW_LINES);
        let text = lines.join('\n');
        let truncated = v.split('\n').length > PREVIEW_LINES;
        if (text.length > PREVIEW_MAX_CHARS) {
            text = text.slice(0, PREVIEW_MAX_CHARS);
            truncated = true;
        }
        return { text, truncated };
    }

    // Build the HTML for an inline preview card. Clicking it (or hitting
    // Enter / Space when focused) opens the full editor modal.
    function renderValuePreview(id, value, dataType, isEditable) {
        const empty = !value;
        const { text, truncated } = getPreviewText(value);
        const label = valueTypeLabel(value, dataType);
        const canEdit = isEditable && dataType === 'STRING';
        const hintIcon = canEdit ? 'bi-pencil-square' : 'bi-arrows-angle-expand';
        const hintText = canEdit ? 'Edit' : 'Expand';
        const stateClass = empty ? 'is-empty' : '';
        const bodyHtml = empty
            ? `<span class="config-value-preview-empty">Not set</span>`
            : `${escapeHtml(text)}${truncated ? '<span class="config-value-preview-fade"></span>' : ''}`;

        return `
            <div class="config-value-preview ${stateClass}"
                 role="button"
                 tabindex="0"
                 aria-label="${canEdit ? 'Edit value' : 'View value'}"
                 data-config-id="${id}"
                 onclick="ConfigPage.openValueEditor(this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ConfigPage.openValueEditor(this)}">
                <div class="config-value-preview-header">
                    <span class="config-value-preview-type">${label}</span>
                    <span class="config-value-preview-hint">
                        <i class="bi ${hintIcon}"></i>
                        <span>${hintText}</span>
                    </span>
                </div>
                <pre class="config-value-preview-body">${bodyHtml}</pre>
            </div>
        `;
    }

    // Populate the in-memory value map from an instance. The map is the
    // source of truth for what the modal opens with — it tracks any unsaved
    // edits made via the modal.
    function rebuildValueMap(instance) {
        valueMap = {};
        (instance?.configVariables?.edges || []).forEach(edge => {
            const node = edge.node;
            const key = node.requiredConfigVariable?.key;
            if (!key) return;
            valueMap[node.id] = {
                key,
                value: configChanges[key]?.value ?? node.value ?? '',
                dataType: node.requiredConfigVariable?.dataType || 'STRING',
            };
        });
    }

    // Update a single preview card's body in place (used after Save in modal).
    function refreshValuePreview(id) {
        const entry = valueMap[id];
        if (!entry) return;
        const card = document.querySelector(`.config-value-preview[data-config-id="${id}"]`);
        if (!card) return;
        // Re-render the card HTML and replace the existing element so all
        // state (label, hint, body, fade, classes) stays consistent.
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderValuePreview(id, entry.value, entry.dataType, editMode).trim();
        const fresh = wrapper.firstChild;
        if (fresh) card.replaceWith(fresh);
    }

    // ── Value editor modal ────────────────────────────────────────────────────
    // Entry point invoked by the inline preview card. `el` is the card itself.
    function openValueEditor(el) {
        const id = el?.dataset?.configId;
        const entry = valueMap[id];
        if (!entry) return;
        showValueModal(id, entry.key, entry.value, entry.dataType);
    }

    // Build (or reuse) the modal DOM and mount a Monaco editor inside it.
    function showValueModal(id, key, value, dataType) {
        const canEdit = editMode && dataType === 'STRING';
        const language = dataType === 'CODE' ? detectCodeLanguage(value) : 'plaintext';

        const modal = ensureValueModalShell();
        modal.dataset.configId = id;
        modal.dataset.dataType = dataType;
        modal.dataset.editable = canEdit ? '1' : '0';

        // Header content
        modal.querySelector('.config-modal-title').textContent = key;
        const typeLabel = valueTypeLabel(value, dataType);
        const typeBadge = modal.querySelector('.config-modal-type');
        typeBadge.textContent = typeLabel;
        typeBadge.className = `config-modal-type badge ${dataType === 'CODE' ? 'bg-secondary' : 'bg-info text-dark'}`;
        modal.querySelector('.config-modal-mode').textContent = canEdit ? 'Edit mode' : 'Read-only';

        // Footer buttons
        const saveBtn = modal.querySelector('.config-modal-save');
        saveBtn.classList.toggle('d-none', !canEdit);

        const cancelBtn = modal.querySelector('.config-modal-cancel');
        cancelBtn.textContent = canEdit ? 'Cancel' : 'Close';

        // Show shell, then mount Monaco. Monaco is already loaded for the
        // JSON-view tab; if for some reason it isn't yet, load it.
        modal.style.display = 'block';
        document.body.classList.add('config-modal-open');

        const mount = () => mountModalEditor(value, language, canEdit);
        if (typeof monaco !== 'undefined' && monaco.editor) {
            mount();
        } else if (typeof require === 'function') {
            require(['vs/editor/editor.main'], mount);
        }
    }

    // Create the modal shell once and cache it on the document.
    function ensureValueModalShell() {
        let modal = document.getElementById('configValueModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'configValueModal';
        modal.className = 'json-modal config-value-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'configModalTitle');
        modal.innerHTML = `
            <div class="modal-content modal-lg config-modal-content">
                <div class="config-modal-head">
                    <div class="config-modal-titles">
                        <div class="config-modal-eyebrow">
                            <span class="config-modal-type badge bg-secondary">Value</span>
                            <span class="config-modal-mode small text-muted">Read-only</span>
                        </div>
                        <h5 id="configModalTitle" class="config-modal-title mb-0">Value</h5>
                    </div>
                    <button type="button" class="btn-close config-modal-close" aria-label="Close"></button>
                </div>
                <div class="config-modal-body">
                    <div class="config-modal-editor"></div>
                </div>
                <div class="config-modal-foot">
                    <button type="button" class="btn btn-outline-secondary btn-sm config-modal-cancel">Close</button>
                    <button type="button" class="btn btn-primary btn-sm config-modal-save d-none">
                        <i class="bi bi-check2 me-1"></i>Save
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Wire the dismiss + save handlers once.
        modal.querySelector('.config-modal-close').addEventListener('click', closeValueModal);
        modal.querySelector('.config-modal-cancel').addEventListener('click', closeValueModal);
        modal.querySelector('.config-modal-save').addEventListener('click', saveValueModal);
        // Click outside the content closes the modal.
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) closeValueModal();
        });
        // ESC dismisses.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeValueModal();
            }
        });

        return modal;
    }

    // Tear down any previous editor instance and mount a fresh one in the
    // modal body.
    function mountModalEditor(value, language, canEdit) {
        const modal = document.getElementById('configValueModal');
        const host = modal.querySelector('.config-modal-editor');
        // Clear any previous editor DOM
        host.innerHTML = '';
        if (modalEditor) {
            try { modalEditor.dispose(); } catch (_e) {}
            modalEditor = null;
        }
        modalEditor = monaco.editor.create(host, {
            value: value || '',
            language,
            theme: getCurrentTheme(),
            readOnly: !canEdit,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            wordWrap: 'on',
            lineNumbers: 'on',
            folding: true,
            renderWhitespace: 'selection',
        });
        // Focus first line so keyboard works immediately.
        setTimeout(() => modalEditor && modalEditor.focus(), 50);
    }

    function closeValueModal() {
        const modal = document.getElementById('configValueModal');
        if (!modal) return;
        if (modalEditor) {
            try { modalEditor.dispose(); } catch (_e) {}
            modalEditor = null;
        }
        modal.style.display = 'none';
        document.body.classList.remove('config-modal-open');
    }

    function saveValueModal() {
        const modal = document.getElementById('configValueModal');
        if (!modal || !modalEditor) return;
        const id = modal.dataset.configId;
        const entry = valueMap[id];
        if (!entry) { closeValueModal(); return; }

        const newValue = modalEditor.getValue();
        // No change — just close.
        if (newValue === entry.value) { closeValueModal(); return; }

        entry.value = newValue;
        handleConfigChange(id, entry.key, newValue);
        refreshValuePreview(id);
        closeValueModal();
    }

    // Handle config value changes
    function handleConfigChange(id, key, newValue) {
        // Store both the config variable ID and the key for the update
        configChanges[key] = { id, key, value: newValue };
        hasUnsavedChanges = Object.keys(configChanges).length > 0;
        updateSaveButton();
    }

    // Update save button visibility
    function updateSaveButton() {
        const saveBtn = document.getElementById('saveConfigBtn');
        if (saveBtn) {
            if (editMode && hasUnsavedChanges) {
                saveBtn.classList.remove('d-none');
            } else {
                saveBtn.classList.add('d-none');
            }
        }
    }

    // Update edit button state
    function updateEditButton() {
        const editBtn = document.getElementById('toggleEditBtn');
        if (editBtn && selectedInstance) {
            editBtn.disabled = false;
        }
    }

    // Toggle edit mode
    function toggleEditMode() {
        editMode = !editMode;
        
        // If leaving edit mode with unsaved changes, confirm
        if (!editMode && hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to exit edit mode?')) {
                editMode = true;
                return;
            }
            hasUnsavedChanges = false;
            configChanges = {};
        }
        
        // Re-render the current tab
        const activeTab = document.querySelector('.nav-link.active[data-config-tab]');
        if (activeTab && activeTab.dataset.configTab === 'variables' && selectedInstanceConfig) {
            const container = document.getElementById('variables-tab');
            if (container) {
                rebuildValueMap(selectedInstanceConfig);
                container.innerHTML = renderConfigVariables(selectedInstanceConfig);
            }
        }
    }

    // Switch between tabs
    function switchTab(tab) {
        // Update tab navigation
        document.querySelectorAll('[data-config-tab]').forEach(link => {
            link.classList.toggle('active', link.dataset.configTab === tab);
        });

        // Show/hide tab content
        document.getElementById('variables-tab')?.classList.toggle('d-none', tab !== 'variables');
        document.getElementById('json-tab')?.classList.toggle('d-none', tab !== 'json');

        // Initialize Monaco editor if switching to JSON tab
        if (tab === 'json' && selectedInstanceConfig && !monacoEditor) {
            initMonacoEditor();
        }
    }

    // Initialize Monaco editor
    function initMonacoEditor() {
        const container = document.getElementById('monacoContainer');
        if (!container) return;

        // Prepare JSON data
        const configData = prepareConfigJson(selectedInstanceConfig);

        // Load Monaco
        require(['vs/editor/editor.main'], function() {
            if (monacoEditor) {
                monacoEditor.dispose();
            }

            monacoEditor = monaco.editor.create(container, {
                value: JSON.stringify(configData, null, 2),
                language: 'json',
                theme: getCurrentTheme(),
                automaticLayout: true,
                readOnly: !editMode,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: 'on'
            });
        });
    }

    // Prepare config JSON for display/export
    function prepareConfigJson(instance) {
        const configVarsObj = {};
        if (instance.configVariables?.edges) {
            instance.configVariables.edges.forEach(edge => {
                const configVar = edge.node;
                const key = configVar.requiredConfigVariable?.key;
                if (key) {
                    // Apply any unsaved changes
                    const value = configChanges[configVar.id]?.value || configVar.value;
                    configVarsObj[key] = {
                        value: value,
                        dataType: configVar.requiredConfigVariable?.dataType,
                        description: configVar.requiredConfigVariable?.description
                    };
                }
            });
        }

        return {
            instance: {
                id: instance.id,
                name: instance.name,
                enabled: instance.enabled,
                lastDeployedAt: instance.lastDeployedAt,
                lastExecutedAt: instance.lastExecutedAt
            },
            integration: {
                name: instance.integration?.name,
                version: instance.integration?.versionNumber
            },
            customer: instance.customer ? {
                name: instance.customer.name,
                externalId: instance.customer.externalId
            } : null,
            configVariables: configVarsObj
        };
    }

    // Save configuration changes
    async function saveConfiguration() {
        if (!hasUnsavedChanges || Object.keys(configChanges).length === 0) {
            showToast('No changes to save', 'info');
            return;
        }

        try {
            // Show saving state
            const saveBtn = document.getElementById('saveConfigBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            saveBtn.disabled = true;

            // Prepare config variables array for batch update
            const configVariablesToUpdate = Object.values(configChanges).map(change => ({
                key: change.key,
                value: change.value
            }));

            // Update all config variables at once
            await API.updateInstanceConfigVariables(selectedInstance.id, configVariablesToUpdate);

            // Clear changes
            hasUnsavedChanges = false;
            configChanges = {};

            // Update UI
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            updateSaveButton();

            showToast('Configuration saved successfully', 'success');

            // Refresh the config to show saved values
            if (selectedInstance) {
                selectInstance(selectedInstance);
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            showToast(`Failed to save configuration: ${error.message}`, 'error');
            
            // Restore button
            const saveBtn = document.getElementById('saveConfigBtn');
            saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save Changes';
            saveBtn.disabled = false;
        }
    }


    // Utility function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // Cleanup
    function cleanup() {
        if (monacoEditor) {
            monacoEditor.dispose();
            monacoEditor = null;
        }
        closeValueModal();
    }

    // Public methods
    return {
        init,
        onRoute,
        cleanup,
        handleConfigChange,
        toggleEditMode,
        openValueEditor
    };
})();

// Make it globally available
window.ConfigPage = ConfigPage;