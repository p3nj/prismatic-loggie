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
    // For CONNECTION-typed config vars only: pending per-input edits, keyed by
    // config-var ID then input name. Saved as a `values: JSONString` payload
    // (an InputExpression list) on the InputInstanceConfigVariable mutation.
    let connectionInputChanges = {};
    // For SCHEDULE-typed config vars only: pending edits, keyed by config-var
    // ID. Holds the desired `scheduleType` (lowercase enum string),
    // `timeZone`, and `cron` value. Mapped onto an
    // InputInstanceConfigVariable at save time with `scheduleType` +
    // `timeZone` set directly and the cron string carried in `value`.
    let scheduleChanges = {};
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
            const expandBtn = e.target.closest('.conn-expand-toggle');
            if (expandBtn) {
                const card = expandBtn.closest('.config-var-item');
                if (!card) return;
                const grid = card.querySelector('.conn-detail-grid');
                const subline = card.querySelector('.config-var-subline');
                const label = expandBtn.querySelector('.conn-expand-label');
                const wasExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
                expandBtn.setAttribute('aria-expanded', String(!wasExpanded));
                if (grid) grid.classList.toggle('d-none');
                if (subline) subline.classList.toggle('d-none');
                if (label) label.textContent = wasExpanded ? 'Show values' : 'Hide values';
                return;
            }
        });

        // Delegated input/change handler for every edit-mode form input.
        // Each input declares its kind via `data-action` (scalar config var,
        // connection input, or schedule field). Using delegation here instead
        // of inline `onchange="..."` lets us avoid the HTML/JS attribute-
        // escaping minefield around user-supplied config-var keys.
        const onFormChange = (e) => {
            const el = e.target;
            if (!el?.dataset?.action) return;
            const { action, configId, configKey, inputName, field } = el.dataset;
            const value = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : el.value;
            if (action === 'config-input') {
                handleConfigChange(configId, configKey, value);
            } else if (action === 'connection-input') {
                handleConnectionInputChange(configId, configKey, inputName, value);
            } else if (action === 'schedule-input') {
                handleScheduleChange(configId, configKey, field, value);
            }
        };
        document.addEventListener('input', onFormChange);
        document.addEventListener('change', onFormChange);

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
        // Switching instances drops any edit-mode state. Pending changes belong
        // to the old instance; carrying them over (or staying in edit mode
        // with an empty form) is never what the user wants.
        editMode = false;
        hasUnsavedChanges = false;
        configChanges = {};
        connectionInputChanges = {};
        scheduleChanges = {};

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
        { key: 'code',       label: 'Code',         icon: 'bi-code-slash',   types: ['CODE', 'JSONFORM'],                     badgeClass: 'bg-secondary' },
        { key: 'other',      label: 'Other',        icon: 'bi-gear-fill',    types: [],                                      badgeClass: 'bg-dark'      },
    ];

    // Map a SCHEDULE config var's enum + inputs into a human-readable summary.
    // CUSTOM schedules carry their cron expression in `inputs`; the other types
    // are implicit from the enum.
    const SCHEDULE_TYPE_LABELS = {
        NONE:   'No schedule',
        MINUTE: 'Every minute',
        HOUR:   'Hourly',
        DAY:    'Daily',
        WEEK:   'Weekly',
        CUSTOM: 'Custom',
    };

    // Pull a useful inputs map off an InstanceConfigVariable node. Keys come
    // from the Expression's `name` (e.g. "host", "port", "value"); values may
    // be null when the field is a secret.
    function inputsAsObject(node) {
        const edges = node?.inputs?.edges || [];
        const out = {};
        edges.forEach(e => {
            const n = e?.node;
            if (n?.name != null) out[n.name] = n.value;
        });
        return out;
    }

    // Live cron expression for a schedule. Prismatic stores the cron on the
    // top-level `value` field of the InstanceConfigVariable regardless of the
    // `scheduleType` category — e.g. a "MINUTE" preset can still carry a
    // custom-looking `*/15 * * * *` cron. The legacy `inputs` fallback stays
    // for safety in case some integrations are configured the old way.
    function customScheduleValue(node) {
        if (node?.value) return node.value;
        const inputs = inputsAsObject(node);
        return inputs.value ?? inputs.cron ?? inputs.schedule
            ?? Object.values(inputs).find(v => v != null && v !== '') ?? '';
    }

    // Prismatic masks secret connection inputs by returning the literal string
    // "NA" rather than the real value. Echoing "NA" back on save is the way to
    // *not* change a secret; replacing it would overwrite the real value with
    // the string "NA". Field-name heuristics catch common naming patterns
    // (anything matching key/secret/password/token) so the UI can also mask
    // their input boxes regardless of current value.
    // Field-name patterns that should be treated as secrets even when their
    // current value isn't the "NA" mask. We intentionally include `key`
    // (catches `apiKey`, `clientKey`, `signingKey`, …) at the cost of a few
    // false positives (e.g. `monkey` — harmless: a field would just render
    // as a password input). `bearer` and `credential` catch the common
    // OAuth-ish names; `auth` is broad but again the false-positive cost is
    // a masked input, not a leak.
    const SECRET_NAME_RE = /(secret|password|passwd|token|key|credential|bearer|auth)/i;
    function isLikelySecretInput(name, value) {
        if (value === 'NA') return true;
        if (SECRET_NAME_RE.test(name || '')) return true;
        return false;
    }

    // Map the GraphQL `ExpressionType` enum (uppercase: VALUE / CONFIGVAR /
    // REFERENCE / TEMPLATE / COMPLEX) onto the lowercase string form that the
    // mutation expects for `InputExpression.type`. The mutation rejects the
    // uppercase form with "Invalid value provided for Connection config
    // variable".
    const EXPRESSION_TYPE_INPUT_MAP = {
        VALUE: 'value',
        CONFIGVAR: 'configVar',
        REFERENCE: 'reference',
        TEMPLATE: 'template',
        COMPLEX: 'complex',
    };
    function expressionTypeForInput(typeFromResponse) {
        if (!typeFromResponse) return 'value';
        return EXPRESSION_TYPE_INPUT_MAP[typeFromResponse] || String(typeFromResponse).toLowerCase();
    }

    // Build a JSON-friendly representation of the effective value for the JSON
    // view. Scalars stay scalars; CONNECTION/SCHEDULE expand into an object so
    // the JSON view actually shows their detail instead of `null`.
    function effectiveValueForJson(node) {
        const dt = node?.requiredConfigVariable?.dataType || 'STRING';
        if (dt === 'CONNECTION') {
            return {
                status: node.status || null,
                refreshAt: node.refreshAt || null,
                lastSuccessfulRefreshAt: node.lastSuccessfulRefreshAt || null,
                inputs: inputsAsObject(node),
            };
        }
        if (dt === 'SCHEDULE') {
            const cron = customScheduleValue(node);
            const out = {
                scheduleType: node.scheduleType || 'NONE',
                label: SCHEDULE_TYPE_LABELS[node.scheduleType] || node.scheduleType || null,
                timeZone: node.timeZone || null,
                value: cron || null,
            };
            if (node.meta) {
                try { out.meta = typeof node.meta === 'string' ? JSON.parse(node.meta) : node.meta; }
                catch (_e) { out.meta = node.meta; }
            }
            return out;
        }
        return node.value ?? null;
    }

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

        // Sort by sortOrder so headers/dividers appear in wizard sequence
        const sorted = [...configVars].sort((a, b) => {
            const sa = a.node.requiredConfigVariable?.sortOrder ?? 9999;
            const sb = b.node.requiredConfigVariable?.sortOrder ?? 9999;
            return sa - sb;
        });

        // Bucket each variable into its group
        const buckets = Object.fromEntries(TYPE_GROUPS.map(g => [g.key, []]));
        sorted.forEach(edge => {
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
                const dataType    = node.requiredConfigVariable?.dataType || 'STRING';
                // Effective value: scalars stay scalar, CONNECTION/SCHEDULE
                // expand into objects so the renderer can show real detail.
                const value       = (dataType === 'CONNECTION' || dataType === 'SCHEDULE')
                                        ? effectiveValueForJson(node)
                                        : (node.value || '');
                const description = node.requiredConfigVariable?.description || '';
                const header      = node.requiredConfigVariable?.header || '';
                const hasDivider  = node.requiredConfigVariable?.hasDivider || false;
                const status      = node.status || '';
                const rendered    = renderConfigValue(node.id, key, value, dataType, editMode, status, node);
                const isBlock     = rendered.layout === 'block';

                // Section heading and/or divider from the wizard definition.
                // These are full-width siblings inside the grid so the layout
                // still reads as wizard sections.
                if (hasDivider && idx > 0) {
                    html += `<div class="config-section-divider config-var-item--wide"></div>`;
                }
                if (header) {
                    html += `<div class="config-section-header config-var-item--wide">
                        <span class="text-uppercase fw-semibold small text-muted" style="letter-spacing:.05em">${escapeHtml(header)}</span>
                    </div>`;
                }

                const meta = `
                    <div class="config-var-meta">
                        <h6 class="config-var-key mb-0" title="${escapeAttr(key)}">${escapeHtml(key)}</h6>
                        ${description ? `<p class="text-muted small mb-0 mt-1 config-var-desc">${escapeHtml(description)}</p>` : ''}
                    </div>
                `;

                const wideClass = isBlock ? ' config-var-item--wide' : '';
                html += `
                    <div class="config-var-item${wideClass}">
                        ${meta}
                        <div class="config-var-value-col mt-2">${rendered.html}</div>
                    </div>
                `;
            });

            html += `</div></section>`;
        });

        html += `</div>`;
        return html;
    }

    // Render the value cell for a config variable.
    // Returns { layout: 'inline' | 'block', html }.
    function renderConfigValue(id, key, value, dataType, isEditable, status = '', node = null) {
        const inputId = `config-${id}`;
        const safeKey = escapeHtml(key);
        const inline  = (html) => ({ layout: 'inline', html });
        const block   = (html) => ({ layout: 'block', html });

        // STRING and CODE share a compact preview card that opens a full-screen
        // Monaco-backed editor modal on click. The card shows the first few
        // lines of the value plus a type label and an expand hint.
        if (dataType === 'STRING' || dataType === 'CODE' || dataType === 'JSONFORM') {
            return block(renderValuePreview(id, value, dataType, isEditable));
        }

        // ── View mode for badge-style types ───────────────────────────────────
        if (!isEditable) {
            if (dataType === 'CONNECTION') {
                const detail = value && typeof value === 'object' ? value : null;
                const inputsObj = detail?.inputs || {};
                const inputKeys = Object.keys(inputsObj);
                let badge;
                if (status === 'ACTIVE')
                    badge = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Connected</span>`;
                else if (status === 'ERROR' || status === 'FAILED')
                    badge = `<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Error</span>`;
                else if (status === 'PENDING')
                    badge = `<span class="badge bg-warning theme-text"><i class="bi bi-hourglass me-1"></i>Pending</span>`;
                else
                    badge = `<span class="badge bg-warning theme-text"><i class="bi bi-exclamation-circle me-1"></i>Not configured</span>`;

                if (!inputKeys.length) return inline(badge);

                // Clickable summary + collapsed detail grid. The button
                // toggles between the comma-separated name list (compact) and
                // the per-input name/value rows. Secrets render as "•••
                // hidden" rather than the literal "NA" sentinel.
                const detailRows = inputKeys.map(name => {
                    const v = inputsObj[name];
                    const isSecret = isLikelySecretInput(name, v);
                    const displayVal = isSecret ? '•••• hidden' : (v ?? '');
                    return `<div class="conn-detail-row">
                        <span class="conn-detail-name">${escapeHtml(name)}</span>
                        <span class="conn-detail-value${isSecret ? ' is-masked' : ''}">${escapeHtml(displayVal)}</span>
                    </div>`;
                }).join('');
                return inline(`
                    <div class="conn-summary">
                        ${badge}
                        <button type="button" class="btn btn-link btn-sm p-0 ms-2 conn-expand-toggle"
                                aria-expanded="false" aria-label="Toggle connection input values">
                            <span class="conn-expand-label">Show values</span>
                            <i class="bi bi-chevron-down ms-1"></i>
                        </button>
                    </div>
                    <div class="config-var-subline text-muted small mt-1">${escapeHtml(inputKeys.join(', '))}</div>
                    <div class="conn-detail-grid mt-2 d-none">${detailRows}</div>
                `);
            }
            if (dataType === 'BOOLEAN') {
                return inline(value === 'true'
                    ? `<span class="badge bg-success">Enabled</span>`
                    : `<span class="badge bg-secondary">Disabled</span>`);
            }
            if (dataType === 'SCHEDULE') {
                const detail = value && typeof value === 'object' ? value : null;
                const cron = detail?.value || '';
                const labelText = detail?.label || detail?.scheduleType || 'Custom';
                const tz = detail?.timeZone;
                // Show the schedule-type pill and the live cron / timezone
                // inline so the configured value is visible at a glance —
                // no click required. Falls back to just the pill when no cron
                // is set (scheduleType === NONE).
                const cronLine = cron
                    ? `<div class="schedule-view-cron mt-1"><span class="schedule-view-cron-label">cron</span> <code>${escapeHtml(cron)}</code></div>`
                    : '';
                const tzLine = tz
                    ? `<div class="schedule-view-tz small text-muted">${escapeHtml(tz)}</div>`
                    : '';
                return inline(`
                    <div class="schedule-view-summary">
                        <span class="badge bg-info theme-text"><i class="bi bi-clock me-1"></i>${escapeHtml(labelText)}</span>
                    </div>
                    ${cronLine}${tzLine}
                `);
            }
            if (dataType === 'NUMBER') {
                return inline(`<span class="badge bg-light theme-text border">${escapeHtml(value || '—')}</span>`);
            }
            if (dataType === 'PICKLIST') {
                return inline(`<span class="badge bg-light theme-text border">${escapeHtml(value || '—')}</span>`);
            }
            return inline(`<span class="badge bg-light text-muted border">—</span>`);
        }

        // ── Edit mode for the remaining types ─────────────────────────────────
        // All inputs use `data-action="config-input"` + `data-config-id` +
        // `data-config-key` so the delegated input/change listener in
        // setupEventListeners can route the value to handleConfigChange
        // without any inline JS (which would need a separate escape pass).
        const inputIdAttr  = escapeAttr(inputId);
        const idAttr       = escapeAttr(id);
        const keyAttr      = escapeAttr(key);
        if (dataType === 'NUMBER') {
            return inline(`<input type="number" class="form-control form-control-sm config-input"
                        id="${inputIdAttr}"
                        value="${escapeAttr(value)}"
                        data-action="config-input"
                        data-config-id="${idAttr}"
                        data-config-key="${keyAttr}">`);
        }
        if (dataType === 'BOOLEAN') {
            return inline(`
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input config-input" type="checkbox"
                           id="${inputIdAttr}"
                           data-action="config-input"
                           data-config-id="${idAttr}"
                           data-config-key="${keyAttr}"
                           ${value === 'true' ? 'checked' : ''}>
                    <label class="form-check-label small" for="${inputIdAttr}">${value === 'true' ? 'Enabled' : 'Disabled'}</label>
                </div>`);
        }
        if (dataType === 'PICKLIST') {
            return inline(`
                <select class="form-select form-select-sm config-input"
                        id="${inputIdAttr}"
                        data-action="config-input"
                        data-config-id="${idAttr}"
                        data-config-key="${keyAttr}">
                    <option value="${escapeAttr(value)}">${escapeHtml(value || 'Select...')}</option>
                </select>`);
        }
        if (dataType === 'CONNECTION' && node) {
            // Use inline layout (no `config-var-item--wide`) so connection
            // cards stay in the responsive grid in edit mode too. Each card
            // remains the standard ~320px+ width and the form stacks
            // vertically inside it; the grid sizes rows to fit the tallest
            // card so columns line up.
            return inline(renderConnectionEditForm(id, key, node));
        }
        if (dataType === 'SCHEDULE' && node) {
            return inline(renderScheduleEditForm(id, key, node));
        }
        // Anything else not handled — read-only in edit mode.
        return inline(`<span class="badge bg-light text-muted border small">Read-only</span>`);
    }

    // Render the editable connection-inputs form. Each input becomes a labelled
    // row: text or password input depending on whether the field looks like a
    // secret. Pending edits are captured by `handleConnectionInputChange` and
    // flushed on save as `values: JSONString` on the InstanceConfigVariable.
    function renderConnectionEditForm(id, key, node) {
        const edges = node?.inputs?.edges || [];
        if (!edges.length) {
            return `<div class="text-muted small">No editable inputs for this connection.</div>`;
        }
        const idAttr  = escapeAttr(id);
        const keyAttr = escapeAttr(key);
        const rows = edges.map(e => {
            const inp = e?.node || {};
            const name = inp.name || '';
            const value = inp.value ?? '';
            const isSecret = isLikelySecretInput(name, value);
            const inputType = isSecret ? 'password' : 'text';
            // For secrets, show the masked-value placeholder rather than the
            // literal "NA" sentinel — typing a value will overwrite it,
            // leaving the field blank will echo "NA" on save (no change).
            const displayValue = isSecret ? '' : value;
            const placeholder  = isSecret ? '•••• hidden (type to replace)' : '';
            const inputId      = `conn-${id}-${name}`;
            return `
                <div class="connection-input-row">
                    <label class="connection-input-label" for="${escapeAttr(inputId)}">
                        ${escapeHtml(name)}${isSecret ? ' <span class="badge bg-secondary ms-1 align-middle">secret</span>' : ''}
                    </label>
                    <input type="${inputType}" class="form-control form-control-sm connection-input"
                           id="${escapeAttr(inputId)}"
                           value="${escapeAttr(displayValue)}"
                           placeholder="${escapeAttr(placeholder)}"
                           autocomplete="off" spellcheck="false"
                           data-action="connection-input"
                           data-config-id="${idAttr}"
                           data-config-key="${keyAttr}"
                           data-input-name="${escapeAttr(name)}"
                           data-is-secret="${isSecret ? '1' : '0'}">
                </div>
            `;
        }).join('');
        return `<div class="connection-edit-form">${rows}</div>`;
    }

    // Full IANA timezone list straight from the browser. `Intl.supportedValuesOf`
    // ships in every browser since March 2022 (Chrome 99 / Firefox 93 /
    // Safari 15.4); since this tool already requires Monaco + ES2020, that's
    // a safe baseline. Rendered once into a singleton <datalist> that every
    // schedule form references via `list=`.
    function ensureTimezoneDatalist() {
        if (document.getElementById('loggie-timezone-list')) return;
        const zones = Intl.supportedValuesOf('timeZone');
        const dl = document.createElement('datalist');
        dl.id = 'loggie-timezone-list';
        dl.innerHTML = zones
            .map(tz => `<option value="${escapeAttr(tz)}"></option>`)
            .join('');
        document.body.appendChild(dl);
    }

    // Render the editable schedule form. Mirrors Prismatic's own schedule
    // picker: type dropdown + always-visible cron text input + optional IANA
    // timezone (autocomplete via <datalist>). The cron expression lives on
    // the InstanceConfigVariable's top-level `value` field for **every**
    // scheduleType (MINUTE/HOUR/.../CUSTOM all carry a cron); scheduleType is
    // a UI category hint that we send lowercase on the way in (matches the
    // prism CLI's ScheduleTypeEnum).
    function renderScheduleEditForm(id, key, node) {
        ensureTimezoneDatalist();
        const idAttr  = escapeAttr(id);
        const keyAttr = escapeAttr(key);
        const currentType = (node.scheduleType || 'NONE').toUpperCase();
        const tz = node.timeZone || '';
        const currentCron = customScheduleValue(node);
        const opts = [
            ['NONE',   'No schedule'],
            ['MINUTE', 'Every minute'],
            ['HOUR',   'Hourly'],
            ['DAY',    'Daily'],
            ['WEEK',   'Weekly'],
            ['CUSTOM', 'Custom (cron)'],
        ].map(([v, label]) =>
            `<option value="${v}"${v === currentType ? ' selected' : ''}>${escapeHtml(label)}</option>`
        ).join('');
        return `
            <div class="schedule-edit-form" data-config-id="${idAttr}" data-config-key="${keyAttr}">
                <div class="schedule-edit-row">
                    <label class="connection-input-label">Schedule type</label>
                    <select class="form-select form-select-sm schedule-input"
                            data-action="schedule-input"
                            data-config-id="${idAttr}"
                            data-config-key="${keyAttr}"
                            data-field="scheduleType">
                        ${opts}
                    </select>
                </div>
                <div class="schedule-edit-row schedule-cron-row">
                    <label class="connection-input-label">Cron expression</label>
                    <input type="text" class="form-control form-control-sm schedule-input"
                           value="${escapeAttr(currentCron)}"
                           placeholder="e.g. 0 9 * * 1-5"
                           autocomplete="off" spellcheck="false"
                           data-action="schedule-input"
                           data-config-id="${idAttr}"
                           data-config-key="${keyAttr}"
                           data-field="cron">
                </div>
                <div class="schedule-edit-row">
                    <label class="connection-input-label">Timezone <span class="text-muted">(optional)</span></label>
                    <input type="text" class="form-control form-control-sm schedule-input"
                           list="loggie-timezone-list"
                           value="${escapeAttr(tz)}"
                           placeholder="UTC / Australia/Brisbane"
                           autocomplete="off" spellcheck="false"
                           data-action="schedule-input"
                           data-config-id="${idAttr}"
                           data-config-key="${keyAttr}"
                           data-field="timeZone">
                </div>
            </div>
        `;
    }

    // Pretty-print a value if it parses as JSON; otherwise return as-is.
    function beautifyJson(value) {
        const trimmed = (value || '').trim();
        if (!trimmed) return value || '';
        try {
            return JSON.stringify(JSON.parse(trimmed), null, 2);
        } catch (_e) {
            return value;
        }
    }

    // True if the trimmed value parses as a JSON object or array (not a bare scalar).
    function isJsonLike(value) {
        const trimmed = (value || '').trim();
        if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return false;
        try { JSON.parse(trimmed); return true; } catch (_e) { return false; }
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
        if (dataType === 'STRING') return isJsonLike(value) ? 'JSON' : 'String';
        if (dataType === 'JSONFORM') return 'JSON Form';
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
        const display = isJsonLike(value) ? beautifyJson(value) : value;
        const { text, truncated } = getPreviewText(display);
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
        const looksJson = isJsonLike(value);
        if (looksJson) value = beautifyJson(value);
        const language = looksJson ? 'json'
                       : dataType === 'CODE' ? detectCodeLanguage(value)
                       : 'plaintext';

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

    // Handle per-input edits on a CONNECTION config var. We track the delta
    // per (configVarId, inputName); the final payload is assembled at save
    // time so unchanged inputs (including masked secrets) are echoed back
    // verbatim. Inputs are read from `dataset` so values arrive un-escaped.
    function handleConnectionInputChange(id, key, inputName, newValue) {
        const bucket = connectionInputChanges[id] || (connectionInputChanges[id] = { key, inputs: {} });
        bucket.key = key;
        bucket.inputs[inputName] = newValue;
        recomputeUnsaved();
    }

    // Handle edits on a SCHEDULE config var. Tracks the desired scheduleType /
    // timeZone / cron triple under one bucket per config-var ID; the save
    // flow assembles a single InputInstanceConfigVariable per dirty schedule.
    function handleScheduleChange(id, key, field, newValue) {
        const bucket = scheduleChanges[id] || (scheduleChanges[id] = { key });
        bucket.key = key;
        bucket[field] = newValue;
        recomputeUnsaved();
    }

    // Centralised dirty-flag computation across all three change sources.
    function recomputeUnsaved() {
        hasUnsavedChanges =
            Object.keys(configChanges).length > 0
            || Object.values(connectionInputChanges).some(b => Object.keys(b.inputs || {}).length > 0)
            || Object.keys(scheduleChanges).length > 0;
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
            connectionInputChanges = {};
            scheduleChanges = {};
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
                if (!key) return;
                const dataType = configVar.requiredConfigVariable?.dataType;
                // Compute effective value. CONNECTION/SCHEDULE expand into an
                // object with inputs/timeZone/meta so the JSON view shows real
                // detail instead of `null`. Other types keep their scalar
                // `value`, with any unsaved edit applied on top.
                let effective;
                if (dataType === 'CONNECTION' || dataType === 'SCHEDULE') {
                    effective = effectiveValueForJson(configVar);
                } else {
                    effective = configChanges[configVar.id]?.value ?? configVar.value ?? null;
                }
                configVarsObj[key] = {
                    value: effective,
                    dataType,
                    description: configVar.requiredConfigVariable?.description,
                    status: configVar.status || undefined,
                };
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

    // Save configuration changes.
    //
    // Flow:
    //   1. Snapshot the three change buckets up front so any typing that
    //      happens during the in-flight mutation lands in fresh buckets
    //      (no data loss). We diff against the snapshot when clearing state
    //      after success.
    //   2. Build a single `configVariables` array containing scalar, CONNECTION,
    //      and SCHEDULE updates. Prismatic accepts all three shapes through
    //      the same `updateInstanceConfigVariables` mutation.
    //   3. Subtract the snapshot from the live buckets on success so any
    //      *new* typing survives; reset only what was actually sent.
    //   4. Apply the post-save mode preference (view / edit / ask) then call
    //      `selectInstance` to re-fetch — its own reset handles a fresh
    //      slate if the user navigates away after saving.
    async function saveConfiguration() {
        const hasScalarChanges = Object.keys(configChanges).length > 0;
        const hasConnInputChanges = Object.values(connectionInputChanges)
            .some(b => b && Object.keys(b.inputs || {}).length > 0);
        const hasScheduleChanges = Object.keys(scheduleChanges).length > 0;
        if (!hasUnsavedChanges || (!hasScalarChanges && !hasConnInputChanges && !hasScheduleChanges)) {
            showToast('No changes to save', 'info');
            return;
        }

        // Snapshot live buckets — any further keystrokes go into the
        // *real* buckets while this Promise is in flight.
        const scalarSnapshot = { ...configChanges };
        const connSnapshot = JSON.parse(JSON.stringify(connectionInputChanges));
        const schedSnapshot = JSON.parse(JSON.stringify(scheduleChanges));

        const saveBtn = document.getElementById('saveConfigBtn');
        const originalText = saveBtn.innerHTML;

        try {
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            saveBtn.disabled = true;

            const configVariablesToUpdate = buildSavePayload(
                scalarSnapshot, connSnapshot, schedSnapshot, selectedInstanceConfig,
            );

            await API.updateInstanceConfigVariables(selectedInstance.id, configVariablesToUpdate);

            // Drop only the entries we actually sent. Anything that landed in
            // a bucket while the mutation was in flight stays as a new
            // pending change.
            subtractSnapshot(configChanges, scalarSnapshot);
            subtractConnectionSnapshot(connectionInputChanges, connSnapshot);
            subtractSnapshot(scheduleChanges, schedSnapshot);
            recomputeUnsaved();

            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            updateSaveButton();
            showToast('Configuration saved successfully', 'success');

            // Decide whether to drop back to view mode. Persisted user
            // preference wins; otherwise prompt. We change `editMode` *before*
            // the refresh so selectInstance re-renders straight into the
            // chosen mode (no flicker).
            if (editMode) {
                const pref = getPostSavePref();
                const choice = pref === 'ask' ? await showPostSaveModePrompt() : pref;
                if (choice === 'view') editMode = false;
            }

            // Refresh from the server. `selectInstance` also resets the
            // change buckets — that's correct: after a navigation/refresh the
            // user's local pending edits no longer apply to the freshly-
            // fetched data.
            if (selectedInstance) {
                selectInstance(selectedInstance);
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            showToast(`Failed to save configuration: ${error.message}`, 'error');
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    // Pure: turn a snapshot of the three change buckets into the
    // configVariables array the mutation expects. Lives outside
    // saveConfiguration so it's straightforward to unit-test by hand.
    //
    // CONNECTION updates carry their inputs as a `values: JSONString` of
    // InputExpression objects with **lowercase** `type` ("value" /
    // "configVar" / "reference" / "template" / "complex"). The GraphQL
    // response returns the uppercase enum form; sending the uppercase form
    // back is rejected with "Invalid value provided for Connection config
    // variable". Untouched inputs (including masked "NA" secrets) are echoed
    // verbatim — Prismatic treats "NA" as "don't change the secret".
    //
    // SCHEDULE updates send `scheduleType` (lowercase enum), `timeZone`, and
    // the cron in `value` for every type except NONE (which clears the cron).
    function buildSavePayload(scalarChanges, connChanges, schedChanges, currentInstance) {
        const out = Object.values(scalarChanges).map(change => ({
            key: change.key,
            value: change.value,
        }));

        const nodesById = new Map();
        (currentInstance?.configVariables?.edges || []).forEach(e => {
            if (e.node?.id) nodesById.set(e.node.id, e.node);
        });

        for (const [configVarId, bucket] of Object.entries(connChanges)) {
            if (!bucket || !Object.keys(bucket.inputs || {}).length) continue;
            const node = nodesById.get(configVarId);
            if (!node) continue;
            const merged = (node.inputs?.edges || []).map(e => {
                const inp = e.node || {};
                const override = bucket.inputs[inp.name];
                let value = inp.value ?? '';
                if (override !== undefined) {
                    const isSecret = isLikelySecretInput(inp.name, inp.value);
                    // User cleared a masked-secret field → echo "NA" so the
                    // platform leaves the real secret untouched.
                    value = (isSecret && override === '') ? (inp.value ?? '') : override;
                }
                return {
                    name: inp.name,
                    type: expressionTypeForInput(inp.type),
                    value,
                };
            });
            out.push({ key: bucket.key, values: JSON.stringify(merged) });
        }

        for (const [configVarId, bucket] of Object.entries(schedChanges)) {
            if (!bucket) continue;
            const node = nodesById.get(configVarId);
            if (!node) continue;
            const newType = (bucket.scheduleType ?? node.scheduleType ?? 'NONE').toUpperCase();
            const newTz   = bucket.timeZone ?? (node.timeZone || '');
            const newCron = bucket.cron ?? customScheduleValue(node);
            out.push({
                key: bucket.key,
                scheduleType: newType.toLowerCase(),
                timeZone: newTz,
                value: newType === 'NONE' ? '' : (newCron || ''),
            });
        }

        return out;
    }

    // Remove from `live` every key that was present in `snapshot`. Used to
    // clear *only* the changes that were actually saved, leaving any
    // concurrent typing intact.
    function subtractSnapshot(live, snapshot) {
        for (const k of Object.keys(snapshot)) delete live[k];
    }

    // Connection-snapshot subtraction is per-input: we only remove the
    // specific input names that were in the snapshot, not the whole bucket,
    // so concurrent edits on *other* inputs of the same connection survive.
    function subtractConnectionSnapshot(live, snapshot) {
        for (const [configVarId, snapBucket] of Object.entries(snapshot)) {
            const liveBucket = live[configVarId];
            if (!liveBucket) continue;
            for (const inputName of Object.keys(snapBucket.inputs || {})) {
                delete liveBucket.inputs[inputName];
            }
            if (!Object.keys(liveBucket.inputs || {}).length) delete live[configVarId];
        }
    }


    // Persisted preference for what to do after a successful save while in
    // edit mode. Values: 'ask' (default — show the prompt), 'view' (auto
    // switch back), 'edit' (stay in edit mode). The user opts into a remembered
    // choice via the "Don't ask again" checkbox on the prompt.
    const POST_SAVE_PREF_KEY = 'loggie:config:postSaveMode';
    function getPostSavePref() {
        try { return localStorage.getItem(POST_SAVE_PREF_KEY) || 'ask'; }
        catch (_e) { return 'ask'; }
    }
    function setPostSavePref(value) {
        try { localStorage.setItem(POST_SAVE_PREF_KEY, value); } catch (_e) {}
    }

    // Show a small modal asking whether to return to view mode after a save.
    // Resolves to 'view' or 'edit'. If the user ticks "Don't ask again" the
    // choice is persisted to localStorage and future saves skip the prompt.
    function showPostSaveModePrompt() {
        return new Promise(resolve => {
            const existing = document.getElementById('postSaveModePrompt');
            if (existing) existing.remove();
            const wrap = document.createElement('div');
            wrap.id = 'postSaveModePrompt';
            wrap.className = 'post-save-prompt-backdrop';
            wrap.innerHTML = `
                <div class="post-save-prompt-card" role="dialog" aria-modal="true" aria-labelledby="postSavePromptTitle">
                    <h6 id="postSavePromptTitle" class="mb-1">Configuration saved</h6>
                    <p class="small text-muted mb-3">Switch back to View mode?</p>
                    <div class="form-check small mb-3">
                        <input class="form-check-input" type="checkbox" id="postSaveDontAsk">
                        <label class="form-check-label text-muted" for="postSaveDontAsk">Don't ask again</label>
                    </div>
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-choice="edit">Stay in Edit</button>
                        <button type="button" class="btn btn-sm btn-primary" data-choice="view">Switch to View</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrap);
            function done(choice) {
                const remember = wrap.querySelector('#postSaveDontAsk')?.checked;
                if (remember) setPostSavePref(choice);
                wrap.remove();
                resolve(choice);
            }
            wrap.addEventListener('click', (e) => {
                if (e.target === wrap) { done('edit'); return; }
                const btn = e.target.closest('[data-choice]');
                if (btn) done(btn.dataset.choice);
            });
            // Focus the primary action for keyboard users.
            setTimeout(() => wrap.querySelector('[data-choice="view"]')?.focus(), 0);
        });
    }

    // Utility function to escape HTML for **text content** (element bodies).
    // Only escapes `<`, `>`, `&` because that's all textContent serialization
    // covers. Do NOT use this inside an HTML attribute value — use
    // `escapeAttr()` for that, otherwise quotes in the input will break the
    // attribute quoting.
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Escape for **HTML attribute values**. Covers everything `escapeHtml`
    // does, plus `"` and `'` so that interpolating user-controlled text into
    // either `"..."` or `'...'` attribute contexts is safe. Also covers
    // backtick to be defensive against any host that ever templates with it.
    function escapeAttr(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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
        toggleEditMode,
        openValueEditor
    };
})();

// Make it globally available
window.ConfigPage = ConfigPage;