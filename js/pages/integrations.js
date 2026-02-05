// Integrations Page Handler - Template Version Management with Three-Column Layout
const IntegrationsPage = (() => {
    let initialized = false;
    let integrationsData = null;
    let selectedIntegration = null;
    let selectedVersion = null;
    let searchTimeout = null;
    let yamlEditor = null;
    let themeObserver = null;
    let originalYamlContent = ''; // Track original content for change detection
    let hasUnsavedChanges = false;
    let isCurrentVersionUnpublished = false;
    let yamlValidationTimeout = null;
    let isEditModeEnabled = false; // Track if edit mode is explicitly enabled

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
            versionSelect.addEventListener('change', handleVersionChange);
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

        // Save button
        const saveBtn = document.getElementById('saveYamlBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveYamlChanges);
        }

        // Version Swap button
        const versionSwapBtn = document.getElementById('versionSwapBtn');
        if (versionSwapBtn) {
            versionSwapBtn.addEventListener('click', showVersionSwapConfirmation);
        }

        // Edit Mode toggle button
        const editModeBtn = document.getElementById('enableEditModeBtn');
        if (editModeBtn) {
            editModeBtn.addEventListener('click', toggleEditMode);
        }

        // Open in Designer button
        const openDesignerBtn = document.getElementById('openDesignerBtn');
        if (openDesignerBtn) {
            openDesignerBtn.addEventListener('click', openInDesigner);
        }
    }

    // Open the integration in Prismatic Designer
    function openInDesigner() {
        if (!selectedIntegration) {
            showToast('No integration selected', 'error');
            return;
        }

        // Extract the actual ID from the base64-encoded GraphQL ID
        // The ID format is typically: SW50ZWdyYXRpb246YTJhNjE2YTEtOTZiNi00MjViLTgwMTAtZGMzNzVmMTQ2OTdk
        // Which decodes to: Integration:a2a616a1-96b6-425b-8010-dc375f14697d
        let integrationId = selectedIntegration.id;

        try {
            // Try to decode the base64 ID to get the actual UUID
            const decoded = atob(integrationId);
            if (decoded.includes(':')) {
                integrationId = decoded.split(':')[1];
            }
        } catch (e) {
            // If decoding fails, use the ID as-is
            console.log('Using integration ID as-is:', integrationId);
        }

        // Get the current endpoint (e.g., https://app.prismatic.io)
        const endpoint = API.getEndpoint();

        // Construct the designer URL
        const designerUrl = `${endpoint}/designer/${integrationId}/`;

        // Open in a new tab
        window.open(designerUrl, '_blank');
    }

    // Handle version change
    function handleVersionChange(e) {
        const versionNumber = parseInt(e.target.value, 10);
        const selectedOption = e.target.selectedOptions[0];
        const isUnpublished = selectedOption?.dataset.unpublished === 'true';
        const comment = selectedOption?.dataset.comment || '';

        // Reset edit mode when switching versions
        isEditModeEnabled = false;
        updateEditModeUI(false);

        // Update version comment display
        updateVersionComment(comment);

        if (versionNumber && selectedIntegration) {
            // Update version metadata for the selected version
            updateVersionMetadata(selectedIntegration, versionNumber);

            // Check if this is the current version
            const isHistoricalVersion = versionNumber !== selectedIntegration.versionNumber;

            // Update Version Swap button visibility
            updateVersionSwapButton(isHistoricalVersion);

            // Update Edit Mode button visibility (only for unpublished versions)
            updateEditModeButton(isUnpublished && !isHistoricalVersion);

            if (!isHistoricalVersion) {
                // Current version - we already have the definition
                isCurrentVersionUnpublished = isUnpublished;
                if (selectedIntegration.definition) {
                    // Always start in read-only mode, user must enable edit mode explicitly
                    showYamlInEditor(selectedIntegration.definition, {
                        readOnly: true
                    });
                }
            } else {
                // Historical version - need to fetch using versionSequenceId and versionNumber
                isCurrentVersionUnpublished = false;
                loadVersionDefinition(selectedIntegration.versionSequenceId, versionNumber);
            }
        }
    }

    // Update Version Swap button visibility
    function updateVersionSwapButton(isHistoricalVersion) {
        const versionSwapBtn = document.getElementById('versionSwapBtn');
        if (!versionSwapBtn) return;

        if (isHistoricalVersion && selectedIntegration) {
            versionSwapBtn.classList.remove('d-none');
            versionSwapBtn.disabled = false;
        } else {
            versionSwapBtn.classList.add('d-none');
            versionSwapBtn.disabled = true;
        }
    }

    // Toggle edit mode on/off
    function toggleEditMode() {
        if (!isCurrentVersionUnpublished) {
            showToast('Edit mode is only available for unpublished versions', 'error');
            return;
        }

        if (isEditModeEnabled) {
            // Turning off edit mode - check for unsaved changes
            if (hasUnsavedChanges) {
                if (!confirm('You have unsaved changes. Are you sure you want to exit edit mode? Your changes will be lost.')) {
                    return;
                }
            }
            disableEditMode();
        } else {
            enableEditMode();
        }
    }

    // Enable edit mode
    function enableEditMode() {
        if (!yamlEditor || !isCurrentVersionUnpublished) return;

        isEditModeEnabled = true;

        // Update Monaco editor to be editable
        yamlEditor.updateOptions({ readOnly: false });

        // Update UI
        updateEditModeUI(true);
        updateEditorModeBadges(false);

        // Setup change detection
        yamlEditor.onDidChangeModelContent(() => {
            const currentContent = yamlEditor.getValue();
            const changed = currentContent !== originalYamlContent;
            updateUnsavedChangesState(changed);

            // Debounced YAML validation
            clearTimeout(yamlValidationTimeout);
            yamlValidationTimeout = setTimeout(() => {
                validateYaml(currentContent);
            }, 500);
        });

        // Show save button and validation
        showSaveButton();
        showYamlValidation();
        validateYaml(yamlEditor.getValue());

        showToast('Edit mode enabled. Be careful with your changes!', 'info');
    }

    // Disable edit mode
    function disableEditMode() {
        if (!yamlEditor) return;

        isEditModeEnabled = false;

        // Revert to original content if there were unsaved changes
        if (hasUnsavedChanges) {
            yamlEditor.setValue(originalYamlContent);
        }

        // Update Monaco editor to be read-only
        yamlEditor.updateOptions({ readOnly: true });

        // Update UI
        updateEditModeUI(false);
        updateEditorModeBadges(true);

        // Hide save button and validation
        hideSaveButton();
        hideYamlValidation();

        // Reset change state
        hasUnsavedChanges = false;
        updateUnsavedChangesState(false);

        showToast('Edit mode disabled', 'info');
    }

    // Update edit mode UI (button state)
    function updateEditModeUI(editModeOn) {
        const editModeBtn = document.getElementById('enableEditModeBtn');
        const editModeBtnIcon = editModeBtn?.querySelector('i');
        const editModeBtnText = editModeBtn?.querySelector('span');

        if (!editModeBtn) return;

        if (editModeOn) {
            editModeBtn.classList.remove('btn-outline-warning');
            editModeBtn.classList.add('btn-warning');
            if (editModeBtnIcon) {
                editModeBtnIcon.classList.remove('bi-pencil');
                editModeBtnIcon.classList.add('bi-x-circle');
            }
            if (editModeBtnText) {
                editModeBtnText.textContent = 'Exit Edit Mode';
            }
        } else {
            editModeBtn.classList.remove('btn-warning');
            editModeBtn.classList.add('btn-outline-warning');
            if (editModeBtnIcon) {
                editModeBtnIcon.classList.remove('bi-x-circle');
                editModeBtnIcon.classList.add('bi-pencil');
            }
            if (editModeBtnText) {
                editModeBtnText.textContent = 'Enable Edit Mode';
            }
        }
    }

    // Show/hide edit mode section based on version type
    function updateEditModeButton(canEdit) {
        const editModeSection = document.getElementById('editModeSection');
        const editModeBtn = document.getElementById('enableEditModeBtn');

        if (editModeSection) {
            if (canEdit) {
                editModeSection.classList.remove('d-none');
            } else {
                editModeSection.classList.add('d-none');
            }
        }

        // Also update button visibility for legacy support
        if (editModeBtn) {
            if (canEdit) {
                editModeBtn.classList.remove('d-none');
            } else {
                editModeBtn.classList.add('d-none');
            }
        }

        // Reset button state when showing
        updateEditModeUI(isEditModeEnabled);
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

        // Check for unsaved changes before switching
        if (hasUnsavedChanges) {
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

        selectedIntegration = integration;
        hasUnsavedChanges = false;
        isEditModeEnabled = false; // Reset edit mode when switching integrations
        updateEditModeUI(false);

        // Show loading state in panels
        showPanelsLoading();

        try {
            // Fetch integration with versions
            const fullIntegration = await API.fetchIntegrationWithVersions(integrationId);
            selectedIntegration = fullIntegration;

            // Show the panels
            showVersionControlPanel();

            // Update header
            updateIntegrationName(fullIntegration);

            // Populate version selector
            populateVersionSelector(fullIntegration);

            // Check if current version is unpublished (not in published versions list)
            const publishedVersions = fullIntegration.versions?.nodes || [];
            isCurrentVersionUnpublished = !publishedVersions.some(v => v.versionNumber === fullIntegration.versionNumber);

            // Update version comment for current version
            updateVersionComment(fullIntegration.versionComment || '');

            // Update template metadata (created/updated dates)
            updateTemplateMetadata(fullIntegration);

            // Update version metadata (published by, published at, status)
            updateVersionMetadata(fullIntegration);

            // Show/hide edit mode button based on whether current version is unpublished
            updateEditModeButton(isCurrentVersionUnpublished);

            // Show current version's definition in editor
            // Always start in read-only mode - user must enable edit mode explicitly
            if (fullIntegration.definition) {
                showYamlInEditor(fullIntegration.definition, {
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
        selectedVersion = versions.find(v => v.versionNumber === integration.versionNumber);
        if (selectedVersion) {
            selectedVersion.isUnpublished = isCurrentUnpublished;
        }
    }

    // Load specific version definition
    async function loadVersionDefinition(versionSequenceId, versionNumber) {
        showEditorLoading();
        hideYamlValidation();
        hideSaveButton();

        try {
            const version = await API.fetchIntegrationVersionDefinition(versionSequenceId, versionNumber);
            selectedVersion = version;

            if (version && version.definition) {
                // Update comment display
                updateVersionComment(version.versionComment || '');
                // Historical versions are always readonly
                showYamlInEditor(version.definition, {
                    readOnly: true
                });
            } else {
                updateVersionComment('');
                showYamlInEditor('# No definition available for this version', {
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

    // Update template metadata display (createdAt, updatedAt)
    function updateTemplateMetadata(integration) {
        const createdAtEl = document.getElementById('templateCreatedAtDisplay');
        const updatedAtEl = document.getElementById('templateUpdatedAtDisplay');

        if (createdAtEl) {
            const created = formatRelativeTime(integration.createdAt);
            createdAtEl.textContent = created.relative;
            createdAtEl.title = created.full;
        }

        if (updatedAtEl) {
            const updated = formatRelativeTime(integration.updatedAt);
            updatedAtEl.textContent = updated.relative;
            updatedAtEl.title = updated.full;
        }
    }

    // Update version metadata display (publishedBy, publishedAt, latest version, status)
    function updateVersionMetadata(integration, currentVersionNumber = null) {
        const publishedByEl = document.getElementById('publishedByDisplay');
        const publishedAtEl = document.getElementById('publishedAtDisplay');
        const latestPublishedEl = document.getElementById('latestPublishedDisplay');
        const unpublishedChangesEl = document.getElementById('unpublishedChangesDisplay');
        const publishedByRow = document.getElementById('publishedByRow');
        const publishedAtRow = document.getElementById('publishedAtRow');

        const versions = integration.versions?.nodes || [];
        const versionNum = currentVersionNumber || integration.versionNumber;

        // Find the selected version in the versions array
        const selectedVersionData = versions.find(v => v.versionNumber === versionNum);

        // Check if current version is unpublished
        const isUnpublished = !versions.some(v => v.versionNumber === versionNum);

        // Update published by
        if (publishedByEl && publishedByRow) {
            if (isUnpublished) {
                publishedByRow.classList.add('d-none');
            } else {
                publishedByRow.classList.remove('d-none');
                publishedByEl.textContent = getUserDisplayName(selectedVersionData?.publishedBy);
            }
        }

        // Update published at
        if (publishedAtEl && publishedAtRow) {
            if (isUnpublished) {
                publishedAtRow.classList.add('d-none');
            } else {
                publishedAtRow.classList.remove('d-none');
                const published = formatRelativeTime(selectedVersionData?.publishedAt);
                publishedAtEl.textContent = published.relative;
                publishedAtEl.title = published.full;
            }
        }

        // Find latest published version
        if (latestPublishedEl) {
            if (versions.length > 0) {
                // Sort by version number descending to find the latest
                const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
                const latestPublished = sortedVersions[0];
                latestPublishedEl.textContent = `v${latestPublished.versionNumber}`;
            } else {
                latestPublishedEl.textContent = '-';
            }
        }

        // Update status indicator
        if (unpublishedChangesEl) {
            if (isUnpublished) {
                unpublishedChangesEl.innerHTML = '<span class="badge bg-warning text-dark">Unpublished</span>';
            } else if (integration.hasUnpublishedChanges) {
                unpublishedChangesEl.innerHTML = '<span class="badge bg-info">Has unpublished changes</span>';
            } else {
                unpublishedChangesEl.innerHTML = '<span class="badge bg-success">Published</span>';
            }
        }
    }

    // Show YAML in Monaco editor
    function showYamlInEditor(yamlContent, options = {}) {
        const { readOnly = false } = options;

        const container = document.getElementById('yamlEditorContainer');
        if (!container) return;

        // Store original content for change detection
        originalYamlContent = yamlContent;
        hasUnsavedChanges = false;

        // Update editor mode badges
        updateEditorModeBadges(readOnly);

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

        // Setup change detection for editable versions
        if (!readOnly) {
            yamlEditor.onDidChangeModelContent(() => {
                const currentContent = yamlEditor.getValue();
                const changed = currentContent !== originalYamlContent;
                updateUnsavedChangesState(changed);

                // Debounced YAML validation
                clearTimeout(yamlValidationTimeout);
                yamlValidationTimeout = setTimeout(() => {
                    validateYaml(currentContent);
                }, 500);
            });

            // Show save button and validation for unpublished versions
            showSaveButton();
            showYamlValidation();
            validateYaml(yamlContent);
        } else {
            hideSaveButton();
            hideYamlValidation();
        }

        // Hide unsaved changes badge initially
        updateUnsavedChangesState(false);
    }

    // Update editor mode badges
    function updateEditorModeBadges(readOnly) {
        const readOnlyBadge = document.getElementById('editorReadOnlyBadge');
        const editableBadge = document.getElementById('editorEditableBadge');
        const viewModeBadge = document.getElementById('editorViewModeBadge');
        const editorModeIndicator = document.getElementById('editorModeIndicator');

        // Hide all badges first
        if (readOnlyBadge) readOnlyBadge.classList.add('d-none');
        if (editableBadge) editableBadge.classList.add('d-none');
        if (viewModeBadge) viewModeBadge.classList.add('d-none');
        if (editorModeIndicator) editorModeIndicator.classList.add('d-none');

        if (readOnly) {
            if (isCurrentVersionUnpublished) {
                // Unpublished but in view mode (edit mode not enabled)
                if (viewModeBadge) viewModeBadge.classList.remove('d-none');
            } else {
                // Published/historical versions - truly read-only
                if (readOnlyBadge) readOnlyBadge.classList.remove('d-none');
            }
        } else {
            // Edit mode is enabled
            if (editableBadge) editableBadge.classList.remove('d-none');
            if (editorModeIndicator) editorModeIndicator.classList.remove('d-none');
        }
    }

    // Update unsaved changes state
    function updateUnsavedChangesState(hasChanges) {
        hasUnsavedChanges = hasChanges;

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

    // Validate YAML content
    function validateYaml(content) {
        const statusEl = document.getElementById('yamlValidationStatus');
        if (!statusEl) return;

        try {
            // Basic YAML validation using a simple parser check
            // Check for common YAML issues
            const errors = [];

            // Check for tabs (YAML prefers spaces)
            if (content.includes('\t')) {
                errors.push('Contains tab characters (use spaces instead)');
            }

            // Check for trailing spaces that might cause issues
            const lines = content.split('\n');
            let hasIndentIssues = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Check for inconsistent indentation (basic check)
                if (line.match(/^[ ]+[^ ]/)) {
                    const indent = line.match(/^([ ]+)/)[1].length;
                    if (indent % 2 !== 0) {
                        hasIndentIssues = true;
                    }
                }
            }

            if (hasIndentIssues) {
                errors.push('Inconsistent indentation detected');
            }

            // Check for unclosed quotes
            let inSingleQuote = false;
            let inDoubleQuote = false;
            for (const line of lines) {
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    const prevChar = i > 0 ? line[i-1] : '';
                    if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
                        inSingleQuote = !inSingleQuote;
                    } else if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
                        inDoubleQuote = !inDoubleQuote;
                    }
                }
            }

            if (inSingleQuote || inDoubleQuote) {
                errors.push('Unclosed quote detected');
            }

            // Update Monaco editor markers if available
            if (yamlEditor && typeof monaco !== 'undefined') {
                const model = yamlEditor.getModel();
                if (model) {
                    const markers = [];

                    // Add markers for tabs
                    for (let i = 0; i < lines.length; i++) {
                        const tabIndex = lines[i].indexOf('\t');
                        if (tabIndex !== -1) {
                            markers.push({
                                severity: monaco.MarkerSeverity.Warning,
                                message: 'Tab character detected - use spaces instead',
                                startLineNumber: i + 1,
                                startColumn: tabIndex + 1,
                                endLineNumber: i + 1,
                                endColumn: tabIndex + 2
                            });
                        }
                    }

                    monaco.editor.setModelMarkers(model, 'yaml-lint', markers);
                }
            }

            if (errors.length > 0) {
                statusEl.innerHTML = `<span class="text-warning"><i class="bi bi-exclamation-triangle-fill me-1"></i>${errors[0]}</span>`;
                statusEl.className = 'small p-2 rounded border invalid';
            } else {
                statusEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Valid YAML</span>`;
                statusEl.className = 'small p-2 rounded border valid';
            }
        } catch (error) {
            statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>${escapeHtml(error.message)}</span>`;
            statusEl.className = 'small p-2 rounded border invalid';
        }
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

    // Save YAML changes
    async function saveYamlChanges() {
        if (!yamlEditor || !selectedIntegration || !hasUnsavedChanges) return;

        const content = yamlEditor.getValue();
        const saveBtn = document.getElementById('saveYamlBtn');

        // Show confirmation dialog
        if (!confirm(`Save changes to "${selectedIntegration.name}"?\n\nThis will update the unpublished version of the integration.`)) {
            return;
        }

        try {
            // Disable button and show loading state
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            }

            showToast('Saving changes...', 'info');

            // Call import API to save the updated YAML
            const result = await API.importIntegration(content, selectedIntegration.id);

            showToast(`Changes saved successfully (v${result.versionNumber})`, 'success');

            // Update original content to reflect saved state
            originalYamlContent = content;
            hasUnsavedChanges = false;
            updateUnsavedChangesState(false);

            // Reload the integration to show updated versions
            await selectIntegration(selectedIntegration.id);
        } catch (error) {
            console.error('Error saving changes:', error);
            showToast('Save failed: ' + error.message, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = !hasUnsavedChanges;
                saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save Changes';
            }
        }
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

            // Show confirmation modal with preview
            showImportConfirmation(content, file.name);
        } catch (error) {
            console.error('Error reading file:', error);
            showToast('Error reading file: ' + error.message, 'error');
        }

        // Reset file input
        event.target.value = '';
    }

    // Show import confirmation dialog
    function showImportConfirmation(content, filename) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('importConfirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'importConfirmModal';
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content import-confirm-modal">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-upload me-2"></i>Confirm Import</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>You are about to import <strong id="importFileName"></strong> as a new version of <strong id="importIntegrationName"></strong>.</p>
                            <p class="text-warning small"><i class="bi bi-exclamation-triangle me-1"></i>This will create a new version of the integration.</p>
                            <div class="mb-3">
                                <label class="form-label small text-muted">Preview (first 50 lines):</label>
                                <div id="importPreviewContainer" class="import-preview-container">
                                    <pre id="importPreviewContent"></pre>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmImportBtn">
                                <i class="bi bi-upload me-1"></i>Import
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Update modal content
        document.getElementById('importFileName').textContent = filename;
        document.getElementById('importIntegrationName').textContent = selectedIntegration?.name || 'Unknown';

        // Show preview (first 50 lines)
        const previewLines = content.split('\n').slice(0, 50).join('\n');
        const hasMore = content.split('\n').length > 50;
        document.getElementById('importPreviewContent').textContent = previewLines + (hasMore ? '\n... (truncated)' : '');

        // Setup confirm button
        const confirmBtn = document.getElementById('confirmImportBtn');
        confirmBtn.onclick = async () => {
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
            await performImport(content);
        };

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
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

    // Show Version Swap confirmation dialog
    function showVersionSwapConfirmation() {
        if (!selectedIntegration || !selectedVersion) {
            showToast('No version selected', 'error');
            return;
        }

        // Check if viewing historical version
        if (selectedVersion.versionNumber === selectedIntegration.versionNumber) {
            showToast('Version swap is only available for historical versions', 'error');
            return;
        }

        const templateName = selectedIntegration.name.replace(/[^a-z0-9]/gi, '_');
        const viewingVersionNum = selectedVersion.versionNumber;
        const currentVersionNum = selectedIntegration.versionNumber;

        // Create modal if it doesn't exist
        let modal = document.getElementById('versionSwapModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'versionSwapModal';
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title"><i class="bi bi-arrow-left-right me-2"></i>Confirm Version Swap</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info mb-3">
                                <i class="bi bi-info-circle me-2"></i>
                                <strong>What will happen:</strong>
                            </div>
                            <ol class="mb-3">
                                <li class="mb-2">
                                    <strong>Backup:</strong> Your current unpublished version (v<span id="swapCurrentVersion"></span>) will be downloaded as:
                                    <code id="swapBackupFilename" class="d-block mt-1 p-2 bg-light rounded"></code>
                                </li>
                                <li class="mb-2">
                                    <strong>Import:</strong> The historical version (v<span id="swapHistoricalVersion"></span>) you are viewing will be imported as the new unpublished version.
                                </li>
                                <li>
                                    <strong>Reload:</strong> The page will reload to show the latest version.
                                </li>
                            </ol>
                            <div class="alert alert-warning mb-0">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <small>This creates a new version based on the historical definition. The backup file allows you to restore if needed.</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-warning" id="confirmVersionSwapBtn">
                                <i class="bi bi-arrow-left-right me-1"></i>Swap Version
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Update modal content with current values
        document.getElementById('swapCurrentVersion').textContent = currentVersionNum;
        document.getElementById('swapHistoricalVersion').textContent = viewingVersionNum;
        document.getElementById('swapBackupFilename').textContent = `${templateName}-unpublished.yaml`;

        // Setup confirm button
        const confirmBtn = document.getElementById('confirmVersionSwapBtn');
        confirmBtn.onclick = async () => {
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
            await performVersionSwap();
        };

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    // Perform the version swap
    async function performVersionSwap() {
        if (!selectedIntegration || !selectedVersion || !yamlEditor) {
            showToast('Unable to perform version swap', 'error');
            return;
        }

        const templateName = selectedIntegration.name.replace(/[^a-z0-9]/gi, '_');
        const versionSwapBtn = document.getElementById('versionSwapBtn');

        try {
            // Disable button and show loading state
            if (versionSwapBtn) {
                versionSwapBtn.disabled = true;
                versionSwapBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Swapping...';
            }

            // Step 1: Download current unpublished version as backup
            showToast('Downloading current version as backup...', 'info');

            // We need to get the current unpublished version definition
            // It's stored in selectedIntegration.definition
            const currentDefinition = selectedIntegration.definition;
            if (currentDefinition) {
                const backupFilename = `${templateName}-unpublished.yaml`;
                const blob = new Blob([currentDefinition], { type: 'text/yaml' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = backupFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showToast('Backup downloaded successfully', 'success');

                // Small delay to ensure download starts before continuing
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                showToast('Warning: No current definition to backup', 'info');
            }

            // Step 2: Import the historical version (currently in the editor)
            showToast('Importing historical version...', 'info');
            const historicalContent = yamlEditor.getValue();

            const result = await API.importIntegration(historicalContent, selectedIntegration.id);

            showToast(`Version swap complete! New version: v${result.versionNumber}`, 'success');

            // Step 3: Reload to show the latest version
            await selectIntegration(selectedIntegration.id);

        } catch (error) {
            console.error('Error during version swap:', error);
            showToast('Version swap failed: ' + error.message, 'error');
        } finally {
            // Reset button state (though selectIntegration will hide it)
            if (versionSwapBtn) {
                versionSwapBtn.disabled = false;
                versionSwapBtn.innerHTML = '<i class="bi bi-arrow-left-right me-1"></i>Swap to This Version';
            }
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
