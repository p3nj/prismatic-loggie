// Integrations Page - List/search panel, entry points, shared state and shared helpers
(() => {
    // Shared state for the integrations page. Hung off a private object so
    // detail.js and yaml.js can read/write the same values via IntegrationsPage._getState().
    const state = {
        initialized: false,
        integrationsData: null,
        selectedIntegration: null,
        selectedVersion: null,
        searchTimeout: null,
        yamlEditor: null,
        themeObserver: null,
        originalYamlContent: '', // Track original content for change detection
        hasUnsavedChanges: false,
        isCurrentVersionUnpublished: false,
        yamlValidationTimeout: null,
        isEditModeEnabled: false // Track if edit mode is explicitly enabled
    };
    window._integrationsPageState = state;

    // Initialize the integrations page
    function init() {
        if (state.initialized) return;

        setupEventListeners();
        IntegrationsPage.setupThemeObserver();
        state.initialized = true;
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
                clearTimeout(state.searchTimeout);
                state.searchTimeout = setTimeout(() => {
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
            versionSelect.addEventListener('change', IntegrationsPage.handleVersionChange);
        }

        // Export button
        const exportBtn = document.getElementById('exportYamlBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', IntegrationsPage.exportYaml);
        }

        // Import button
        const importBtn = document.getElementById('importYamlBtn');
        if (importBtn) {
            importBtn.addEventListener('click', IntegrationsPage.importYaml);
        }

        // Import file input
        const importFileInput = document.getElementById('importYamlFile');
        if (importFileInput) {
            importFileInput.addEventListener('change', IntegrationsPage.handleFileImport);
        }

        // Save button
        const saveBtn = document.getElementById('saveYamlBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', IntegrationsPage.saveYamlChanges);
        }

        // Version Swap button
        const versionSwapBtn = document.getElementById('versionSwapBtn');
        if (versionSwapBtn) {
            versionSwapBtn.addEventListener('click', IntegrationsPage.showVersionSwapConfirmation);
        }

        // Edit Mode toggle button
        const editModeBtn = document.getElementById('enableEditModeBtn');
        if (editModeBtn) {
            editModeBtn.addEventListener('click', IntegrationsPage.toggleEditMode);
        }

        // Open in Designer button
        const openDesignerBtn = document.getElementById('openDesignerBtn');
        if (openDesignerBtn) {
            openDesignerBtn.addEventListener('click', openInDesigner);
        }

        // Publish button
        const publishBtn = document.getElementById('publishBtn');
        if (publishBtn) {
            publishBtn.addEventListener('click', IntegrationsPage.showPublishModal);
        }

        // Publish modal confirm button
        const confirmPublishBtn = document.getElementById('confirmPublishBtn');
        if (confirmPublishBtn) {
            confirmPublishBtn.addEventListener('click', IntegrationsPage.handlePublishConfirm);
        }
    }

    // Open the integration in Prismatic Designer
    function openInDesigner() {
        if (!state.selectedIntegration) {
            showToast('No integration selected', 'error');
            return;
        }

        // Use the full base64-encoded GraphQL ID for the designer URL
        // The ID format is: SW50ZWdyYXRpb246YTJhNjE2YTEtOTZiNi00MjViLTgwMTAtZGMzNzVmMTQ2OTdk
        // Prismatic designer URLs expect this full base64 encoded ID
        const integrationId = state.selectedIntegration.id;

        // Get the current endpoint (e.g., https://app.prismatic.io)
        const endpoint = API.getEndpoint();

        // Construct the designer URL with the base64 encoded ID
        const designerUrl = `${endpoint}/designer/${integrationId}/`;

        // Open in a new tab
        window.open(designerUrl, '_blank');
    }

    // Update Version Swap button visibility
    function updateVersionSwapButton(isHistoricalVersion) {
        const versionSwapBtn = document.getElementById('versionSwapBtn');
        if (!versionSwapBtn) return;

        if (isHistoricalVersion && state.selectedIntegration) {
            versionSwapBtn.classList.remove('d-none');
            versionSwapBtn.disabled = false;
        } else {
            versionSwapBtn.classList.add('d-none');
            versionSwapBtn.disabled = true;
        }
    }

    // Show/hide publish button based on whether there are unpublished changes
    function updatePublishButton(canPublish) {
        const publishBtn = document.getElementById('publishBtn');

        if (publishBtn) {
            if (canPublish && state.selectedIntegration) {
                publishBtn.classList.remove('d-none');
                publishBtn.disabled = false;
            } else {
                publishBtn.classList.add('d-none');
                publishBtn.disabled = true;
            }
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
        if (refresh || !state.integrationsData) {
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
            state.integrationsData = data;

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
        if (!state.integrationsData?.pageInfo?.hasNextPage) return;

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
                after: state.integrationsData.pageInfo.endCursor
            };
            if (searchTerm) options.searchTerm = searchTerm;

            const data = await API.fetchIntegrations(options);

            // Append new integrations
            const allNodes = [...(state.integrationsData.nodes || []), ...(data.nodes || [])];
            state.integrationsData = {
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
            <div class="integration-item p-3 border-bottom ${state.selectedIntegration?.id === integration.id ? 'active' : ''}"
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
        const integration = state.integrationsData?.nodes?.find(i => i.id === integrationId);
        if (!integration) return;

        // Check for unsaved changes before switching
        if (state.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to switch integrations? Your changes will be lost.')) {
                return;
            }
        }

        // Update UI to show selected
        document.querySelectorAll('.integration-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.id === integrationId) {
                item.classList.add('active');
            }
        });

        state.selectedIntegration = integration;
        state.hasUnsavedChanges = false;
        state.isEditModeEnabled = false; // Reset edit mode when switching integrations
        IntegrationsPage.updateEditModeUI(false);

        // Show loading state in panels
        showPanelsLoading();

        try {
            // Fetch integration with versions
            const fullIntegration = await API.fetchIntegrationWithVersions(integrationId);
            state.selectedIntegration = fullIntegration;

            // Show the panels
            showVersionControlPanel();

            // Update header
            updateIntegrationName(fullIntegration);

            // Populate version selector
            populateVersionSelector(fullIntegration);

            // Check if current version is unpublished (not in published versions list)
            const publishedVersions = fullIntegration.versions?.nodes || [];
            state.isCurrentVersionUnpublished = !publishedVersions.some(v => v.versionNumber === fullIntegration.versionNumber);

            // Update version comment for current version
            updateVersionComment(fullIntegration.versionComment || '');

            // Update version metadata (published by, latest version with date, status)
            IntegrationsPage.updateVersionMetadata(fullIntegration);

            // Show/hide edit mode button based on whether current version is unpublished
            IntegrationsPage.updateEditModeButton(state.isCurrentVersionUnpublished);

            // Show current version's definition in editor
            // Always start in read-only mode - user must enable edit mode explicitly
            if (fullIntegration.definition) {
                IntegrationsPage.showYamlInEditor(fullIntegration.definition, {
                    readOnly: true
                });
            }

            // Enable buttons
            enableEditorButtons();
        } catch (error) {
            console.error('Error loading integration details:', error);
            showEditorError(error.message);
        }
    }

    // Show panels in loading state
    function showPanelsLoading() {
        // Show version control panel
        const versionControlPanel = document.getElementById('versionControlPanel');
        const versionControlPlaceholder = document.getElementById('versionControlPlaceholder');
        if (versionControlPanel) versionControlPanel.classList.remove('d-none');
        if (versionControlPlaceholder) versionControlPlaceholder.classList.add('d-none');

        // Show editor panel
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

    // Show version control panel
    function showVersionControlPanel() {
        const versionControlPanel = document.getElementById('versionControlPanel');
        const versionControlPlaceholder = document.getElementById('versionControlPlaceholder');
        if (versionControlPanel) versionControlPanel.classList.remove('d-none');
        if (versionControlPlaceholder) versionControlPlaceholder.classList.add('d-none');
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

    // Update integration name display
    function updateIntegrationName(integration) {
        const nameEl = document.getElementById('selectedIntegrationName');
        const templateIdEl = document.getElementById('templateIdDisplay');
        const openDesignerBtn = document.getElementById('openDesignerBtn');

        if (nameEl) {
            nameEl.textContent = integration.name;
            nameEl.title = integration.name; // Full name on hover
        }

        // Show template ID (extract UUID from base64 encoded ID)
        if (templateIdEl) {
            let displayId = integration.id;
            try {
                const decoded = atob(integration.id);
                if (decoded.includes(':')) {
                    displayId = decoded.split(':')[1];
                }
            } catch (e) {
                // Use original ID if decode fails
            }
            // Show truncated ID
            templateIdEl.textContent = displayId.length > 12 ? displayId.substring(0, 12) + '...' : displayId;
            templateIdEl.title = displayId; // Full ID on hover
        }

        // Enable the Open in Designer button
        if (openDesignerBtn) {
            openDesignerBtn.disabled = false;
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
                comment: integration.versionComment, // Integration uses versionComment, Version uses comment
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
            return `<option value="${v.versionNumber}" ${isCurrent ? 'selected' : ''} data-unpublished="${v.isUnpublished || false}" data-comment="${escapeHtml(v.comment || '')}">
                ${label}
            </option>`;
        }).join('');

        // Store current version as selected with unpublished flag
        state.selectedVersion = versions.find(v => v.versionNumber === integration.versionNumber);
        if (state.selectedVersion) {
            state.selectedVersion.isUnpublished = isCurrentUnpublished;
        }
    }

    // Load specific version definition
    async function loadVersionDefinition(versionSequenceId, versionNumber) {
        showEditorLoading();
        hideYamlValidation();
        hideSaveButton();

        try {
            const version = await API.fetchIntegrationVersionDefinition(versionSequenceId, versionNumber);
            state.selectedVersion = version;

            if (version && version.definition) {
                // Update comment display
                updateVersionComment(version.versionComment || '');
                // Historical versions are always readonly
                IntegrationsPage.showYamlInEditor(version.definition, {
                    readOnly: true
                });
            } else {
                updateVersionComment('');
                IntegrationsPage.showYamlInEditor('# No definition available for this version', {
                    readOnly: true
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
        const commentSection = document.getElementById('versionCommentSection');
        const commentEl = document.getElementById('versionCommentDisplay');

        if (comment && comment.trim()) {
            if (commentSection) commentSection.classList.remove('d-none');
            if (commentEl) commentEl.textContent = comment;
        } else {
            if (commentSection) commentSection.classList.add('d-none');
            if (commentEl) commentEl.textContent = '-';
        }
    }

    // Format relative time (e.g., "2 hours ago") with full datetime available
    function formatRelativeTime(dateString) {
        if (!dateString) return { relative: '-', full: '' };

        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        // Full date format for tooltip
        const fullDate = date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let relative;
        if (diffMins < 1) {
            relative = 'Just now';
        } else if (diffMins < 60) {
            relative = `${diffMins}m ago`;
        } else if (diffHours < 24) {
            relative = `${diffHours}h ago`;
        } else if (diffDays < 7) {
            relative = `${diffDays}d ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            relative = `${weeks}w ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            relative = `${months}mo ago`;
        } else {
            const years = Math.floor(diffDays / 365);
            relative = `${years}y ago`;
        }

        return { relative, full: fullDate };
    }

    // Get user display name from user object
    function getUserDisplayName(user) {
        if (!user) return '-';
        return user.name || user.email || '-';
    }

    // Update unsaved changes state
    function updateUnsavedChangesState(hasChanges) {
        state.hasUnsavedChanges = hasChanges;

        const badge = document.getElementById('unsavedChangesBadge');
        const saveBtn = document.getElementById('saveYamlBtn');

        if (hasChanges) {
            if (badge) badge.classList.remove('d-none');
            if (saveBtn) saveBtn.disabled = false;
        } else {
            if (badge) badge.classList.add('d-none');
            if (saveBtn) saveBtn.disabled = true;
        }
    }

    // Show save button
    function showSaveButton() {
        const saveBtn = document.getElementById('saveYamlBtn');
        if (saveBtn) {
            saveBtn.classList.remove('d-none');
            saveBtn.disabled = true; // Disabled until changes are made
        }
    }

    // Hide save button
    function hideSaveButton() {
        const saveBtn = document.getElementById('saveYamlBtn');
        if (saveBtn) {
            saveBtn.classList.add('d-none');
        }
    }

    // Show YAML validation section
    function showYamlValidation() {
        const section = document.getElementById('yamlValidationSection');
        if (section) section.classList.remove('d-none');
    }

    // Hide YAML validation section
    function hideYamlValidation() {
        const section = document.getElementById('yamlValidationSection');
        if (section) section.classList.add('d-none');
    }

    // Enable editor buttons
    function enableEditorButtons() {
        const exportBtn = document.getElementById('exportYamlBtn');
        const importBtn = document.getElementById('importYamlBtn');

        if (exportBtn) exportBtn.disabled = false;
        if (importBtn) importBtn.disabled = false;

        // Hide Version Swap button (only shown for historical versions)
        updateVersionSwapButton(false);
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
        if (state.yamlEditor) {
            state.yamlEditor.dispose();
            state.yamlEditor = null;
        }
    }

    // Expose on the shared namespace
    IntegrationsPage._getState = () => state;
    IntegrationsPage.init = init;
    IntegrationsPage.onRoute = onRoute;
    IntegrationsPage.cleanup = cleanup;
    IntegrationsPage.setupEventListeners = setupEventListeners;
    IntegrationsPage.openInDesigner = openInDesigner;
    IntegrationsPage.updateVersionSwapButton = updateVersionSwapButton;
    IntegrationsPage.updatePublishButton = updatePublishButton;
    IntegrationsPage.showAuthRequired = showAuthRequired;
    IntegrationsPage.loadIntegrations = loadIntegrations;
    IntegrationsPage.loadMoreIntegrations = loadMoreIntegrations;
    IntegrationsPage.renderIntegrationsList = renderIntegrationsList;
    IntegrationsPage.selectIntegration = selectIntegration;
    IntegrationsPage.showPanelsLoading = showPanelsLoading;
    IntegrationsPage.showVersionControlPanel = showVersionControlPanel;
    IntegrationsPage.showEditorLoading = showEditorLoading;
    IntegrationsPage.showEditorError = showEditorError;
    IntegrationsPage.updateIntegrationName = updateIntegrationName;
    IntegrationsPage.populateVersionSelector = populateVersionSelector;
    IntegrationsPage.loadVersionDefinition = loadVersionDefinition;
    IntegrationsPage.updateVersionComment = updateVersionComment;
    IntegrationsPage.formatRelativeTime = formatRelativeTime;
    IntegrationsPage.getUserDisplayName = getUserDisplayName;
    IntegrationsPage.updateUnsavedChangesState = updateUnsavedChangesState;
    IntegrationsPage.showSaveButton = showSaveButton;
    IntegrationsPage.hideSaveButton = hideSaveButton;
    IntegrationsPage.showYamlValidation = showYamlValidation;
    IntegrationsPage.hideYamlValidation = hideYamlValidation;
    IntegrationsPage.enableEditorButtons = enableEditorButtons;
    IntegrationsPage.showToast = showToast;
    IntegrationsPage.escapeHtml = escapeHtml;
})();
