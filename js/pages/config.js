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

        // Tab switching
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-config-tab]')) {
                e.preventDefault();
                switchTab(e.target.dataset.configTab);
            }
        });

        // Save button
        const saveBtn = document.getElementById('saveConfigBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveConfiguration);
        }

        // Edit mode toggle
        const editBtn = document.getElementById('toggleEditBtn');
        if (editBtn) {
            editBtn.addEventListener('click', toggleEditMode);
        }

        // Listen for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme' && monacoEditor) {
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

                html += `
                    <div class="config-var-item px-3 py-3 ${isLast ? '' : 'border-bottom'}">
                        <div class="d-flex justify-content-between align-items-start gap-3">
                            <div class="config-var-meta">
                                <h6 class="config-var-key mb-0">${escapeHtml(key)}</h6>
                                ${description ? `<p class="text-muted small mb-0 mt-1">${escapeHtml(description)}</p>` : ''}
                            </div>
                            <div class="config-var-value-col flex-shrink-0">
                                ${renderConfigValue(node.id, key, value, dataType, editMode)}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `</div></section>`;
        });

        html += `</div>`;
        return html;
    }

    // Render the right-hand value column for a config variable
    function renderConfigValue(id, key, value, dataType, isEditable) {
        const inputId = `config-${id}`;
        const safeKey = escapeHtml(key);

        // ── View mode ──────────────────────────────────────────────────────────
        if (!isEditable) {
            if (dataType === 'STRING') {
                return value
                    ? `<span class="config-string-value">${escapeHtml(value)}</span>`
                    : `<span class="text-muted fst-italic small">Not set</span>`;
            }
            if (dataType === 'CONNECTION') {
                return value
                    ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Connected</span>`
                    : `<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Not configured</span>`;
            }
            if (dataType === 'BOOLEAN') {
                return value === 'true'
                    ? `<span class="badge bg-success">Enabled</span>`
                    : `<span class="badge bg-secondary">Disabled</span>`;
            }
            if (dataType === 'SCHEDULE') {
                return `<span class="badge bg-info text-dark"><i class="bi bi-clock me-1"></i>${escapeHtml(value || 'Custom')}</span>`;
            }
            if (dataType === 'NUMBER') {
                return `<span class="badge bg-light text-dark border">${escapeHtml(value || '—')}</span>`;
            }
            if (dataType === 'PICKLIST') {
                return `<span class="badge bg-light text-dark border">${escapeHtml(value || '—')}</span>`;
            }
            // CODE and anything else — no value shown
            return `<span class="badge bg-light text-muted border">Code</span>`;
        }

        // ── Edit mode ──────────────────────────────────────────────────────────
        if (dataType === 'STRING') {
            return `<input type="text" class="form-control form-control-sm config-input" id="${inputId}"
                        value="${escapeHtml(value)}" data-config-id="${id}" data-config-key="${safeKey}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.value)">`;
        }
        if (dataType === 'NUMBER') {
            return `<input type="number" class="form-control form-control-sm config-input" id="${inputId}"
                        value="${escapeHtml(value)}" data-config-id="${id}" data-config-key="${safeKey}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.value)">`;
        }
        if (dataType === 'BOOLEAN') {
            return `
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input config-input" type="checkbox" id="${inputId}"
                           data-config-id="${id}" data-config-key="${safeKey}"
                           ${value === 'true' ? 'checked' : ''}
                           onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.checked ? 'true' : 'false')">
                    <label class="form-check-label small" for="${inputId}">${value === 'true' ? 'Enabled' : 'Disabled'}</label>
                </div>`;
        }
        if (dataType === 'PICKLIST') {
            return `
                <select class="form-select form-select-sm config-input" id="${inputId}"
                        data-config-id="${id}" data-config-key="${safeKey}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${safeKey}', this.value)">
                    <option value="${escapeHtml(value)}">${escapeHtml(value || 'Select...')}</option>
                </select>`;
        }
        // CONNECTION, SCHEDULE, CODE — read-only in edit mode
        return `<span class="badge bg-light text-muted border small">Read-only</span>`;
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
    }

    // Public methods
    return {
        init,
        onRoute,
        cleanup,
        handleConfigChange,
        toggleEditMode
    };
})();

// Make it globally available
window.ConfigPage = ConfigPage;