// Integrations Page - Detail panel: Monaco editor lifecycle, version metadata, edit-mode toggle
(() => {
    const getState = () => IntegrationsPage._getState();

    // Get current theme
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs';
    }

    // Update Monaco editor theme
    function updateEditorTheme() {
        const state = getState();
        if (state.yamlEditor && typeof monaco !== 'undefined') {
            monaco.editor.setTheme(getCurrentTheme());
        }
    }

    // Setup theme observer to follow website theme
    function setupThemeObserver() {
        const state = getState();
        // Watch for theme changes on document element
        state.themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    updateEditorTheme();
                }
            });
        });

        state.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    // Handle version change
    function handleVersionChange(e) {
        const state = getState();
        const versionNumber = parseInt(e.target.value, 10);
        const selectedOption = e.target.selectedOptions[0];
        const isUnpublished = selectedOption?.dataset.unpublished === 'true';
        const comment = selectedOption?.dataset.comment || '';

        // Reset edit mode when switching versions
        state.isEditModeEnabled = false;
        updateEditModeUI(false);

        // Update version comment display
        IntegrationsPage.updateVersionComment(comment);

        if (versionNumber && state.selectedIntegration) {
            // Update version metadata for the selected version
            updateVersionMetadata(state.selectedIntegration, versionNumber);

            // Check if this is the current version
            const isHistoricalVersion = versionNumber !== state.selectedIntegration.versionNumber;

            // Update Version Swap button visibility
            IntegrationsPage.updateVersionSwapButton(isHistoricalVersion);

            // Update Edit Mode button visibility (only for unpublished versions)
            updateEditModeButton(isUnpublished && !isHistoricalVersion);

            if (!isHistoricalVersion) {
                // Current version - we already have the definition
                state.isCurrentVersionUnpublished = isUnpublished;
                if (state.selectedIntegration.definition) {
                    // Always start in read-only mode, user must enable edit mode explicitly
                    showYamlInEditor(state.selectedIntegration.definition, {
                        readOnly: true
                    });
                }
            } else {
                // Historical version - need to fetch using versionSequenceId and versionNumber
                state.isCurrentVersionUnpublished = false;
                IntegrationsPage.loadVersionDefinition(state.selectedIntegration.versionSequenceId, versionNumber);
            }
        }
    }

    // Toggle edit mode on/off
    function toggleEditMode() {
        const state = getState();
        if (!state.isCurrentVersionUnpublished) {
            IntegrationsPage.showToast('Edit mode is only available for unpublished versions', 'error');
            return;
        }

        if (state.isEditModeEnabled) {
            // Turning off edit mode - check for unsaved changes
            if (state.hasUnsavedChanges) {
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
        const state = getState();
        if (!state.yamlEditor || !state.isCurrentVersionUnpublished) return;

        state.isEditModeEnabled = true;

        // Update Monaco editor to be editable
        state.yamlEditor.updateOptions({ readOnly: false });

        // Update UI
        updateEditModeUI(true);
        updateEditorModeBadges(false);

        // Setup change detection
        state.yamlEditor.onDidChangeModelContent(() => {
            const currentContent = state.yamlEditor.getValue();
            const changed = currentContent !== state.originalYamlContent;
            IntegrationsPage.updateUnsavedChangesState(changed);

            // Debounced YAML validation
            clearTimeout(state.yamlValidationTimeout);
            state.yamlValidationTimeout = setTimeout(() => {
                IntegrationsPage.validateYaml(currentContent);
            }, 500);
        });

        // Show save button and validation
        IntegrationsPage.showSaveButton();
        IntegrationsPage.showYamlValidation();
        IntegrationsPage.validateYaml(state.yamlEditor.getValue());

        IntegrationsPage.showToast('Edit mode enabled. Be careful with your changes!', 'info');
    }

    // Disable edit mode
    function disableEditMode() {
        const state = getState();
        if (!state.yamlEditor) return;

        state.isEditModeEnabled = false;

        // Revert to original content if there were unsaved changes
        if (state.hasUnsavedChanges) {
            state.yamlEditor.setValue(state.originalYamlContent);
        }

        // Update Monaco editor to be read-only
        state.yamlEditor.updateOptions({ readOnly: true });

        // Update UI
        updateEditModeUI(false);
        updateEditorModeBadges(true);

        // Hide save button and validation
        IntegrationsPage.hideSaveButton();
        IntegrationsPage.hideYamlValidation();

        // Reset change state
        state.hasUnsavedChanges = false;
        IntegrationsPage.updateUnsavedChangesState(false);

        IntegrationsPage.showToast('Edit mode disabled', 'info');
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
        const state = getState();
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
        updateEditModeUI(state.isEditModeEnabled);
    }

    // Update version metadata display (publishedBy, latest version with date, status)
    function updateVersionMetadata(integration, currentVersionNumber = null) {
        const publishedByEl = document.getElementById('publishedByDisplay');
        const latestPublishedEl = document.getElementById('latestPublishedDisplay');
        const unpublishedChangesEl = document.getElementById('unpublishedChangesDisplay');
        const publishedByRow = document.getElementById('publishedByRow');

        if (!integration) return;

        const versions = integration.versions?.nodes || [];
        const versionNum = currentVersionNumber || integration.versionNumber;

        // Find the selected version in the versions array
        const selectedVersionData = versions.find(v => v.versionNumber === versionNum);

        // Check if selected version is unpublished (not in published versions list)
        const isSelectedVersionUnpublished = !selectedVersionData;

        // Check if viewing a historical version (not the current working version)
        const isHistoricalVersion = versionNum !== integration.versionNumber;

        // Update published by
        if (publishedByEl && publishedByRow) {
            if (isSelectedVersionUnpublished) {
                publishedByRow.classList.add('d-none');
            } else {
                publishedByRow.classList.remove('d-none');
                const publisherName = IntegrationsPage.getUserDisplayName(selectedVersionData?.publishedBy);
                publishedByEl.textContent = publisherName;
            }
        }

        // Find latest published version and show with publish date
        if (latestPublishedEl) {
            if (versions.length > 0) {
                // Sort by version number descending to find the latest
                const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
                const latestPublished = sortedVersions[0];
                // Format: v5 - 2 hours ago
                const publishDate = IntegrationsPage.formatRelativeTime(latestPublished.publishedAt);
                latestPublishedEl.textContent = `v${latestPublished.versionNumber} - ${publishDate.relative}`;
                latestPublishedEl.title = publishDate.full;
            } else {
                latestPublishedEl.textContent = '-';
                latestPublishedEl.title = '';
            }
        }

        // Update status indicator
        if (unpublishedChangesEl) {
            if (isHistoricalVersion) {
                // Viewing a historical published version
                unpublishedChangesEl.innerHTML = `<span class="badge bg-secondary">Viewing v${versionNum}</span>`;
            } else if (isSelectedVersionUnpublished) {
                // Current version is unpublished
                unpublishedChangesEl.innerHTML = '<span class="badge bg-warning text-dark">Unpublished</span>';
            } else if (integration.hasUnpublishedChanges) {
                // Current version is published but has newer unpublished changes
                unpublishedChangesEl.innerHTML = '<span class="badge bg-info">Has unpublished changes</span>';
            } else {
                // Current version is published and up to date
                unpublishedChangesEl.innerHTML = '<span class="badge bg-success">Published</span>';
            }
        }

        // Update publish button visibility
        const canPublish = !isHistoricalVersion && (isSelectedVersionUnpublished || integration.hasUnpublishedChanges);
        IntegrationsPage.updatePublishButton(canPublish);
    }

    // Show YAML in Monaco editor
    function showYamlInEditor(yamlContent, options = {}) {
        const state = getState();
        const { readOnly = false } = options;

        const container = document.getElementById('yamlEditorContainer');
        if (!container) return;

        // Store original content for change detection
        state.originalYamlContent = yamlContent;
        state.hasUnsavedChanges = false;

        // Update editor mode badges
        updateEditorModeBadges(readOnly);

        // Clear previous content
        container.innerHTML = '';

        // Check if Monaco is available
        if (typeof monaco === 'undefined') {
            container.innerHTML = `
                <pre class="p-3 m-0 h-100 overflow-auto"><code>${IntegrationsPage.escapeHtml(yamlContent)}</code></pre>
            `;
            return;
        }

        // Dispose previous editor if exists
        if (state.yamlEditor) {
            state.yamlEditor.dispose();
            state.yamlEditor = null;
        }

        // Create Monaco editor
        state.yamlEditor = monaco.editor.create(container, {
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
            state.yamlEditor.onDidChangeModelContent(() => {
                const currentContent = state.yamlEditor.getValue();
                const changed = currentContent !== state.originalYamlContent;
                IntegrationsPage.updateUnsavedChangesState(changed);

                // Debounced YAML validation
                clearTimeout(state.yamlValidationTimeout);
                state.yamlValidationTimeout = setTimeout(() => {
                    IntegrationsPage.validateYaml(currentContent);
                }, 500);
            });

            // Show save button and validation for unpublished versions
            IntegrationsPage.showSaveButton();
            IntegrationsPage.showYamlValidation();
            IntegrationsPage.validateYaml(yamlContent);
        } else {
            IntegrationsPage.hideSaveButton();
            IntegrationsPage.hideYamlValidation();
        }

        // Hide unsaved changes badge initially
        IntegrationsPage.updateUnsavedChangesState(false);
    }

    // Update editor mode badges
    function updateEditorModeBadges(readOnly) {
        const state = getState();
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
            if (state.isCurrentVersionUnpublished) {
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

    // Expose on the shared namespace
    IntegrationsPage.getCurrentTheme = getCurrentTheme;
    IntegrationsPage.updateEditorTheme = updateEditorTheme;
    IntegrationsPage.setupThemeObserver = setupThemeObserver;
    IntegrationsPage.handleVersionChange = handleVersionChange;
    IntegrationsPage.toggleEditMode = toggleEditMode;
    IntegrationsPage.enableEditMode = enableEditMode;
    IntegrationsPage.disableEditMode = disableEditMode;
    IntegrationsPage.updateEditModeUI = updateEditModeUI;
    IntegrationsPage.updateEditModeButton = updateEditModeButton;
    IntegrationsPage.updateVersionMetadata = updateVersionMetadata;
    IntegrationsPage.showYamlInEditor = showYamlInEditor;
    IntegrationsPage.updateEditorModeBadges = updateEditorModeBadges;
})();
