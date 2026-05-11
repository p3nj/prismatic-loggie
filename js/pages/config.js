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
    let currentPage = 1;
    const itemsPerPage = 10;
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

        // Initialize current page
        currentPage = 1;
        updatePagination();
    }

    // Render config variables with a clean UI
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

        // Calculate pagination
        const totalItems = configVars.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const currentItems = configVars.slice(startIndex, endIndex);

        let html = `
            <div class="config-variables-container">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <span class="text-muted">Showing ${startIndex + 1}-${endIndex} of ${totalItems} variables</span>
                    </div>
                    <div>
                        <button class="btn btn-sm ${editMode ? 'btn-success' : 'btn-primary'}" id="toggleEditBtn">
                            <i class="bi ${editMode ? 'bi-check-lg' : 'bi-pencil'} me-1"></i>
                            ${editMode ? 'View Mode' : 'Edit Mode'}
                        </button>
                        <button class="btn btn-sm btn-success ${!editMode || !hasUnsavedChanges ? 'd-none' : ''}" id="saveConfigBtn">
                            <i class="bi bi-save me-1"></i>Save Changes
                        </button>
                    </div>
                </div>
                <div class="config-vars-list">
        `;

        currentItems.forEach(edge => {
            const configVar = edge.node;
            const key = configVar.requiredConfigVariable?.key || 'Unknown';
            const value = configVar.value || '';
            const dataType = configVar.requiredConfigVariable?.dataType || 'STRING';
            const description = configVar.requiredConfigVariable?.description || '';
            const isSchedule = configVar.scheduleType && configVar.scheduleType !== 'NONE';

            html += `
                <div class="config-var-item mb-3 p-3 border rounded">
                    <div class="row">
                        <div class="col-md-4">
                            <div class="fw-semibold">${escapeHtml(key)}</div>
                            <small class="text-muted">${escapeHtml(description)}</small>
                            <div class="mt-1">
                                <span class="badge bg-secondary">${dataType}</span>
                                ${isSchedule ? '<span class="badge bg-info ms-1">Schedule</span>' : ''}
                            </div>
                        </div>
                        <div class="col-md-8">
                            ${renderConfigValue(configVar.id, key, value, dataType, editMode)}
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="d-flex justify-content-center mt-4">
                    <nav>
                        <ul class="pagination">
                            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                                <a class="page-link" href="#" onclick="ConfigPage.changePage(${currentPage - 1}); return false;">Previous</a>
                            </li>
        `;

        // Add page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" onclick="ConfigPage.changePage(${i}); return false;">${i}</a>
                    </li>
                `;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
            }
        }

        html += `
                            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                                <a class="page-link" href="#" onclick="ConfigPage.changePage(${currentPage + 1}); return false;">Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>
        `;

        return html;
    }

    // Render config value based on type and edit mode
    function renderConfigValue(id, key, value, dataType, isEditable) {
        const inputId = `config-${id}`;
        
        if (!isEditable) {
            // View mode
            if (dataType === 'BOOLEAN') {
                return `<span class="badge ${value === 'true' ? 'bg-success' : 'bg-secondary'}">${value || 'false'}</span>`;
            } else if (dataType === 'CONNECTION') {
                return `<code class="d-block p-2 bg-light text-wrap">${escapeHtml(value || 'Not configured')}</code>`;
            } else {
                const displayValue = value || '<span class="text-muted">Not set</span>';
                return `<div class="config-value">${value ? escapeHtml(value) : displayValue}</div>`;
            }
        }

        // Edit mode
        if (dataType === 'BOOLEAN') {
            return `
                <div class="form-check form-switch">
                    <input class="form-check-input config-input" type="checkbox" id="${inputId}" 
                           data-config-id="${id}" data-config-key="${key}"
                           ${value === 'true' ? 'checked' : ''} 
                           onchange="ConfigPage.handleConfigChange('${id}', '${key}', this.checked ? 'true' : 'false')">
                    <label class="form-check-label" for="${inputId}">
                        ${value === 'true' ? 'Enabled' : 'Disabled'}
                    </label>
                </div>
            `;
        } else if (dataType === 'PICKLIST') {
            // Would need to fetch picklist options
            return `
                <select class="form-select config-input" id="${inputId}" 
                        data-config-id="${id}" data-config-key="${key}"
                        onchange="ConfigPage.handleConfigChange('${id}', '${key}', this.value)">
                    <option value="${value}">${value || 'Select...'}</option>
                </select>
            `;
        } else if (dataType === 'CODE' || value.length > 100) {
            return `
                <textarea class="form-control config-input" id="${inputId}" rows="3"
                          data-config-id="${id}" data-config-key="${key}"
                          onchange="ConfigPage.handleConfigChange('${id}', '${key}', this.value)">${escapeHtml(value)}</textarea>
            `;
        } else {
            return `
                <input type="text" class="form-control config-input" id="${inputId}" 
                       value="${escapeHtml(value)}" 
                       data-config-id="${id}" data-config-key="${key}"
                       onchange="ConfigPage.handleConfigChange('${id}', '${key}', this.value)">
            `;
        }
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

    // Change page for pagination
    function changePage(page) {
        const configVars = selectedInstanceConfig?.configVariables?.edges || [];
        const totalPages = Math.ceil(configVars.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) return;
        
        currentPage = page;
        const container = document.getElementById('variables-tab');
        if (container && selectedInstanceConfig) {
            container.innerHTML = renderConfigVariables(selectedInstanceConfig);
        }
    }

    // Update pagination
    function updatePagination() {
        // This is handled in renderConfigVariables
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
        changePage,
        handleConfigChange,
        toggleEditMode
    };
})();

// Make it globally available
window.ConfigPage = ConfigPage;