// Integrations Page - YAML actions: validation, save, export, publish, import, version swap
(() => {
    const getState = () => IntegrationsPage._getState();

    // Validate YAML content
    function validateYaml(content) {
        const state = getState();
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
            if (state.yamlEditor && typeof monaco !== 'undefined') {
                const model = state.yamlEditor.getModel();
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
            statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>${IntegrationsPage.escapeHtml(error.message)}</span>`;
            statusEl.className = 'small p-2 rounded border invalid';
        }
    }

    // Save YAML changes
    async function saveYamlChanges() {
        const state = getState();
        if (!state.yamlEditor || !state.selectedIntegration || !state.hasUnsavedChanges) return;

        const content = state.yamlEditor.getValue();
        const saveBtn = document.getElementById('saveYamlBtn');

        // Show confirmation dialog
        if (!confirm(`Save changes to "${state.selectedIntegration.name}"?\n\nThis will update the unpublished version of the integration.`)) {
            return;
        }

        try {
            // Disable button and show loading state
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            }

            IntegrationsPage.showToast('Saving changes...', 'info');

            // Call import API to save the updated YAML
            const result = await API.importIntegration(content, state.selectedIntegration.id);

            IntegrationsPage.showToast(`Changes saved successfully (v${result.versionNumber})`, 'success');

            // Update original content to reflect saved state
            state.originalYamlContent = content;
            state.hasUnsavedChanges = false;
            IntegrationsPage.updateUnsavedChangesState(false);

            // Reload the integration to show updated versions
            await IntegrationsPage.selectIntegration(state.selectedIntegration.id);
        } catch (error) {
            console.error('Error saving changes:', error);
            IntegrationsPage.showToast('Save failed: ' + error.message, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = !state.hasUnsavedChanges;
                saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save Changes';
            }
        }
    }

    // Export YAML to file
    function exportYaml() {
        const state = getState();
        if (!state.yamlEditor || !state.selectedIntegration) return;

        const content = state.yamlEditor.getValue();
        const versionNum = state.selectedVersion?.versionNumber || state.selectedIntegration.versionNumber || 'unknown';
        const filename = `${state.selectedIntegration.name.replace(/[^a-z0-9]/gi, '_')}_v${versionNum}.yaml`;

        const blob = new Blob([content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        IntegrationsPage.showToast('YAML exported successfully', 'success');
    }

    // Show publish modal
    function showPublishModal() {
        const modal = document.getElementById('publishModal');
        const commentInput = document.getElementById('publishComment');

        if (modal && commentInput) {
            // Clear previous comment
            commentInput.value = '';
            // Show the modal using Bootstrap
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }

    // Handle publish confirmation
    async function handlePublishConfirm() {
        const state = getState();
        if (!state.selectedIntegration) {
            IntegrationsPage.showToast('No integration selected', 'error');
            return;
        }

        const modal = document.getElementById('publishModal');
        const commentInput = document.getElementById('publishComment');
        const confirmBtn = document.getElementById('confirmPublishBtn');

        // Get the comment (can be empty)
        const comment = commentInput?.value.trim() || null;

        // Disable button and show loading
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Publishing...';
        }

        try {
            // Call the publish API
            const result = await API.publishIntegration(state.selectedIntegration.id, comment);

            // Close the modal
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();

            // Show success message
            IntegrationsPage.showToast(`Published v${result.versionNumber} successfully`, 'success');

            // Refresh the integration to show new version info
            await IntegrationsPage.selectIntegration(state.selectedIntegration.id);
        } catch (error) {
            console.error('Error publishing integration:', error);
            IntegrationsPage.showToast(`Failed to publish: ${error.message}`, 'error');
        } finally {
            // Reset button state
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="bi bi-cloud-upload me-1"></i>Publish';
            }
        }
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
            IntegrationsPage.showToast('Error reading file: ' + error.message, 'error');
        }

        // Reset file input
        event.target.value = '';
    }

    // Show import confirmation dialog
    function showImportConfirmation(content, filename) {
        const state = getState();
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
        document.getElementById('importIntegrationName').textContent = state.selectedIntegration?.name || 'Unknown';

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
        const state = getState();
        if (!state.selectedIntegration) {
            IntegrationsPage.showToast('Please select an integration first', 'error');
            return;
        }

        try {
            IntegrationsPage.showToast('Importing...', 'info');

            const result = await API.importIntegration(yamlContent, state.selectedIntegration.id);

            IntegrationsPage.showToast(`Successfully imported as v${result.versionNumber}`, 'success');

            // Reload the integration to show updated versions
            await IntegrationsPage.selectIntegration(state.selectedIntegration.id);
        } catch (error) {
            console.error('Error importing integration:', error);
            IntegrationsPage.showToast('Import failed: ' + error.message, 'error');
        }
    }

    // Show Version Swap confirmation dialog
    function showVersionSwapConfirmation() {
        const state = getState();
        if (!state.selectedIntegration || !state.selectedVersion) {
            IntegrationsPage.showToast('No version selected', 'error');
            return;
        }

        // Check if viewing historical version
        if (state.selectedVersion.versionNumber === state.selectedIntegration.versionNumber) {
            IntegrationsPage.showToast('Version swap is only available for historical versions', 'error');
            return;
        }

        const templateName = state.selectedIntegration.name.replace(/[^a-z0-9]/gi, '_');
        const viewingVersionNum = state.selectedVersion.versionNumber;
        const currentVersionNum = state.selectedIntegration.versionNumber;

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
        const state = getState();
        if (!state.selectedIntegration || !state.selectedVersion || !state.yamlEditor) {
            IntegrationsPage.showToast('Unable to perform version swap', 'error');
            return;
        }

        const templateName = state.selectedIntegration.name.replace(/[^a-z0-9]/gi, '_');
        const versionSwapBtn = document.getElementById('versionSwapBtn');

        try {
            // Disable button and show loading state
            if (versionSwapBtn) {
                versionSwapBtn.disabled = true;
                versionSwapBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Swapping...';
            }

            // Step 1: Download current unpublished version as backup
            IntegrationsPage.showToast('Downloading current version as backup...', 'info');

            // We need to get the current unpublished version definition
            // It's stored in selectedIntegration.definition
            const currentDefinition = state.selectedIntegration.definition;
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

                IntegrationsPage.showToast('Backup downloaded successfully', 'success');

                // Small delay to ensure download starts before continuing
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                IntegrationsPage.showToast('Warning: No current definition to backup', 'info');
            }

            // Step 2: Import the historical version (currently in the editor)
            IntegrationsPage.showToast('Importing historical version...', 'info');
            const historicalContent = state.yamlEditor.getValue();

            const result = await API.importIntegration(historicalContent, state.selectedIntegration.id);

            IntegrationsPage.showToast(`Version swap complete! New version: v${result.versionNumber}`, 'success');

            // Step 3: Reload to show the latest version
            await IntegrationsPage.selectIntegration(state.selectedIntegration.id);

        } catch (error) {
            console.error('Error during version swap:', error);
            IntegrationsPage.showToast('Version swap failed: ' + error.message, 'error');
        } finally {
            // Reset button state (though selectIntegration will hide it)
            if (versionSwapBtn) {
                versionSwapBtn.disabled = false;
                versionSwapBtn.innerHTML = '<i class="bi bi-arrow-left-right me-1"></i>Swap to This Version';
            }
        }
    }

    // Expose on the shared namespace
    IntegrationsPage.validateYaml = validateYaml;
    IntegrationsPage.saveYamlChanges = saveYamlChanges;
    IntegrationsPage.exportYaml = exportYaml;
    IntegrationsPage.showPublishModal = showPublishModal;
    IntegrationsPage.handlePublishConfirm = handlePublishConfirm;
    IntegrationsPage.importYaml = importYaml;
    IntegrationsPage.handleFileImport = handleFileImport;
    IntegrationsPage.showImportConfirmation = showImportConfirmation;
    IntegrationsPage.performImport = performImport;
    IntegrationsPage.showVersionSwapConfirmation = showVersionSwapConfirmation;
    IntegrationsPage.performVersionSwap = performVersionSwap;
})();
