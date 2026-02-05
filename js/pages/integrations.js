// Integrations Page Handler - Template Version Management
const IntegrationsPage = (() => {
    let initialized = false;
    let integrationsData = null;
    let selectedIntegration = null;
    let selectedVersion = null;
    let searchTimeout = null;
    let yamlEditor = null;
    let themeObserver = null;

    // Get current theme
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs';
    }

    // Update Monaco editor theme
    function updateEditorTheme() {
        if (yamlEditor && typeof monaco !== 'undefined') {
            monaco.editor.setTheme(getCurrentTheme());
        }
    }

    // Initialize the integrations page
    function init() {
        if (initialized) return;

        setupEventListeners();
        setupThemeObserver();
        initialized = true;
    }

    // Setup theme observer to follow website theme
    function setupThemeObserver() {
        // Watch for theme changes on document element
        themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    updateEditorTheme();
                }
            });
        });

        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    // Setup event listeners
    function setupEventListeners() {
        // Refresh integrations button
        const refreshBtn = document.getElementById('refreshIntegrationsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadIntegrations(true));
        }

        // Search input with debounce
        const searchInput = document.getElementById('integrationSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadIntegrations(true, e.target.value);
                }, 300);
            });
        }

        // Load more integrations button
        const loadMoreBtn = document.getElementById('loadMoreIntegrationsBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMoreIntegrations);
        }

        // Version selector
        const versionSelect = document.getElementById('versionSelect');
        if (versionSelect) {
            versionSelect.addEventListener('change', (e) => {
                const versionNumber = parseInt(e.target.value, 10);
                const selectedOption = e.target.selectedOptions[0];
                const isUnpublished = selectedOption?.dataset.unpublished === 'true';
                const comment = selectedOption?.dataset.comment || '';

                if (versionNumber && selectedIntegration) {
                    // Check if this is the current version
                    if (versionNumber === selectedIntegration.versionNumber) {
                        // Current version - we already have the definition
                        if (selectedIntegration.definition) {
                            showYamlInEditor(selectedIntegration.definition, {
                                readOnly: !isUnpublished,
                                comment: isUnpublished ? '' : comment
                            });
                        }
                    } else {
                        // Historical version - need to fetch using versionSequenceId and versionNumber
                        loadVersionDefinition(selectedIntegration.versionSequenceId, versionNumber);
                    }
                }
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportYamlBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportYaml);
        }

        // Import button
        const importBtn = document.getElementById('importYamlBtn');
        if (importBtn) {
            importBtn.addEventListener('click', importYaml);
        }

        // Import file input
        const importFileInput = document.getElementById('importYamlFile');
        if (importFileInput) {
            importFileInput.addEventListener('change', handleFileImport);
        }
    }

    // Route handler
    function onRoute(params) {
        init();

        if (!API.isAuthenticated()) {
            showAuthRequired();
            return;
        }

        loadIntegrations();
    }

    // Show auth required message
    function showAuthRequired() {
        const list = document.getElementById('integrationsList');
        if (list) {
            list.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="bi bi-key display-4 mb-3 d-block"></i>
                    <p>Please connect to Prismatic first</p>
                </div>
            `;
        }
    }

    // Load integrations list
    async function loadIntegrations(refresh = false, searchTerm = null) {
        const list = document.getElementById('integrationsList');
        const loadMore = document.getElementById('integrationsLoadMore');

        if (!list) return;

        // Show loading state
        if (refresh || !integrationsData) {
            list.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Loading integrations...</span>
                </div>
            `;
        }

        try {
            const options = { first: 20 };
            if (searchTerm) options.searchTerm = searchTerm;

            const data = await API.fetchIntegrations(options);
            integrationsData = data;

            renderIntegrationsList(data.nodes || []);

            // Show/hide load more button
            if (loadMore) {
                if (data.pageInfo?.hasNextPage) {
                    loadMore.classList.remove('d-none');
                } else {
                    loadMore.classList.add('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading integrations:', error);
            list.innerHTML = `
                <div class="text-center text-danger p-4">
                    <i class="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
                    <p>Error loading integrations</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    // Load more integrations (pagination)
    async function loadMoreIntegrations() {
        if (!integrationsData?.pageInfo?.hasNextPage) return;

        const loadMoreBtn = document.getElementById('loadMoreIntegrationsBtn');
        if (loadMoreBtn) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';
        }

        try {
            const searchInput = document.getElementById('integrationSearchInput');
            const searchTerm = searchInput?.value || null;

            const options = {
                first: 20,
                after: integrationsData.pageInfo.endCursor
            };
            if (searchTerm) options.searchTerm = searchTerm;

            const data = await API.fetchIntegrations(options);

            // Append new integrations
            const allNodes = [...(integrationsData.nodes || []), ...(data.nodes || [])];
            integrationsData = {
                ...data,
                nodes: allNodes
            };

            renderIntegrationsList(allNodes);

            // Update load more button
            const loadMore = document.getElementById('integrationsLoadMore');
            if (loadMore) {
                if (data.pageInfo?.hasNextPage) {
                    loadMore.classList.remove('d-none');
                } else {
                    loadMore.classList.add('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading more integrations:', error);
        } finally {
            if (loadMoreBtn) {
                loadMoreBtn.disabled = false;
                loadMoreBtn.innerHTML = 'Load More';
            }
        }
    }

    // Render integrations list
    function renderIntegrationsList(integrations) {
        const list = document.getElementById('integrationsList');
        if (!list) return;

        if (integrations.length === 0) {
            list.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="bi bi-inbox display-4 mb-3 d-block"></i>
                    <p>No integrations found</p>
                </div>
            `;
            return;
        }

        list.innerHTML = integrations.map(integration => `
            <div class="integration-item p-3 border-bottom ${selectedIntegration?.id === integration.id ? 'active' : ''}"
                 data-id="${integration.id}"
                 role="button">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-2">
                        <div class="fw-semibold">${escapeHtml(integration.name)}</div>
                        ${integration.description ? `<small class="text-muted">${escapeHtml(integration.description)}</small>` : ''}
                    </div>
                    <span class="badge bg-secondary">v${integration.versionNumber || '?'}</span>
                </div>
                ${integration.customer ? `<small class="text-muted"><i class="bi bi-building me-1"></i>${escapeHtml(integration.customer.name)}</small>` : ''}
            </div>
        `).join('');

        // Add click handlers
        list.querySelectorAll('.integration-item').forEach(item => {
            item.addEventListener('click', () => {
                selectIntegration(item.dataset.id);
            });
        });
    }

    // Select an integration
    async function selectIntegration(integrationId) {
        const integration = integrationsData?.nodes?.find(i => i.id === integrationId);
        if (!integration) return;

        // Update UI to show selected
        document.querySelectorAll('.integration-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.id === integrationId) {
                item.classList.add('active');
            }
        });

        selectedIntegration = integration;

        // Show loading state in editor panel
        showEditorLoading();

        try {
            // Fetch integration with versions
            const fullIntegration = await API.fetchIntegrationWithVersions(integrationId);
            selectedIntegration = fullIntegration;

            // Update header
            updateEditorHeader(fullIntegration);

            // Populate version selector
            populateVersionSelector(fullIntegration);

            // Check if current version is unpublished (not in published versions list)
            const publishedVersions = fullIntegration.versions?.nodes || [];
            const isCurrentUnpublished = !publishedVersions.some(v => v.versionNumber === fullIntegration.versionNumber);

            // Show current version's definition in editor
            // Unpublished version is editable, published versions are readonly
            if (fullIntegration.definition) {
                showYamlInEditor(fullIntegration.definition, {
                    readOnly: !isCurrentUnpublished,
                    comment: '' // Current version comment is not shown initially
                });
            }

            // Enable buttons
            enableEditorButtons();
        } catch (error) {
            console.error('Error loading integration details:', error);
            showEditorError(error.message);
        }
    }

    // Show loading state in editor
    function showEditorLoading() {
        const editorPanel = document.getElementById('yamlEditorPanel');
        const placeholder = document.getElementById('yamlEditorPlaceholder');

        if (editorPanel) {
            editorPanel.classList.remove('d-none');
        }
        if (placeholder) {
            placeholder.classList.add('d-none');
        }

        const container = document.getElementById('yamlEditorContainer');
        if (container) {
            container.innerHTML = `
                <div class="d-flex justify-content-center align-items-center h-100">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }
    }

    // Show error in editor
    function showEditorError(message) {
        const container = document.getElementById('yamlEditorContainer');
        if (container) {
            container.innerHTML = `
                <div class="d-flex justify-content-center align-items-center h-100 text-danger">
                    <div class="text-center">
                        <i class="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
                        <p>Error loading integration</p>
                        <small>${escapeHtml(message)}</small>
                    </div>
                </div>
            `;
        }
    }

    // Update editor header
    function updateEditorHeader(integration) {
        const nameEl = document.getElementById('selectedIntegrationName');
        if (nameEl) {
            nameEl.textContent = integration.name;
        }
    }

    // Populate version selector
    function populateVersionSelector(integration) {
        const select = document.getElementById('versionSelect');
        if (!select) return;

        const versions = [...(integration.versions?.nodes || [])];

        // Check if current version is in the list of published versions
        const currentVersionInList = versions.some(v => v.versionNumber === integration.versionNumber);

        // If current version is not in the published versions list, it's unpublished
        const isCurrentUnpublished = !currentVersionInList && integration.versionNumber;

        // If current version is not in the list, add it (it's a draft/unpublished version)
        if (isCurrentUnpublished) {
            versions.unshift({
                versionNumber: integration.versionNumber,
                versionComment: integration.versionComment,
                isAvailable: true,
                isUnpublished: true
            });
        }

        // Sort versions by version number descending
        versions.sort((a, b) => b.versionNumber - a.versionNumber);

        select.innerHTML = versions.map(v => {
            const isCurrent = v.versionNumber === integration.versionNumber;
            const availableTag = v.isAvailable === false ? ' [Unavailable]' : '';
            // Show "Unpublished" for the current unpublished version, otherwise show version number
            let label;
            if (v.isUnpublished) {
                label = `v${v.versionNumber} (Unpublished)`;
            } else {
                label = `v${v.versionNumber}${availableTag}`;
            }
            return `<option value="${v.versionNumber}" ${isCurrent ? 'selected' : ''} data-unpublished="${v.isUnpublished || false}" data-comment="${escapeHtml(v.versionComment || '')}">
                ${label}
            </option>`;
        }).join('');

        // Store current version as selected with unpublished flag
        selectedVersion = versions.find(v => v.versionNumber === integration.versionNumber);
        if (selectedVersion) {
            selectedVersion.isUnpublished = isCurrentUnpublished;
        }
    }

    // Load specific version definition
    async function loadVersionDefinition(versionSequenceId, versionNumber) {
        showEditorLoading();

        try {
            const version = await API.fetchIntegrationVersionDefinition(versionSequenceId, versionNumber);
            selectedVersion = version;

            if (version && version.definition) {
                // Historical versions are always readonly
                showYamlInEditor(version.definition, {
                    readOnly: true,
                    comment: version.versionComment || ''
                });
            } else {
                showYamlInEditor('# No definition available for this version', {
                    readOnly: true,
                    comment: ''
                });
            }
        } catch (error) {
            console.error('Error loading version definition:', error);
            // Clear the comment display on error
            updateVersionComment('');
            // Show helpful message for historical versions
            const container = document.getElementById('yamlEditorContainer');
            if (container) {
                container.innerHTML = `
                    <div class="d-flex justify-content-center align-items-center h-100 text-muted">
                        <div class="text-center p-4">
                            <i class="bi bi-clock-history display-4 mb-3 d-block"></i>
                            <p class="mb-2">Error loading version definition.</p>
                            <p class="small">${escapeHtml(error.message)}</p>
                            <p class="small text-muted mt-3">Select the current version to view its definition here.</p>
                        </div>
                    </div>
                `;
            }
        }
    }

    // Update version comment display
    function updateVersionComment(comment) {
        let commentEl = document.getElementById('versionCommentDisplay');

        if (comment) {
            if (!commentEl) {
                // Create comment display element
                const cardBody = document.querySelector('#yamlEditorPanel .card-body');
                if (cardBody) {
                    commentEl = document.createElement('div');
                    commentEl.id = 'versionCommentDisplay';
                    commentEl.className = 'alert alert-info mb-0 rounded-0 border-start-0 border-end-0 py-2';
                    cardBody.insertBefore(commentEl, cardBody.firstChild);
                }
            }
            if (commentEl) {
                commentEl.innerHTML = `<i class="bi bi-chat-left-text me-2"></i><strong>Version Comment:</strong> ${escapeHtml(comment)}`;
                commentEl.classList.remove('d-none');
            }
        } else {
            if (commentEl) {
                commentEl.classList.add('d-none');
            }
        }
    }

    // Show YAML in Monaco editor
    function showYamlInEditor(yamlContent, options = {}) {
        const { readOnly = false, comment = '' } = options;

        const container = document.getElementById('yamlEditorContainer');
        if (!container) return;

        // Update version comment display
        updateVersionComment(comment);

        // Clear previous content
        container.innerHTML = '';

        // Check if Monaco is available
        if (typeof monaco === 'undefined') {
            container.innerHTML = `
                <pre class="p-3 m-0 h-100 overflow-auto"><code>${escapeHtml(yamlContent)}</code></pre>
            `;
            return;
        }

        // Dispose previous editor if exists
        if (yamlEditor) {
            yamlEditor.dispose();
            yamlEditor = null;
        }

        // Create Monaco editor
        yamlEditor = monaco.editor.create(container, {
            value: yamlContent,
            language: 'yaml',
            theme: getCurrentTheme(),
            automaticLayout: true,
            minimap: { enabled: true },
            readOnly: readOnly,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            lineNumbersMinChars: 5,
            renderLineHighlight: 'line',
            folding: true
        });
    }

    // Enable editor buttons
    function enableEditorButtons() {
        const exportBtn = document.getElementById('exportYamlBtn');
        const importBtn = document.getElementById('importYamlBtn');

        if (exportBtn) exportBtn.disabled = false;
        if (importBtn) importBtn.disabled = false;
    }

    // Export YAML to file
    function exportYaml() {
        if (!yamlEditor || !selectedIntegration) return;

        const content = yamlEditor.getValue();
        const versionNum = selectedVersion?.versionNumber || selectedIntegration.versionNumber || 'unknown';
        const filename = `${selectedIntegration.name.replace(/[^a-z0-9]/gi, '_')}_v${versionNum}.yaml`;

        const blob = new Blob([content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('YAML exported successfully', 'success');
    }

    // Trigger file import dialog
    function importYaml() {
        const fileInput = document.getElementById('importYamlFile');
        if (fileInput) {
            fileInput.click();
        }
    }

    // Handle file import
    async function handleFileImport(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();

            // Show in editor first for review
            if (yamlEditor) {
                yamlEditor.setValue(content);
            }

            // Ask for confirmation
            if (confirm(`Import this YAML as a new version of "${selectedIntegration?.name}"?\n\nThis will create a new version of the integration.`)) {
                await performImport(content);
            }
        } catch (error) {
            console.error('Error reading file:', error);
            showToast('Error reading file: ' + error.message, 'error');
        }

        // Reset file input
        event.target.value = '';
    }

    // Perform the import
    async function performImport(yamlContent) {
        if (!selectedIntegration) {
            showToast('Please select an integration first', 'error');
            return;
        }

        try {
            showToast('Importing...', 'info');

            const result = await API.importIntegration(yamlContent, selectedIntegration.id);

            showToast(`Successfully imported as v${result.versionNumber}`, 'success');

            // Reload the integration to show updated versions
            await selectIntegration(selectedIntegration.id);
        } catch (error) {
            console.error('Error importing integration:', error);
            showToast('Import failed: ' + error.message, 'error');
        }
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        // Create toast container if not exists
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }

        const bgClass = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : 'bg-info';
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle';

        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white ${bgClass} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi bi-${icon} me-2"></i>${escapeHtml(message)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        container.appendChild(toastEl);

        const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 3000 });
        toast.show();

        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }

    // HTML escape helper
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Cleanup when leaving page
    function cleanup() {
        if (yamlEditor) {
            yamlEditor.dispose();
            yamlEditor = null;
        }
    }

    return {
        init,
        onRoute,
        cleanup
    };
})();

window.IntegrationsPage = IntegrationsPage;
