// Execution rendering: results, step navigation, step output, linked executions.
// Mutates window.UI so call sites can keep using `UI.foo`.
// Cross-file dependencies go via `UI.*` (UI.escapeHtml, UI.detectAndSetupJsonViewers, etc.).
(() => {
    // Display execution results (supports both legacy single-call and progressive loading)
    function displayResults(result, options = {}) {
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');

        if (!resultsDiv) return;

        // Hide error message
        if (errorDiv) {
            errorDiv.classList.add('d-none');
        }

        // Handle legacy format where logs are included in result
        if (result && result.logs && result.logs.edges) {
            resultsDiv.innerHTML = '';

            if (!result.logs.edges.length) {
                resultsDiv.innerHTML = '<div class="col-12">No logs found for this execution</div>';
                return;
            }

            // Build a dictionary of steps with their logs for navigation
            const stepDict = buildStepDictionary(result.logs.edges);

            // Add execution details to sidebar
            addExecutionDetailsToSidebar(result);

            // Update the step navigation in the sidebar
            updateStepNavigation(stepDict);

            const logsHtml = result.logs.edges.map((edge, index) => {
                const log = edge.node;
                return `
                    <div class="col-12 mb-3" id="log-${index}" data-step-name="${log.stepName || 'Unnamed Step'}">
                        <div class="log-card">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h5 class="mb-1">${log.stepName || 'Unnamed Step'}</h5>
                                    <div class="timestamp">${new Date(log.timestamp).toLocaleString()}</div>
                                </div>
                                ${log.loopStepName ? `
                                    <span class="badge bg-secondary">
                                        Loop: ${log.loopStepName} #${log.loopStepIndex}
                                    </span>
                                ` : ''}
                            </div>
                            ${log.loopPath ? `
                                <div class="loop-info mt-2">
                                    Loop Path: ${log.loopPath}
                                </div>
                            ` : ''}
                            <pre class="mt-2 log-message">${log.message}</pre>
                        </div>
                    </div>
                `;
            }).join('');

            resultsDiv.innerHTML = logsHtml;

            // Detect and setup JSON viewers
            UI.detectAndSetupJsonViewers(result.logs.edges);
        }
    }

    // Initialize results container for progressive loading
    function initResultsContainer(executionMetadata) {
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');

        if (!resultsDiv) return;

        // Hide error message
        if (errorDiv) {
            errorDiv.classList.add('d-none');
        }

        // Clear and prepare for logs
        resultsDiv.innerHTML = '';

        // Add execution details to sidebar (metadata only, no logs yet)
        addExecutionDetailsToSidebar(executionMetadata);

        // Clear step navigation for now (will be updated as logs load)
        let stepNav = document.getElementById('step-navigation');
        if (stepNav) {
            stepNav.innerHTML = '<h5 class="border-bottom pb-2 mb-2">Step Navigation</h5><div class="text-muted small">Loading steps...</div>';
        }
    }

    // Render logs incrementally (prepend older logs at the bottom, since we're loading DESC)
    // Logs come in from newest to oldest, so we append them at the end
    function renderLogsIncremental(logEdges, startIndex = 0) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();

        logEdges.forEach((edge, i) => {
            const index = startIndex + i;
            const log = edge.node;

            const logDiv = document.createElement('div');
            logDiv.className = 'col-12 mb-3';
            logDiv.id = `log-${index}`;
            logDiv.dataset.stepName = log.stepName || 'Unnamed Step';

            logDiv.innerHTML = `
                <div class="log-card">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="mb-1">${log.stepName || 'Unnamed Step'}</h5>
                            <div class="timestamp">${new Date(log.timestamp).toLocaleString()}</div>
                        </div>
                        ${log.loopStepName ? `
                            <span class="badge bg-secondary">
                                Loop: ${log.loopStepName} #${log.loopStepIndex}
                            </span>
                        ` : ''}
                    </div>
                    ${log.loopPath ? `
                        <div class="loop-info mt-2">
                            Loop Path: ${log.loopPath}
                        </div>
                    ` : ''}
                    <pre class="mt-2 log-message">${UI.escapeHtml(log.message)}</pre>
                </div>
            `;

            fragment.appendChild(logDiv);
        });

        // Append at the end (logs are coming in DESC order: newest first, then older)
        resultsDiv.appendChild(fragment);

        // Setup JSON viewers only for the new logs
        UI.detectAndSetupJsonViewersForRange(startIndex, startIndex + logEdges.length);
    }

    // Update step navigation with all current logs
    function updateStepNavigationFromLogs(logEdges) {
        const stepDict = buildStepDictionary(logEdges);
        updateStepNavigation(stepDict);
    }

    // Add execution details to the sidebar
    function addExecutionDetailsToSidebar(result) {
        const sidebar = document.querySelector('#page-execution .sidebar');
        if (!sidebar) return;

        // Remove existing execution details if any
        let existingDetails = document.getElementById('execution-details');
        if (existingDetails) {
            existingDetails.remove();
        }

        // Create execution details panel
        const detailsPanel = document.createElement('div');
        detailsPanel.id = 'execution-details';
        detailsPanel.className = 'execution-details mb-4';

        // Get endpoint from API module
        const endpoint = API.getEndpoint();

        // Generate action buttons if we have the required data
        let actionsHtml = '';
        if (result.instance?.id && result.id) {
            const executionUrl = `${endpoint}/instances/${result.instance.id}/executions/?executionId=${result.id}`;
            actionsHtml = `
                <div class="mb-2 mt-3 border-top pt-2">
                    <strong>Actions:</strong>
                    <div class="d-flex flex-wrap gap-1 mt-1">
                        <button class="btn btn-sm btn-outline-warning refire-btn" data-execution-id="${result.id}">
                            <i class="bi bi-arrow-repeat me-1"></i>Refire
                        </button>
                        <a href="${executionUrl}" class="btn btn-sm btn-outline-primary" target="_blank">
                            <i class="bi bi-box-arrow-up-right me-1"></i>Open
                        </a>
                        <button class="btn btn-sm btn-outline-secondary copy-link-btn" data-link="${executionUrl}">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const instanceName = result.instance?.name || 'Unknown';
        const flowName = result.flow?.name || 'Unknown';

        detailsPanel.innerHTML = `
            <h5 class="border-bottom pb-2 mb-2">Execution Details</h5>
            <div class="mb-2">
                <strong>Instance:</strong>
                <div class="detail-text" title="${instanceName}">${instanceName}</div>
            </div>
            <div class="mb-2">
                <strong>Flow:</strong>
                <div class="detail-text" title="${flowName}">${flowName}</div>
            </div>
            <div class="mb-2">
                <strong>Status:</strong>
                <span class="badge ${getStatusBadgeClass(result.status)}">${result.status || 'Unknown'}</span>
            </div>
            <div class="mb-2">
                <strong>Started:</strong>
                <div>${result.startedAt ? new Date(result.startedAt).toLocaleString() : 'Unknown'}</div>
            </div>
            ${actionsHtml}
        `;

        // Insert execution details at the beginning of sidebar, after input fields
        const lastInputGroup = sidebar.querySelector('div.mb-3:last-of-type');
        if (lastInputGroup) {
            lastInputGroup.insertAdjacentElement('afterend', detailsPanel);
        } else {
            sidebar.prepend(detailsPanel);
        }

        // Add event listener for refire button
        const refireButton = detailsPanel.querySelector('.refire-btn');
        if (refireButton) {
            refireButton.addEventListener('click', async function() {
                const executionId = this.getAttribute('data-execution-id');
                if (!confirm('Are you sure you want to refire this execution?\n\nThis will replay the execution with the same input data.')) {
                    return;
                }

                const btn = this;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Refiring...';

                try {
                    const newExecution = await API.replayExecution(executionId);

                    // Replace button with "View Execution" link
                    const viewBtn = document.createElement('button');
                    viewBtn.className = 'btn btn-sm btn-success';
                    viewBtn.innerHTML = '<i class="bi bi-arrow-right me-1"></i>View New Execution';
                    viewBtn.onclick = () => {
                        ExecutionPage.setExecutionId(newExecution.id);
                        ExecutionPage.fetchResults();
                    };
                    btn.replaceWith(viewBtn);
                } catch (error) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Refire';
                    alert('Failed to refire: ' + error.message);
                }
            });
        }

        // Add event listener for copy link button
        const copyButton = detailsPanel.querySelector('.copy-link-btn');
        if (copyButton) {
            copyButton.addEventListener('click', function() {
                const link = this.getAttribute('data-link');
                navigator.clipboard.writeText(link).then(() => {
                    this.innerHTML = '<i class="bi bi-check2"></i>';
                    this.classList.replace('btn-outline-secondary', 'btn-outline-success');
                    setTimeout(() => {
                        this.innerHTML = '<i class="bi bi-clipboard"></i>';
                        this.classList.replace('btn-outline-success', 'btn-outline-secondary');
                    }, 1500);
                });
            });
        }
    }

    // Helper function to get appropriate badge class for status
    function getStatusBadgeClass(status) {
        switch (status) {
            case 'SUCCEEDED':
            case 'SUCCESS':
                return 'bg-success';
            case 'FAILED':
            case 'FAILURE':
            case 'ERROR':
                return 'bg-danger';
            case 'RUNNING':
            case 'IN_PROGRESS':
                return 'bg-primary';
            case 'PENDING':
            case 'QUEUED':
                return 'bg-warning';
            default:
                return 'bg-secondary';
        }
    }

    // Add a welcome message function (deprecated - handled by ExecutionPage)
    function showWelcome() {
        // This function is now handled by ExecutionPage.showWelcome
        // Kept for backward compatibility
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        resultsDiv.innerHTML = `
            <div class="col-12 text-left p-5">
                <div class="log-card">
                    <h2>Execution Log Viewer</h2>
                    <p class="lead">Enter an Execution ID and click "Load" to view execution logs.</p>
                    <hr>
                    <p>This tool helps you analyze and navigate through Prismatic execution logs with features like:</p>
                    <ul>
                        <li>Step-by-step navigation with the TOC sidebar</li>
                        <li>JSON data auto-detection and formatted viewing</li>
                        <li>Loop iterations organized in a tree structure</li>
                        <li>Dark/light theme support</li>
                    </ul>
                    <p class="text-muted">
                        <i class="bi bi-lightbulb me-1"></i>
                        Tip: You can also browse executions by instance from the
                        <a href="#instances" class="text-decoration-none">Instances</a> page.
                    </p>
                </div>
            </div>
        `;
    }

    // Build a hierarchical dictionary of steps for navigation
    function buildStepDictionary(logEdges) {
        const stepDict = {};

        logEdges.forEach((edge, index) => {
            const log = edge.node;
            const stepName = log.stepName || 'Unnamed Step';

            if (!stepDict[stepName]) {
                stepDict[stepName] = {
                    indices: [],
                    loops: {}
                };
            }

            stepDict[stepName].indices.push(index);

            // Track loop relationships if present
            if (log.loopStepName) {
                const loopKey = `${log.loopStepName}_${log.loopStepIndex}`;

                if (!stepDict[stepName].loops[loopKey]) {
                    stepDict[stepName].loops[loopKey] = {
                        name: log.loopStepName,
                        index: log.loopStepIndex,
                        indices: []
                    };
                }

                stepDict[stepName].loops[loopKey].indices.push(index);
            }
        });

        return stepDict;
    }

    // Update the step navigation in the sidebar
    function updateStepNavigation(stepDict) {
        // Create or update the step navigation container
        let stepNav = document.getElementById('step-navigation');
        if (!stepNav) {
            const sidebar = document.querySelector('#page-execution .sidebar');
            if (!sidebar) return;

            stepNav = document.createElement('div');
            stepNav.id = 'step-navigation';
            stepNav.className = 'mt-4';

            const heading = document.createElement('h5');
            heading.textContent = 'Step Navigation';
            heading.className = 'border-bottom pb-2 mb-2';
            stepNav.appendChild(heading);

            sidebar.appendChild(stepNav);
        } else {
            // Clear existing navigation
            stepNav.innerHTML = '<h5 class="border-bottom pb-2 mb-2">Step Navigation</h5>';
        }

        // Create a collapsible tree component
        const navContainer = document.createElement('div');
        navContainer.className = 'step-nav-container mt-2 border rounded p-2 bg-light';
        navContainer.style.maxHeight = '300px';
        navContainer.style.overflowY = 'auto';

        // Build tree structure
        const navTree = document.createElement('ul');
        navTree.className = 'step-nav-tree list-unstyled';

        // Process each step and add to the tree
        for (const stepName in stepDict) {
            const stepData = stepDict[stepName];

            const stepItem = document.createElement('li');
            stepItem.className = 'step-item mb-1';

            // Main step link/header
            const stepHeader = document.createElement('div');
            stepHeader.className = 'd-flex align-items-center';

            // Expand/collapse button for steps with loops
            if (Object.keys(stepData.loops).length > 0) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'btn btn-sm toggle-step me-1 p-0';
                toggleBtn.innerHTML = '<i class="bi bi-caret-right-fill"></i>';
                toggleBtn.style.width = '20px';
                toggleBtn.style.height = '20px';
                toggleBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const icon = this.querySelector('i');
                    const sublist = this.parentNode.nextElementSibling;
                    if (icon.classList.contains('bi-caret-right-fill')) {
                        icon.classList.replace('bi-caret-right-fill', 'bi-caret-down-fill');
                        sublist.style.display = 'block';
                    } else {
                        icon.classList.replace('bi-caret-down-fill', 'bi-caret-right-fill');
                        sublist.style.display = 'none';
                    }
                };
                stepHeader.appendChild(toggleBtn);
            } else {
                // Add spacer for consistent indentation
                const spacer = document.createElement('span');
                spacer.style.width = '20px';
                spacer.style.display = 'inline-block';
                stepHeader.appendChild(spacer);
            }

            // Step link
            const stepLink = document.createElement('a');
            stepLink.href = '#';
            stepLink.className = 'step-link';
            stepLink.textContent = `${stepName} (${stepData.indices.length})`;
            stepLink.onclick = function(e) {
                e.preventDefault();
                // Jump to the first occurrence of this step
                if (stepData.indices.length > 0) {
                    document.getElementById(`log-${stepData.indices[0]}`).scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            };
            stepHeader.appendChild(stepLink);
            stepItem.appendChild(stepHeader);

            // Add loop items if present
            if (Object.keys(stepData.loops).length > 0) {
                const loopList = document.createElement('ul');
                loopList.className = 'loop-list list-unstyled ms-4 mt-1';
                loopList.style.display = 'none'; // Initially collapsed

                for (const loopKey in stepData.loops) {
                    const loopData = stepData.loops[loopKey];

                    const loopItem = document.createElement('li');
                    loopItem.className = 'loop-item mb-1';

                    const loopLink = document.createElement('a');
                    loopLink.href = '#';
                    loopLink.className = 'loop-link';
                    loopLink.textContent = `${loopData.name} #${loopData.index} (${loopData.indices.length})`;
                    loopLink.onclick = function(e) {
                        e.preventDefault();
                        // Jump to the first occurrence of this loop iteration
                        if (loopData.indices.length > 0) {
                            document.getElementById(`log-${loopData.indices[0]}`).scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }
                    };

                    loopItem.appendChild(loopLink);
                    loopList.appendChild(loopItem);
                }

                stepItem.appendChild(loopList);
            }

            navTree.appendChild(stepItem);
        }

        navContainer.appendChild(navTree);
        stepNav.appendChild(navContainer);
    }

    // Helper function to scroll the step navigation container to show a specific item
    function scrollStepNavToItem(item) {
        const navContainer = document.querySelector('.step-nav-container');
        if (!navContainer || !item) return;

        const containerRect = navContainer.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();

        // Check if item is outside the visible area of the container
        const isAbove = itemRect.top < containerRect.top;
        const isBelow = itemRect.bottom > containerRect.bottom;

        if (isAbove || isBelow) {
            // Scroll the item into view within the container
            const scrollTop = item.offsetTop - navContainer.offsetTop - (containerRect.height / 2) + (itemRect.height / 2);
            navContainer.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
        }

        // Highlight the item briefly
        item.classList.add('highlight-step-item');
        setTimeout(() => item.classList.remove('highlight-step-item'), 1500);
    }

    // Combined step navigation: uses logs for hopping and step results for output viewing
    function updateStepNavigationCombined(logEdges, stepResults, executionId) {
        // Build step dictionary from logs (for hopping)
        const stepDict = buildStepDictionary(logEdges);

        // Build step results lookup map by stepName
        const stepResultsMap = new Map();
        // Track unique step names from step results in order of appearance
        const allStepNames = [];
        const seenStepNames = new Set();

        if (stepResults && stepResults.length > 0) {
            stepResults.forEach(step => {
                const key = step.stepName || step.displayStepName;
                if (key) {
                    if (!stepResultsMap.has(key)) {
                        stepResultsMap.set(key, []);
                    }
                    stepResultsMap.get(key).push(step);

                    // Track unique step names in order
                    if (!seenStepNames.has(key)) {
                        seenStepNames.add(key);
                        allStepNames.push(key);
                    }
                }
            });
        }

        // Also add any step names from logs that might not be in step results
        for (const stepName in stepDict) {
            if (!seenStepNames.has(stepName)) {
                seenStepNames.add(stepName);
                allStepNames.push(stepName);
            }
        }

        // Create or update the step navigation container
        let stepNav = document.getElementById('step-navigation');
        if (!stepNav) {
            const sidebar = document.querySelector('#page-execution .sidebar');
            if (!sidebar) return;

            stepNav = document.createElement('div');
            stepNav.id = 'step-navigation';
            stepNav.className = 'mt-4';
            sidebar.appendChild(stepNav);
        }

        // Clear existing navigation
        stepNav.innerHTML = '<h5 class="border-bottom pb-2 mb-2"><i class="bi bi-signpost-split me-2"></i>Step Navigation</h5>';

        // Create navigation container
        const navContainer = document.createElement('div');
        navContainer.className = 'step-nav-container mt-2 border rounded p-2 bg-light';
        navContainer.style.maxHeight = '400px';
        navContainer.style.overflowY = 'auto';

        // Build tree structure
        const navTree = document.createElement('ul');
        navTree.className = 'step-nav-tree list-unstyled mb-0';

        // Process each step from the combined list (step results + logs)
        allStepNames.forEach(stepName => {
            const stepData = stepDict[stepName]; // May be undefined if no logs
            const stepResultsList = stepResultsMap.get(stepName) || [];
            const hasError = stepResultsList.some(s => s.hasError);
            const resultsUrl = stepResultsList.length > 0 ? stepResultsList[0].resultsUrl : null;
            const hasLogs = stepData && stepData.indices && stepData.indices.length > 0;

            const stepItem = document.createElement('li');
            stepItem.className = 'step-item mb-1';

            // Main step link/header
            const stepHeader = document.createElement('div');
            stepHeader.className = 'd-flex align-items-center step-nav-header';

            // Status indicator (from step results if available)
            if (stepResultsList.length > 0) {
                const statusIcon = document.createElement('span');
                statusIcon.className = `step-status-icon me-1 ${hasError ? 'text-danger' : 'text-success'}`;
                statusIcon.innerHTML = hasError ? '<i class="bi bi-x-circle-fill"></i>' : '<i class="bi bi-check-circle-fill"></i>';
                stepHeader.appendChild(statusIcon);
            }

            // Expand/collapse button for steps with loops (only if we have log data)
            const hasLoops = stepData && Object.keys(stepData.loops).length > 0;
            if (hasLoops) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'btn btn-sm toggle-step me-1 p-0';
                toggleBtn.innerHTML = '<i class="bi bi-caret-right-fill"></i>';
                toggleBtn.style.width = '18px';
                toggleBtn.style.height = '18px';
                toggleBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const icon = this.querySelector('i');
                    const sublist = stepItem.querySelector('.loop-list');
                    if (sublist) {
                        if (icon.classList.contains('bi-caret-right-fill')) {
                            icon.classList.replace('bi-caret-right-fill', 'bi-caret-down-fill');
                            sublist.style.display = 'block';
                        } else {
                            icon.classList.replace('bi-caret-down-fill', 'bi-caret-right-fill');
                            sublist.style.display = 'none';
                        }
                    }
                };
                stepHeader.appendChild(toggleBtn);
            } else if (stepResultsList.length === 0) {
                // Add spacer for consistent indentation when no status icon
                const spacer = document.createElement('span');
                spacer.style.width = '18px';
                spacer.style.display = 'inline-block';
                stepHeader.appendChild(spacer);
            }

            // Step link or label based on whether logs exist
            if (hasLogs) {
                // Step link (clicking navigates to log entry)
                const stepLink = document.createElement('a');
                stepLink.href = '#';
                stepLink.className = 'step-link text-truncate flex-grow-1';
                stepLink.textContent = stepName;
                stepLink.title = `${stepName} (${stepData.indices.length} log entries) - Click to navigate`;

                stepLink.onclick = function(e) {
                    e.preventDefault();
                    // Jump to the first occurrence of this step in logs
                    if (stepData.indices.length > 0) {
                        const logElement = document.getElementById(`log-${stepData.indices[0]}`);
                        if (logElement) {
                            logElement.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                            // Highlight the log entry briefly
                            logElement.classList.add('highlight-log');
                            setTimeout(() => logElement.classList.remove('highlight-log'), 2000);
                        }
                    }
                    // Also scroll the step navigation to keep this item visible
                    scrollStepNavToItem(stepItem);
                };
                stepHeader.appendChild(stepLink);

                // Show count badge for logs
                const countBadge = document.createElement('span');
                countBadge.className = 'badge bg-secondary ms-1';
                countBadge.textContent = stepData.indices.length;
                countBadge.style.fontSize = '0.65rem';
                stepHeader.appendChild(countBadge);
            } else {
                // No logs - show as non-clickable label with "output only" indicator
                const stepLabel = document.createElement('span');
                stepLabel.className = 'step-label-no-logs text-truncate flex-grow-1';
                stepLabel.textContent = stepName;
                stepLabel.title = `${stepName} - No logs available (output only)`;
                stepHeader.appendChild(stepLabel);

                // Show "output only" badge
                const outputOnlyBadge = document.createElement('span');
                outputOnlyBadge.className = 'badge bg-light text-muted ms-1 output-only-badge';
                outputOnlyBadge.textContent = 'output only';
                outputOnlyBadge.style.fontSize = '0.6rem';
                stepHeader.appendChild(outputOnlyBadge);
            }

            // View output button if resultsUrl exists
            if (resultsUrl && stepResultsList.length > 0) {
                const viewBtn = document.createElement('button');
                viewBtn.className = 'btn btn-sm btn-outline-info ms-1 p-0 px-1';
                viewBtn.innerHTML = '<i class="bi bi-eye"></i>';
                viewBtn.title = 'View Step Output';
                viewBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    fetchAndShowStepOutput(stepResultsList[0]);
                };
                stepHeader.appendChild(viewBtn);
            }

            stepItem.appendChild(stepHeader);

            // Add loop items if present (only for steps with logs)
            if (hasLoops) {
                const loopList = document.createElement('ul');
                loopList.className = 'loop-list list-unstyled ms-3 mt-1';
                loopList.style.display = 'none'; // Initially collapsed

                // Sort loop keys numerically by index
                const sortedLoopKeys = Object.keys(stepData.loops).sort((a, b) => {
                    const indexA = stepData.loops[a].index;
                    const indexB = stepData.loops[b].index;
                    return indexA - indexB;
                });

                sortedLoopKeys.forEach((loopKey, sortedIdx) => {
                    const loopData = stepData.loops[loopKey];

                    const loopItem = document.createElement('li');
                    loopItem.className = 'loop-item mb-1 d-flex align-items-center';

                    // Loop badge with sequential index
                    const loopBadge = document.createElement('span');
                    loopBadge.className = 'badge bg-info me-1';
                    loopBadge.textContent = `#${loopData.index}`;
                    loopBadge.style.fontSize = '0.6rem';
                    loopItem.appendChild(loopBadge);

                    const loopLink = document.createElement('a');
                    loopLink.href = '#';
                    loopLink.className = 'loop-link small flex-grow-1';
                    loopLink.textContent = loopData.name;
                    loopLink.title = `${loopData.name} iteration ${loopData.index} (${loopData.indices.length} entries)`;
                    loopLink.onclick = function(e) {
                        e.preventDefault();
                        // Jump to the first occurrence of this loop iteration
                        if (loopData.indices.length > 0) {
                            const logElement = document.getElementById(`log-${loopData.indices[0]}`);
                            if (logElement) {
                                logElement.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start'
                                });
                                // Highlight the log entry briefly
                                logElement.classList.add('highlight-log');
                                setTimeout(() => logElement.classList.remove('highlight-log'), 2000);
                            }
                        }
                        // Also scroll the step navigation to keep this item visible
                        scrollStepNavToItem(loopItem);
                    };
                    loopItem.appendChild(loopLink);

                    // Count badge for loop
                    const loopCountBadge = document.createElement('span');
                    loopCountBadge.className = 'badge bg-secondary ms-1';
                    loopCountBadge.textContent = loopData.indices.length;
                    loopCountBadge.style.fontSize = '0.55rem';
                    loopItem.appendChild(loopCountBadge);

                    // Find matching step result for this loop iteration and add view button
                    const loopStepResult = stepResultsList.find(s =>
                        s.loopStepIndex === loopData.index ||
                        (s.loopPath && s.loopPath.includes(loopData.name))
                    );
                    if (loopStepResult && loopStepResult.resultsUrl) {
                        const viewBtn = document.createElement('button');
                        viewBtn.className = 'btn btn-sm btn-outline-info ms-1 p-0 px-1';
                        viewBtn.innerHTML = '<i class="bi bi-eye"></i>';
                        viewBtn.title = 'View Loop Iteration Output';
                        viewBtn.onclick = function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            fetchAndShowStepOutput(loopStepResult);
                        };
                        loopItem.appendChild(viewBtn);
                    }

                    loopList.appendChild(loopItem);
                });

                stepItem.appendChild(loopList);
            }

            navTree.appendChild(stepItem);
        });

        navContainer.appendChild(navTree);
        stepNav.appendChild(navContainer);
    }

    // Get execution ID from input field and save it
    function getExecutionId() {
        const input = document.getElementById('executionId');
        const id = input ? input.value.trim() : '';
        if (id) {
            localStorage.setItem('lastExecutionId', id);
        }
        return id;
    }

    // Build step tree from step results (groups by step and loop)
    function buildStepTree(stepResults) {
        const rootSteps = [];
        const loopSteps = new Map(); // loopPath -> steps

        stepResults.forEach(step => {
            if (step.isRootResult || !step.loopPath) {
                // Root level step
                rootSteps.push({
                    ...step,
                    children: [],
                    loopIterations: new Map()
                });
            } else {
                // Step inside a loop
                const loopPath = step.loopPath;
                if (!loopSteps.has(loopPath)) {
                    loopSteps.set(loopPath, []);
                }
                loopSteps.get(loopPath).push(step);
            }
        });

        // Group loop steps by iteration
        loopSteps.forEach((steps, loopPath) => {
            // Find the parent loop step in root steps
            const parentStep = rootSteps.find(s => s.stepName === loopPath || s.displayStepName === loopPath);
            if (parentStep) {
                steps.forEach(step => {
                    const iterKey = step.loopStepIndex || 0;
                    if (!parentStep.loopIterations.has(iterKey)) {
                        parentStep.loopIterations.set(iterKey, []);
                    }
                    parentStep.loopIterations.get(iterKey).push(step);
                });
            }
        });

        return rootSteps;
    }

    // Update step navigation from step results (new method using stepResults API)
    function updateStepNavigationFromStepResults(stepResults, executionId) {
        let stepNav = document.getElementById('step-navigation');
        if (!stepNav) {
            const sidebar = document.querySelector('#page-execution .sidebar');
            if (!sidebar) return;

            stepNav = document.createElement('div');
            stepNav.id = 'step-navigation';
            stepNav.className = 'mt-4';
            sidebar.appendChild(stepNav);
        }

        // Clear existing navigation
        stepNav.innerHTML = '<h5 class="border-bottom pb-2 mb-2">Steps</h5>';

        // Build step tree
        const stepTree = buildStepTree(stepResults);

        // Create navigation container
        const navContainer = document.createElement('div');
        navContainer.className = 'step-nav-container mt-2 border rounded p-2 bg-light';
        navContainer.style.maxHeight = '400px';
        navContainer.style.overflowY = 'auto';

        // Build tree structure
        const navTree = document.createElement('ul');
        navTree.className = 'step-nav-tree list-unstyled mb-0';

        stepTree.forEach((step, index) => {
            const stepItem = createStepNavItem(step, executionId);
            navTree.appendChild(stepItem);
        });

        navContainer.appendChild(navTree);
        stepNav.appendChild(navContainer);
    }

    // Create a step navigation item
    function createStepNavItem(step, executionId) {
        const stepItem = document.createElement('li');
        stepItem.className = 'step-item mb-1';

        const stepHeader = document.createElement('div');
        stepHeader.className = 'd-flex align-items-center step-nav-header';

        // Status indicator
        const statusIcon = document.createElement('span');
        statusIcon.className = `step-status-icon me-1 ${step.hasError ? 'text-danger' : 'text-success'}`;
        statusIcon.innerHTML = step.hasError ? '<i class="bi bi-x-circle-fill"></i>' : '<i class="bi bi-check-circle-fill"></i>';
        stepHeader.appendChild(statusIcon);

        // Expand/collapse button for loop steps
        const hasLoopIterations = step.loopIterations && step.loopIterations.size > 0;
        if (step.isLoopStep || hasLoopIterations) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn btn-sm toggle-step me-1 p-0';
            toggleBtn.innerHTML = '<i class="bi bi-caret-right-fill"></i>';
            toggleBtn.style.width = '16px';
            toggleBtn.style.height = '16px';
            toggleBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const icon = this.querySelector('i');
                const sublist = stepItem.querySelector('.loop-iterations-list');
                if (sublist) {
                    if (icon.classList.contains('bi-caret-right-fill')) {
                        icon.classList.replace('bi-caret-right-fill', 'bi-caret-down-fill');
                        sublist.style.display = 'block';
                    } else {
                        icon.classList.replace('bi-caret-down-fill', 'bi-caret-right-fill');
                        sublist.style.display = 'none';
                    }
                }
            };
            stepHeader.appendChild(toggleBtn);
        }

        // Step name link
        const stepLink = document.createElement('a');
        stepLink.href = '#';
        stepLink.className = 'step-link text-truncate flex-grow-1';
        stepLink.textContent = step.displayStepName || step.stepName || 'Unknown Step';
        stepLink.title = step.displayStepName || step.stepName;
        stepLink.onclick = function(e) {
            e.preventDefault();
            // Could scroll to step in logs or show step output
            showStepOutput(step, executionId);
        };
        stepHeader.appendChild(stepLink);

        // View output button if resultsUrl exists
        if (step.resultsUrl) {
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-sm btn-outline-info ms-1 p-0 px-1';
            viewBtn.innerHTML = '<i class="bi bi-eye"></i>';
            viewBtn.title = 'View Step Output';
            viewBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                fetchAndShowStepOutput(step);
            };
            stepHeader.appendChild(viewBtn);
        }

        stepItem.appendChild(stepHeader);

        // Add loop iterations if present
        if (hasLoopIterations) {
            const loopList = document.createElement('ul');
            loopList.className = 'loop-iterations-list list-unstyled ms-3 mt-1';
            loopList.style.display = 'none'; // Initially collapsed

            // Sort iterations by index
            const sortedIterations = Array.from(step.loopIterations.entries()).sort((a, b) => a[0] - b[0]);

            sortedIterations.forEach(([iterIndex, iterSteps]) => {
                const iterItem = document.createElement('li');
                iterItem.className = 'loop-iteration-item mb-1';

                const iterHeader = document.createElement('div');
                iterHeader.className = 'd-flex align-items-center';

                // Iteration badge
                const iterBadge = document.createElement('span');
                iterBadge.className = 'badge bg-secondary me-1';
                iterBadge.textContent = `#${iterIndex}`;
                iterHeader.appendChild(iterBadge);

                // Expand button for iteration steps
                if (iterSteps.length > 0) {
                    const iterToggle = document.createElement('button');
                    iterToggle.className = 'btn btn-sm toggle-step me-1 p-0';
                    iterToggle.innerHTML = '<i class="bi bi-caret-right-fill"></i>';
                    iterToggle.style.width = '14px';
                    iterToggle.style.height = '14px';
                    iterToggle.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const icon = this.querySelector('i');
                        const stepsList = iterItem.querySelector('.iteration-steps-list');
                        if (stepsList) {
                            if (icon.classList.contains('bi-caret-right-fill')) {
                                icon.classList.replace('bi-caret-right-fill', 'bi-caret-down-fill');
                                stepsList.style.display = 'block';
                            } else {
                                icon.classList.replace('bi-caret-down-fill', 'bi-caret-right-fill');
                                stepsList.style.display = 'none';
                            }
                        }
                    };
                    iterHeader.appendChild(iterToggle);
                }

                // Iteration step count
                const iterCount = document.createElement('span');
                iterCount.className = 'text-muted small';
                iterCount.textContent = `${iterSteps.length} step${iterSteps.length !== 1 ? 's' : ''}`;
                iterHeader.appendChild(iterCount);

                iterItem.appendChild(iterHeader);

                // Add steps within this iteration
                if (iterSteps.length > 0) {
                    const stepsList = document.createElement('ul');
                    stepsList.className = 'iteration-steps-list list-unstyled ms-3 mt-1';
                    stepsList.style.display = 'none';

                    iterSteps.forEach(iterStep => {
                        const subStepItem = document.createElement('li');
                        subStepItem.className = 'sub-step-item d-flex align-items-center mb-1';

                        // Status icon
                        const subStatus = document.createElement('span');
                        subStatus.className = `me-1 ${iterStep.hasError ? 'text-danger' : 'text-success'}`;
                        subStatus.innerHTML = iterStep.hasError ? '<i class="bi bi-x-circle-fill small"></i>' : '<i class="bi bi-check-circle-fill small"></i>';
                        subStepItem.appendChild(subStatus);

                        // Step link
                        const subLink = document.createElement('a');
                        subLink.href = '#';
                        subLink.className = 'step-link small text-truncate';
                        subLink.textContent = iterStep.displayStepName || iterStep.stepName;
                        subLink.onclick = function(e) {
                            e.preventDefault();
                            showStepOutput(iterStep, executionId);
                        };
                        subStepItem.appendChild(subLink);

                        // View output button
                        if (iterStep.resultsUrl) {
                            const subViewBtn = document.createElement('button');
                            subViewBtn.className = 'btn btn-sm btn-link p-0 ms-1';
                            subViewBtn.innerHTML = '<i class="bi bi-eye small"></i>';
                            subViewBtn.title = 'View Output';
                            subViewBtn.onclick = function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchAndShowStepOutput(iterStep);
                            };
                            subStepItem.appendChild(subViewBtn);
                        }

                        stepsList.appendChild(subStepItem);
                    });

                    iterItem.appendChild(stepsList);
                }

                loopList.appendChild(iterItem);
            });

            stepItem.appendChild(loopList);
        }

        return stepItem;
    }

    // Show step output in a modal or panel
    function showStepOutput(step, executionId) {
        // For now, log the step info - this could open a modal with detailed step output
        console.log('Step output:', step);

        if (step.resultsUrl) {
            fetchAndShowStepOutput(step);
        } else {
            // Show basic step info
            alert(`Step: ${step.displayStepName || step.stepName}\nStatus: ${step.hasError ? 'Error' : 'Success'}\nStarted: ${new Date(step.startedAt).toLocaleString()}\nEnded: ${step.endedAt ? new Date(step.endedAt).toLocaleString() : 'N/A'}`);
        }
    }

    // Fetch and show step output from resultsUrl
    async function fetchAndShowStepOutput(step) {
        if (!step.resultsUrl) {
            console.log('No results URL for step:', step);
            return;
        }

        // Helper function to fetch and parse step output data
        async function fetchStepOutputData(url) {
            const response = await fetch(url);
            if (!response.ok) {
                const error = new Error(`Failed to fetch step output: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            // Get the response as array buffer first to check if it's binary
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            // Check if it looks like gzipped data (starts with 0x1f 0x8b)
            const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;

            // Check if it looks like MessagePack (common binary markers)
            const isMsgPack = bytes[0] >= 0x80 || bytes[0] === 0xdc || bytes[0] === 0xdd;

            let outputData;

            if (isGzip) {
                // Try to decompress gzip using pako if available
                if (typeof pako !== 'undefined') {
                    try {
                        const decompressed = pako.ungzip(bytes, { to: 'string' });
                        outputData = JSON.parse(decompressed);
                    } catch (e) {
                        throw new Error('Gzip decompression failed. The step output may be in an unsupported format.');
                    }
                } else {
                    throw new Error('Step output is compressed. Decompression library not available.');
                }
            } else if (isMsgPack) {
                // Try to decode MessagePack if library is available (@msgpack/msgpack)
                if (typeof MessagePack !== 'undefined') {
                    try {
                        outputData = MessagePack.decode(bytes);
                    } catch (e) {
                        throw new Error('MessagePack decoding failed. The step output may be in an unsupported format.');
                    }
                } else {
                    throw new Error('Step output is in binary format (MessagePack). Decoding library not available.');
                }
            } else {
                // Try to parse as JSON
                const text = new TextDecoder().decode(buffer);
                outputData = JSON.parse(text);
            }

            return outputData;
        }

        try {
            // First attempt: try with the existing URL
            const outputData = await fetchStepOutputData(step.resultsUrl);
            showStepOutputModal(step, outputData);
        } catch (error) {
            console.error('Error fetching step output:', error);

            // If we got a 403 error and have a step ID, try to refresh the URL
            if (error.status === 403 && step.id) {
                console.log('Presigned URL expired, attempting to refresh...');
                try {
                    // Fetch fresh step result with new presigned URL
                    const freshStepResult = await API.fetchSingleStepResult(step.id);
                    if (freshStepResult && freshStepResult.resultsUrl) {
                        console.log('Got fresh URL, retrying fetch...');
                        // Update the step's URL for future use
                        step.resultsUrl = freshStepResult.resultsUrl;
                        // Retry with the new URL
                        const outputData = await fetchStepOutputData(freshStepResult.resultsUrl);
                        showStepOutputModal(step, outputData);
                        return;
                    }
                } catch (refreshError) {
                    console.error('Error refreshing step result URL:', refreshError);
                    showStepOutputErrorModal(step, 'The output URL has expired and could not be refreshed. Please reload the execution.');
                    return;
                }
            }

            // Show a more user-friendly modal for errors
            showStepOutputErrorModal(step, error.message);
        }
    }

    // Show error modal for step output
    function showStepOutputErrorModal(step, errorMessage) {
        const modalHtml = `
            <div class="modal fade" id="stepOutputErrorModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                Step Output Unavailable
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p><strong>Step:</strong> ${step.displayStepName || step.stepName}</p>
                            <p><strong>Status:</strong> ${step.hasError ? '<span class="text-danger">Error</span>' : '<span class="text-success">Success</span>'}</p>
                            <hr>
                            <p class="text-muted mb-0">
                                <i class="bi bi-info-circle me-1"></i>
                                ${errorMessage}
                            </p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existing = document.getElementById('stepOutputErrorModal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('stepOutputErrorModal'));
        modal.show();

        // Clean up after close
        document.getElementById('stepOutputErrorModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // Show step output in a modal
    function showStepOutputModal(step, outputData) {
        // Use the existing JSON modal infrastructure
        const fakeEvent = {
            target: {
                dataset: {
                    json: JSON.stringify(outputData)
                },
                closest: () => ({
                    querySelector: (selector) => {
                        if (selector === 'h5') return { textContent: step.displayStepName || step.stepName };
                        if (selector === '.timestamp') return { textContent: new Date(step.startedAt).toLocaleString() };
                        if (selector === '.badge') return step.loopStepIndex !== undefined ? { textContent: `Loop #${step.loopStepIndex}` } : null;
                        if (selector === '.loop-info') return step.loopPath ? { textContent: `Loop Path: ${step.loopPath}` } : null;
                        return null;
                    }
                })
            }
        };

        UI.showJsonModal(fakeEvent);
    }

    // Format execution time for display in execution chain
    function formatExecutionTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        // For recent executions (within 24 hours), show relative time
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            // For older executions, show date and time
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                   ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
    }

    // Push a history entry for the clicked linked execution so browser back
    // returns to the previous one. fetchResults() then replaces this entry
    // with the same URL (cheap no-op).
    function updateExecutionUrl(executionId) {
        const href = UrlState.buildHref('execution', { executionId });
        const fullUrl = `${location.pathname}${location.search}${href}`;
        window.history.pushState({ executionId }, '', fullUrl);
    }

    // Render linked executions panel - grouped by flow name with compact design
    function renderLinkedExecutions(linkedExecutions, currentExecutionId, currentExecutionMetadata = null) {
        if (!linkedExecutions || linkedExecutions.length === 0) return;

        const sidebar = document.querySelector('#page-execution .sidebar');
        if (!sidebar) return;

        // Remove existing linked executions panel
        const existing = document.getElementById('linked-executions');
        if (existing) {
            existing.remove();
        }

        // Update the current execution's status in the linked executions array with fresh metadata
        // This ensures the current execution shows accurate status even if API returned stale data
        if (currentExecutionMetadata) {
            linkedExecutions = linkedExecutions.map(exec => {
                if (exec.id === currentExecutionId) {
                    return { ...exec, status: currentExecutionMetadata.status };
                }
                return exec;
            });
        }

        // Group executions by flow name
        const flowGroups = new Map();
        let currentExecIndex = -1;

        // Debug: log IDs to help diagnose matching issues
        console.log('Looking for currentExecutionId:', currentExecutionId);
        console.log('Available execution IDs:', linkedExecutions.map(e => e.id));

        linkedExecutions.forEach((exec, index) => {
            const flowName = exec.flow?.name || 'Unknown Flow';
            if (!flowGroups.has(flowName)) {
                flowGroups.set(flowName, []);
            }
            flowGroups.get(flowName).push({ ...exec, globalIndex: index });
            // More robust ID comparison - handle potential format differences
            if (exec.id === currentExecutionId ||
                exec.id?.toString() === currentExecutionId?.toString() ||
                (currentExecutionMetadata && exec.id === currentExecutionMetadata.id)) {
                currentExecIndex = index;
                console.log('Found current execution at index:', index);
            }
        });

        // If current execution not found in linked list, try to find by metadata
        if (currentExecIndex === -1 && currentExecutionMetadata) {
            const matchByStartTime = linkedExecutions.findIndex(e =>
                e.startedAt === currentExecutionMetadata.startedAt
            );
            if (matchByStartTime !== -1) {
                currentExecIndex = matchByStartTime;
                console.log('Found current execution by startedAt at index:', matchByStartTime);
            }
        }

        // Create linked executions panel
        const panel = document.createElement('div');
        panel.id = 'linked-executions';
        panel.className = 'linked-executions mb-3 mt-3';

        // Header with summary
        const totalCount = linkedExecutions.length;
        const successCount = linkedExecutions.filter(e => e.status === 'SUCCEEDED' || e.status === 'SUCCESS').length;
        const failedCount = linkedExecutions.filter(e => e.status === 'FAILED' || e.status === 'FAILURE' || e.status === 'ERROR').length;

        // Position badge - only show position if current execution is in the list
        // If not in list, just show total count (current exec may be the trigger/parent)
        const positionBadge = currentExecIndex >= 0
            ? `${currentExecIndex + 1} / ${totalCount}`
            : `${totalCount}`;

        panel.innerHTML = `
            <h5 class="border-bottom pb-2 mb-2 d-flex align-items-center justify-content-between">
                <span><i class="bi bi-link-45deg me-1"></i>Execution Chain</span>
                <span class="badge bg-secondary">${positionBadge}</span>
            </h5>
            <div class="execution-chain-summary mb-2 d-flex gap-2 small">
                <span class="text-success"><i class="bi bi-check-circle"></i> ${successCount}</span>
                <span class="text-danger"><i class="bi bi-x-circle"></i> ${failedCount}</span>
                ${totalCount - successCount - failedCount > 0 ? `<span class="text-warning"><i class="bi bi-clock"></i> ${totalCount - successCount - failedCount}</span>` : ''}
            </div>
        `;

        // Create flow groups container
        const groupsContainer = document.createElement('div');
        groupsContainer.className = 'linked-executions-groups';

        flowGroups.forEach((executions, flowName) => {
            const flowGroup = document.createElement('div');
            flowGroup.className = 'flow-group mb-2';

            // Flow header (collapsible)
            const flowHeader = document.createElement('div');
            flowHeader.className = 'flow-group-header d-flex align-items-center p-2 rounded cursor-pointer';
            flowHeader.style.backgroundColor = 'rgba(0,0,0,0.03)';

            const toggleIcon = document.createElement('i');
            toggleIcon.className = 'bi bi-caret-right-fill me-2 flow-toggle-icon';
            toggleIcon.style.transition = 'transform 0.2s';

            const flowLabel = document.createElement('span');
            flowLabel.className = 'flow-name flex-grow-1 fw-medium';
            flowLabel.textContent = flowName;

            const flowBadge = document.createElement('span');
            flowBadge.className = 'badge bg-secondary';
            flowBadge.textContent = executions.length;

            flowHeader.appendChild(toggleIcon);
            flowHeader.appendChild(flowLabel);
            flowHeader.appendChild(flowBadge);

            // Executions list (initially collapsed unless contains current execution)
            const execList = document.createElement('div');
            execList.className = 'flow-executions mt-1 ps-3';
            const containsCurrent = executions.some(e => e.id === currentExecutionId);
            execList.style.display = containsCurrent ? 'block' : 'none';
            if (containsCurrent) {
                toggleIcon.style.transform = 'rotate(90deg)';
            }

            // Create execution list with datetime
            const execListInner = document.createElement('div');
            execListInner.className = 'execution-list-items';

            executions.forEach((exec) => {
                const isCurrent = exec.id === currentExecutionId;
                const execItem = document.createElement('div');
                execItem.className = `execution-list-item d-flex align-items-center py-1 px-2 rounded mb-1 ${isCurrent ? 'current-execution' : 'hoverable-execution'}`;

                // Status styling (handle both SUCCEEDED/SUCCESS and FAILED/FAILURE/ERROR)
                const isSuccess = exec.status === 'SUCCEEDED' || exec.status === 'SUCCESS';
                const isFailed = exec.status === 'FAILED' || exec.status === 'FAILURE' || exec.status === 'ERROR';
                const isRunning = exec.status === 'RUNNING' || exec.status === 'IN_PROGRESS';
                const statusIcon = isSuccess ? 'check-circle-fill' :
                                  isFailed ? 'x-circle-fill' :
                                  isRunning ? 'arrow-repeat' : 'clock';
                const statusColor = isSuccess ? 'text-success' :
                                isFailed ? 'text-danger' :
                                isRunning ? 'text-primary' : 'text-warning';

                // Format datetime as relative or short format
                const startTime = new Date(exec.startedAt);
                const timeStr = formatExecutionTime(startTime);

                execItem.innerHTML = `
                    <span class="${statusColor} me-2"><i class="bi bi-${statusIcon}"></i></span>
                    <span class="execution-index badge bg-secondary me-2">#${exec.globalIndex + 1}</span>
                    <span class="execution-time small text-muted flex-grow-1">${timeStr}</span>
                `;
                execItem.title = `${exec.status} - ${startTime.toLocaleString()}`;

                if (!isCurrent) {
                    execItem.style.cursor = 'pointer';
                    execItem.onclick = () => {
                        // Update URL with execution ID before navigating
                        updateExecutionUrl(exec.id);
                        ExecutionPage.setExecutionId(exec.id);
                        ExecutionPage.fetchResults();
                    };
                }

                execListInner.appendChild(execItem);
            });

            execList.appendChild(execListInner);

            // Toggle functionality
            flowHeader.onclick = () => {
                const isHidden = execList.style.display === 'none';
                execList.style.display = isHidden ? 'block' : 'none';
                toggleIcon.style.transform = isHidden ? 'rotate(90deg)' : '';
            };

            flowGroup.appendChild(flowHeader);
            flowGroup.appendChild(execList);
            groupsContainer.appendChild(flowGroup);
        });

        panel.appendChild(groupsContainer);

        // Insert after execution details
        const executionDetails = document.getElementById('execution-details');
        if (executionDetails) {
            executionDetails.insertAdjacentElement('afterend', panel);
        } else {
            const firstChild = sidebar.querySelector('.mb-3');
            if (firstChild) {
                firstChild.insertAdjacentElement('afterend', panel);
            }
        }
    }

    // ==========================================
    // Live Update Helper Functions
    // ==========================================

    // Prepend new log entries at the top of the results div (for live polling)
    // logEdges arrive in DESC order (newest first) - prepend them before existing logs
    function prependNewLogs(logEdges, liveIndexStart) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        const fragment = document.createDocumentFragment();

        logEdges.forEach((edge, i) => {
            const log = edge.node;
            const logDiv = document.createElement('div');
            logDiv.className = 'col-12 mb-3 live-log-new';
            logDiv.id = `log-live-${liveIndexStart + i}`;
            logDiv.dataset.stepName = log.stepName || 'Unnamed Step';

            logDiv.innerHTML = `
                <div class="log-card">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="mb-1">${log.stepName || 'Unnamed Step'}</h5>
                            <div class="timestamp">${new Date(log.timestamp).toLocaleString()}</div>
                        </div>
                        ${log.loopStepName ? `
                            <span class="badge bg-secondary">
                                Loop: ${log.loopStepName} #${log.loopStepIndex}
                            </span>
                        ` : ''}
                    </div>
                    ${log.loopPath ? `
                        <div class="loop-info mt-2">
                            Loop Path: ${log.loopPath}
                        </div>
                    ` : ''}
                    <pre class="mt-2 log-message">${UI.escapeHtml(log.message)}</pre>
                </div>
            `;

            fragment.appendChild(logDiv);
        });

        // Insert before the first child (existing logs)
        // Skip the loading-progress element if present
        const firstLog = resultsDiv.querySelector('[id^="log-"]');
        if (firstLog) {
            resultsDiv.insertBefore(fragment, firstLog);
        } else {
            resultsDiv.appendChild(fragment);
        }

        // Setup JSON viewers for the new live logs
        const newLogMessages = [];
        for (let i = 0; i < logEdges.length; i++) {
            const el = document.getElementById(`log-live-${liveIndexStart + i}`);
            if (el) {
                const container = el.querySelector('.log-message');
                if (container) {
                    UI.setupJsonViewerForContainer(container);
                }
            }
        }
    }

    // Update the execution status badge in the sidebar
    function updateExecutionStatusBadge(status) {
        const badge = document.querySelector('#execution-details .badge');
        if (badge) {
            badge.className = `badge ${getStatusBadgeClass(status)}`;
            badge.textContent = status || 'Unknown';
        }
    }

    Object.assign(window.UI, {
        displayResults,
        initResultsContainer,
        renderLogsIncremental,
        updateStepNavigationFromLogs,
        updateStepNavigationFromStepResults,
        updateStepNavigationCombined,
        renderLinkedExecutions,
        showWelcome,
        getExecutionId,
        prependNewLogs,
        updateExecutionStatusBadge
    });
})();
