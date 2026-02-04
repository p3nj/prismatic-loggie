// UI handling functionality
const UI = (() => {
    // Initialize theme
    function initTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = document.querySelector('.theme-icon');
        const prismLightTheme = document.getElementById('prism-light');
        const prismDarkTheme = document.getElementById('prism-dark');
        
        // Check for saved theme preference or use preferred color scheme
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
            themeIcon.className = 'theme-icon bi bi-sun';
            prismLightTheme.disabled = true;
            prismDarkTheme.disabled = false;
        }
        
        // Add event listener for theme toggle
        themeToggle.addEventListener('change', function() {
            if (this.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeIcon.className = 'theme-icon bi bi-sun';
                prismLightTheme.disabled = true;
                prismDarkTheme.disabled = false;
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeIcon.className = 'theme-icon bi bi-moon';
                prismLightTheme.disabled = false;
                prismDarkTheme.disabled = true;
            }
        });
    }

    // Show error message
    function showError(message) {
        const errorDiv = document.getElementById('error');
        const resultsDiv = document.getElementById('results');
        if (errorDiv) {
            errorDiv.classList.remove('d-none');
            errorDiv.textContent = `Error: ${message}`;
        }
        if (resultsDiv) {
            resultsDiv.innerHTML = '';
        }
    }

    // Show loading indicator
    function showLoading() {
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="col-12 text-center"><div class="spinner-border" role="status"></div><div class="mt-2">Loading execution logs...</div></div>';
        }
        if (errorDiv) {
            errorDiv.classList.add('d-none');
        }
    }

    // Show loading progress with counts
    function showLoadingProgress(loadedCount, totalCount, isComplete = false) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        // Find or create the progress indicator
        let progressDiv = document.getElementById('loading-progress');

        if (!progressDiv) {
            // Create the progress indicator at the top of results
            progressDiv = document.createElement('div');
            progressDiv.id = 'loading-progress';
            progressDiv.className = 'col-12 mb-3';

            // Insert at the beginning of results
            if (resultsDiv.firstChild) {
                resultsDiv.insertBefore(progressDiv, resultsDiv.firstChild);
            } else {
                resultsDiv.appendChild(progressDiv);
            }
        }

        if (isComplete) {
            // Show completion message briefly, then remove
            progressDiv.innerHTML = `
                <div class="alert alert-success d-flex align-items-center" role="alert">
                    <i class="bi bi-check-circle-fill me-2"></i>
                    <span>Loaded all ${loadedCount} logs</span>
                </div>
            `;
            // Remove after 2 seconds
            setTimeout(() => {
                progressDiv.remove();
            }, 2000);
        } else {
            // Calculate percentage
            const percentage = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0;

            progressDiv.innerHTML = `
                <div class="alert alert-info d-flex align-items-center" role="alert">
                    <div class="spinner-border spinner-border-sm me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between mb-1">
                            <span>Loading logs...</span>
                            <span>${loadedCount} / ${totalCount}</span>
                        </div>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated"
                                 role="progressbar"
                                 style="width: ${percentage}%"
                                 aria-valuenow="${percentage}"
                                 aria-valuemin="0"
                                 aria-valuemax="100">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Hide loading progress
    function hideLoadingProgress() {
        const progressDiv = document.getElementById('loading-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }

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
            detectAndSetupJsonViewers(result.logs.edges);
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
                    <pre class="mt-2 log-message">${escapeHtml(log.message)}</pre>
                </div>
            `;

            fragment.appendChild(logDiv);
        });

        // Append at the end (logs are coming in DESC order: newest first, then older)
        resultsDiv.appendChild(fragment);

        // Setup JSON viewers only for the new logs
        detectAndSetupJsonViewersForRange(startIndex, startIndex + logEdges.length);
    }

    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Update step navigation with all current logs
    function updateStepNavigationFromLogs(logEdges) {
        const stepDict = buildStepDictionary(logEdges);
        updateStepNavigation(stepDict);
    }

    // Detect and setup JSON viewers for a specific range of log indices
    function detectAndSetupJsonViewersForRange(startIndex, endIndex) {
        const logContainers = document.querySelectorAll('.log-message');

        // Process only logs in the specified range
        for (let i = startIndex; i < endIndex && i < logContainers.length; i++) {
            const container = logContainers[i];
            setupJsonViewerForContainer(container);
        }
    }

    // Setup JSON viewer for a single container
    function setupJsonViewerForContainer(container) {
        // Skip if already processed
        if (container.dataset.jsonProcessed) return;
        container.dataset.jsonProcessed = 'true';

        const text = container.textContent;

        // First try to parse the entire message as JSON
        try {
            const jsonObj = JSON.parse(text);

            // If we get here, the whole text is valid JSON
            const viewButton = document.createElement('button');
            viewButton.className = 'btn btn-sm btn-primary view-json-btn';
            viewButton.textContent = 'View JSON';
            viewButton.dataset.json = text;

            container.appendChild(document.createElement('br'));
            container.appendChild(viewButton);

            viewButton.addEventListener('click', showJsonModal);
            return;
        } catch (e) {
            // Not a valid complete JSON, continue to check for JSON patterns
        }

        // Look for patterns like "OBZ-Validation: {" or any text followed by JSON
        const jsonMatch = text.match(/([\w\-]+)\s*:\s*(\{[\s\S]*\})/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[2];
                JSON.parse(jsonStr);

                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                viewButton.textContent = 'View JSON';
                viewButton.dataset.json = jsonStr;

                container.appendChild(document.createElement('br'));
                container.appendChild(viewButton);

                viewButton.addEventListener('click', showJsonModal);
            } catch (e) {
                // Not valid JSON, try nested patterns
                tryNestedJsonPatterns(container, text);
            }
        } else {
            // Try to find any JSON-like content in the text
            const possibleJsonPattern = /(\{[\s\S]*\})/;
            const possibleMatch = text.match(possibleJsonPattern);

            if (possibleMatch) {
                try {
                    const jsonCandidate = possibleMatch[1];
                    JSON.parse(jsonCandidate);

                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-secondary view-json-btn';
                    viewButton.textContent = 'View Possible JSON';
                    viewButton.dataset.json = jsonCandidate;

                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);

                    viewButton.addEventListener('click', showJsonModal);
                } catch (e) {
                    tryNestedJsonPatterns(container, text);
                }
            }
        }
    }

    // Helper function for nested JSON patterns
    function tryNestedJsonPatterns(container, text) {
        const escapedJsonPattern = /"(?:message|error|response|result|data)"\s*:\s*"((?:\\.|[^"\\])*\\n\s*\{(?:\\.|[^"\\])*\}(?:\\.|[^"\\])*)/;
        const escapedMatch = text.match(escapedJsonPattern);

        if (escapedMatch) {
            try {
                let escapedJsonStr = escapedMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');

                const jsonObjectPattern = /\{[\s\S]*\}/;
                const jsonObjectMatch = escapedJsonStr.match(jsonObjectPattern);

                if (jsonObjectMatch) {
                    const nestedJsonStr = jsonObjectMatch[0];
                    JSON.parse(nestedJsonStr);

                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-warning view-json-btn';
                    viewButton.textContent = 'View Nested JSON';
                    viewButton.dataset.json = nestedJsonStr;

                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);

                    viewButton.addEventListener('click', showJsonModal);
                }
            } catch (nestedError) {
                // Failed to parse nested JSON
            }
        }
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
        if (stepResults && stepResults.length > 0) {
            stepResults.forEach(step => {
                const key = step.stepName || step.displayStepName;
                if (key) {
                    if (!stepResultsMap.has(key)) {
                        stepResultsMap.set(key, []);
                    }
                    stepResultsMap.get(key).push(step);
                }
            });
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

        // Process each step
        for (const stepName in stepDict) {
            const stepData = stepDict[stepName];
            const stepResults = stepResultsMap.get(stepName) || [];
            const hasError = stepResults.some(s => s.hasError);
            const resultsUrl = stepResults.length > 0 ? stepResults[0].resultsUrl : null;

            const stepItem = document.createElement('li');
            stepItem.className = 'step-item mb-1';

            // Main step link/header
            const stepHeader = document.createElement('div');
            stepHeader.className = 'd-flex align-items-center step-nav-header';

            // Status indicator (from step results if available)
            if (stepResults.length > 0) {
                const statusIcon = document.createElement('span');
                statusIcon.className = `step-status-icon me-1 ${hasError ? 'text-danger' : 'text-success'}`;
                statusIcon.innerHTML = hasError ? '<i class="bi bi-x-circle-fill"></i>' : '<i class="bi bi-check-circle-fill"></i>';
                stepHeader.appendChild(statusIcon);
            }

            // Expand/collapse button for steps with loops
            const hasLoops = Object.keys(stepData.loops).length > 0;
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
            } else if (stepResults.length === 0) {
                // Add spacer for consistent indentation when no status icon
                const spacer = document.createElement('span');
                spacer.style.width = '18px';
                spacer.style.display = 'inline-block';
                stepHeader.appendChild(spacer);
            }

            // Step link (clicking navigates to log entry)
            const stepLink = document.createElement('a');
            stepLink.href = '#';
            stepLink.className = 'step-link text-truncate flex-grow-1';
            stepLink.textContent = stepName;
            stepLink.title = `${stepName} (${stepData.indices.length} log entries) - Click to navigate`;

            // Show count badge
            const countBadge = document.createElement('span');
            countBadge.className = 'badge bg-secondary ms-1';
            countBadge.textContent = stepData.indices.length;
            countBadge.style.fontSize = '0.65rem';

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
            stepHeader.appendChild(countBadge);

            // View output button if resultsUrl exists
            if (resultsUrl && stepResults.length > 0) {
                const viewBtn = document.createElement('button');
                viewBtn.className = 'btn btn-sm btn-outline-info ms-1 p-0 px-1';
                viewBtn.innerHTML = '<i class="bi bi-eye"></i>';
                viewBtn.title = 'View Step Output';
                viewBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    fetchAndShowStepOutput(stepResults[0]);
                };
                stepHeader.appendChild(viewBtn);
            }

            stepItem.appendChild(stepHeader);

            // Add loop items if present
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
                    const loopStepResult = stepResults.find(s =>
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
        }

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

    // Detect and setup JSON viewers
    function detectAndSetupJsonViewers(results) {
        // Find log messages that might contain JSON
        const logContainers = document.querySelectorAll('.log-message');
        
        logContainers.forEach(container => {
            const text = container.textContent;
            
            // First try to parse the entire message as JSON
            try {
                // Check if the whole text is valid JSON
                const jsonObj = JSON.parse(text);
                
                // If we get here, the whole text is valid JSON
                // Create a "View JSON" button
                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                viewButton.textContent = 'View JSON';
                viewButton.dataset.json = text;
                
                // Add button after the log message
                container.appendChild(document.createElement('br'));
                container.appendChild(viewButton);
                
                // Add click event
                viewButton.addEventListener('click', showJsonModal);
                return; // Skip to next container
            } catch (e) {
                // Not a valid complete JSON, continue to check for JSON patterns
            }
            
            // Look for patterns like "OBZ-Validation: {" or any text followed by JSON
            const jsonMatch = text.match(/([\w\-]+)\s*:\s*(\{[\s\S]*\})/);
            
            if (jsonMatch) {
                try {
                    // Try to parse the JSON part
                    const jsonStr = jsonMatch[2];
                    JSON.parse(jsonStr); // Just to validate it's valid JSON
                    
                    // Create a "View JSON" button
                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                    viewButton.textContent = 'View JSON';
                    viewButton.dataset.json = jsonStr;
                    
                    // Add button after the log message
                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);
                    
                    // Add click event
                    viewButton.addEventListener('click', showJsonModal);
                } catch (e) {
                    // Not valid JSON, do nothing
                    console.log('Invalid JSON format detected, trying for nested JSON strings');
                    
                    // Check for escaped JSON strings within the text
                    // This pattern looks for: something like "message": "...\n{...}\n"
                    const escapedJsonPattern = /"(?:message|error|response|result|data)"\s*:\s*"((?:\\.|[^"\\])*\\n\s*\{(?:\\.|[^"\\])*\}(?:\\.|[^"\\])*)/;
                    const escapedMatch = text.match(escapedJsonPattern);
                    
                    if (escapedMatch) {
                        try {
                            // Extract the escaped JSON string and attempt to unescape it
                            let escapedJsonStr = escapedMatch[1];
                            
                            // Replace escape sequences with their actual characters
                            escapedJsonStr = escapedJsonStr
                                .replace(/\\n/g, '\n')
                                .replace(/\\"/g, '"')
                                .replace(/\\\\/g, '\\');
                            
                            // Try to find JSON objects within the unescaped string
                            const jsonObjectPattern = /\{[\s\S]*\}/;
                            const jsonObjectMatch = escapedJsonStr.match(jsonObjectPattern);
                            
                            if (jsonObjectMatch) {
                                const nestedJsonStr = jsonObjectMatch[0];
                                // Validate that it's actual JSON
                                JSON.parse(nestedJsonStr);
                                
                                // Create a "View Nested JSON" button
                                const viewButton = document.createElement('button');
                                viewButton.className = 'btn btn-sm btn-warning view-json-btn';
                                viewButton.textContent = 'View Nested JSON';
                                viewButton.dataset.json = nestedJsonStr;
                                
                                // Add button after the log message
                                container.appendChild(document.createElement('br'));
                                container.appendChild(viewButton);
                                
                                // Add click event
                                viewButton.addEventListener('click', showJsonModal);
                            }
                        } catch (nestedError) {
                            console.log('Failed to parse nested JSON:', nestedError);
                        }
                    }
                }
            } else {
                // Try to find any JSON-like content in the text
                const possibleJsonPattern = /(\{[\s\S]*\})/;
                const possibleMatch = text.match(possibleJsonPattern);
                
                if (possibleMatch) {
                    try {
                        const jsonCandidate = possibleMatch[1];
                        JSON.parse(jsonCandidate); // Just to validate
                        
                        // Create a "View Possible JSON" button
                        const viewButton = document.createElement('button');
                        viewButton.className = 'btn btn-sm btn-secondary view-json-btn';
                        viewButton.textContent = 'View Possible JSON';
                        viewButton.dataset.json = jsonCandidate;
                        
                        // Add button after the log message
                        container.appendChild(document.createElement('br'));
                        container.appendChild(viewButton);
                        
                        // Add click event
                        viewButton.addEventListener('click', showJsonModal);
                    } catch (e) {
                        // Check for escaped JSON within nested strings
                        try {
                            // Look for escaped JSON within the message
                            const escapedNestedPattern = /\\n\s*(\{(?:\\.|[^\\])*\})/;
                            const escapedNestedMatch = text.match(escapedNestedPattern);
                            
                            if (escapedNestedMatch) {
                                let escapedJson = escapedNestedMatch[1]
                                    .replace(/\\n/g, '\n')
                                    .replace(/\\"/g, '"')
                                    .replace(/\\\\/g, '\\');
                                
                                // Validate that it's actual JSON
                                JSON.parse(escapedJson);
                                
                                // Create a "View Nested JSON" button
                                const viewButton = document.createElement('button');
                                viewButton.className = 'btn btn-sm btn-info view-json-btn';
                                viewButton.textContent = 'View Nested JSON';
                                viewButton.dataset.json = escapedJson;
                                
                                // Add button after the log message
                                container.appendChild(document.createElement('br'));
                                container.appendChild(viewButton);
                                
                                // Add click event
                                viewButton.addEventListener('click', showJsonModal);
                            }
                        } catch (nestedError) {
                            console.log('No valid JSON found in message');
                        }
                    }
                }
            }
        });
    }

    // Show JSON modal with improved formatting
    function showJsonModal(event) {
        const jsonStr = event.target.dataset.json;
        let jsonObj;
        let nestedJson = null;
        let nestedJsonObjects = [];
        
        // Get step details from the closest log card
        const logCard = event.target.closest('.log-card');
        const stepName = logCard ? logCard.querySelector('h5').textContent : 'Unknown Step';
        const timestamp = logCard ? logCard.querySelector('.timestamp').textContent : '';
        
        // Check for loop information
        let loopInfo = '';
        const loopBadge = logCard ? logCard.querySelector('.badge') : null;
        if (loopBadge) {
            loopInfo = loopBadge.textContent;
        }
        
        // Look for loop path if it exists
        const loopPathElement = logCard ? logCard.querySelector('.loop-info') : null;
        const loopPath = loopPathElement ? loopPathElement.textContent : '';
        
        try {
            // First attempt - parse the direct JSON string
            jsonObj = JSON.parse(jsonStr);
            
            // Recursively scan for nested JSON in all string properties
            if (typeof jsonObj === 'object' && jsonObj !== null) {
                // Function to recursively scan object for JSON strings
                function scanForNestedJson(obj, path = []) {
                    if (typeof obj !== 'object' || obj === null) return;
                    
                    // Scan all properties
                    Object.keys(obj).forEach(key => {
                        const value = obj[key];
                        const currentPath = [...path, key];
                        
                        // If it's a string, try to parse as JSON
                        if (typeof value === 'string') {
                            try {
                                const parsedValue = JSON.parse(value);
                                if (typeof parsedValue === 'object' && parsedValue !== null) {
                                    // Found valid JSON - add to nested objects
                                    nestedJsonObjects.push({
                                        property: key,
                                        path: currentPath,
                                        pathString: currentPath.join('.'),
                                        json: parsedValue
                                    });
                                    
                                    // Continue scanning the parsed JSON object
                                    scanForNestedJson(parsedValue, [...currentPath, '(parsed)']);
                                }
                            } catch (e) {
                                // Not valid JSON, ignore
                            }
                        } else if (typeof value === 'object' && value !== null) {
                            // If it's an object, scan its properties
                            scanForNestedJson(value, currentPath);
                        }
                    });
                }
                
                // Start recursive scan
                scanForNestedJson(jsonObj);
                
                // If we found any nested JSON objects
                if (nestedJsonObjects.length > 0) {
                    nestedJson = true;
                }
            }
        } catch (e) {
            // Direct parsing failed, try to handle as escaped JSON string
            try {
                // Look for escaped JSON patterns like \n{...}\n
                const escapedPattern = /\\n\s*(\{[\s\S]*\})/;
                const match = jsonStr.match(escapedPattern);
                
                if (match) {
                    // Unescape the JSON string
                    let unescapedJson = match[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                    
                    // Parse and format
                    jsonObj = JSON.parse(unescapedJson);
                } else {
                    // For non-JSON content, just display as text
                    jsonObj = { rawContent: jsonStr };
                }
            } catch (nestedError) {
                jsonObj = { rawContent: jsonStr };
            }
        }
        
        // Track editor instances to properly dispose them
        let mainEditor = null;
        let nestedEditor = null;

        // Store global references to the editors
        window.currentMainEditor = mainEditor;
        window.currentNestedEditor = nestedEditor;

        // Create modal if it doesn't exist
        let modal = document.getElementById('jsonModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'jsonModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content modal-lg">
                    <span class="close-modal">&times;</span>
                    <div class="step-details mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">JSON Data - <span id="modalStepName" class="text-secondary"></span></h5>
                            <span id="modalTimestamp" class="text-muted small"></span>
                        </div>
                        <div id="modalLoopInfo" class="mt-1 badge-container d-inline-block"></div>
                        <div id="modalLoopPath" class="small text-secondary fst-italic d-inline-block ms-2"></div>
                    </div>
                    <div class="resizable-container">
                        <div id="jsonContainer" class="editor-container main-editor"></div>
                        <div id="resizeHandle" class="resize-handle d-none"></div>
                        <div id="nestedJsonWrapper" class="nested-json-wrapper">
                            <div class="nested-json-tabs-container">
                                <div id="nestedJsonTabs" class="nested-json-tabs"></div>
                            </div>
                            <div id="nestedJsonContent" class="editor-container nested-editor"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add close functionality with proper editor cleanup
            modal.querySelector('.close-modal').addEventListener('click', () => {
                if (mainEditor) {
                    mainEditor.dispose();
                    mainEditor = null;
                }
                if (nestedEditor) {
                    nestedEditor.dispose();
                    nestedEditor = null;
                }
                modal.style.display = 'none';
            });
            
            // Close when clicking outside the modal
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    if (mainEditor) {
                        mainEditor.dispose();
                        mainEditor = null;
                    }
                    if (nestedEditor) {
                        nestedEditor.dispose();
                        nestedEditor = null;
                    }
                    modal.style.display = 'none';
                }
            });
            
            // Setup the resize handle functionality
            setupResizeHandle(modal);
        } else {
            // Clear the editors if modal exists
            document.getElementById('jsonContainer').innerHTML = '';
            document.getElementById('nestedJsonContent').innerHTML = '';
        }
        
        // Update step details in the modal
        document.getElementById('modalStepName').textContent = stepName;
        document.getElementById('modalTimestamp').textContent = timestamp;
        
        // Add loop information if available
        const modalLoopInfo = document.getElementById('modalLoopInfo');
        modalLoopInfo.innerHTML = '';
        if (loopInfo) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary';
            badge.textContent = loopInfo;
            modalLoopInfo.appendChild(badge);
        }
        
        // Add loop path if available
        const modalLoopPath = document.getElementById('modalLoopPath');
        modalLoopPath.textContent = loopPath;
        modalLoopPath.style.display = loopPath ? 'block' : 'none';
        
        // Get container references
        const jsonContainer = document.getElementById('jsonContainer');
        const nestedWrapper = document.getElementById('nestedJsonWrapper');
        const nestedContent = document.getElementById('nestedJsonContent');
        const nestedJsonTabs = document.getElementById('nestedJsonTabs');
        const resizeHandle = document.getElementById('resizeHandle');
        
        // Adjust container heights based on whether nested JSON is present
        if (nestedJson && nestedJsonObjects.length > 0) {
            nestedWrapper.style.display = 'flex';
            resizeHandle.classList.remove('d-none');
            
            // Set initial sizing - main takes 60%, nested 40%
            jsonContainer.style.height = '100%';
            nestedWrapper.style.height = '100%';
        } else {
            nestedWrapper.style.display = 'none';
            resizeHandle.classList.add('d-none');
            jsonContainer.style.height = '100%';
        }
        
        // Initialize Monaco Editor for main content
        mainEditor = monaco.editor.create(jsonContainer, {
            value: JSON.stringify(jsonObj, null, 2),
            language: 'json',
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            minimap: { enabled: true },
            folding: true,
            lineNumbers: 'on',
            scrollBeyondLastLine: false
        });

        // Store the reference globally
        window.currentMainEditor = mainEditor;
        
        // Handle nested JSON if available
        if (nestedJson && nestedJsonObjects.length > 0) {
            // Create tabs for each nested JSON property
            nestedJsonTabs.innerHTML = '';
            
            // Group nested items by first level path for better organization
            const groupedNestedJson = {};
            nestedJsonObjects.forEach(item => {
                const topLevel = item.path[0];
                if (!groupedNestedJson[topLevel]) {
                    groupedNestedJson[topLevel] = [];
                }
                groupedNestedJson[topLevel].push(item);
            });
            
            // Create dropdown structure for nested tabs
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'nested-tabs-container d-flex flex-wrap gap-2';
            
            let firstTabButton = null;
            
            // Process each group
            Object.keys(groupedNestedJson).forEach((group, groupIndex) => {
                const groupItems = groupedNestedJson[group];
                
                if (groupItems.length === 1 && groupItems[0].path.length === 1) {
                    // Simple case - just one item at this level
                    const item = groupItems[0];
                    const tabButton = document.createElement('button');
                    tabButton.className = `btn btn-sm ${groupIndex === 0 ? 'btn-info' : 'btn-outline-info'}`;
                    tabButton.textContent = item.property;
                    tabButton.dataset.index = nestedJsonObjects.indexOf(item);
                    tabButton.title = item.pathString;
                    
                    if (groupIndex === 0) firstTabButton = tabButton;
                    
                    tabButton.addEventListener('click', handleNestedJsonTabClick);
                    tabsContainer.appendChild(tabButton);
                } else {
                    // Create dropdown for multiple items
                    const dropdownContainer = document.createElement('div');
                    dropdownContainer.className = 'dropdown d-inline-block';
                    
                    const dropdownButton = document.createElement('button');
                    dropdownButton.className = 'btn btn-sm btn-outline-info dropdown-toggle';
                    dropdownButton.textContent = group;
                    dropdownButton.setAttribute('data-bs-toggle', 'dropdown');
                    dropdownButton.setAttribute('aria-expanded', 'false');
                    
                    const dropdownMenu = document.createElement('div');
                    dropdownMenu.className = 'dropdown-menu py-0';
                    
                    // Add dropdown items
                    groupItems.forEach((item, itemIndex) => {
                        const dropdownItem = document.createElement('button');
                        dropdownItem.className = 'dropdown-item py-2';
                        
                        // Create display path that shows the hierarchy
                        let displayPath = item.path.slice(1).join(' → ');
                        if (displayPath) {
                            dropdownItem.innerHTML = `<small class="text-muted me-1">${displayPath}</small>`;
                        }
                        
                        // Add badge with property name
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-info ms-1';
                        badge.textContent = item.property;
                        dropdownItem.appendChild(badge);
                        
                        dropdownItem.dataset.index = nestedJsonObjects.indexOf(item);
                        dropdownItem.title = item.pathString;
                        
                        dropdownItem.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Update active state on the dropdown button
                            const allButtons = tabsContainer.querySelectorAll('button.btn-info:not(.dropdown-toggle)');
                            allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));
                            
                            // Set dropdown button as active
                            dropdownButton.classList.replace('btn-outline-info', 'btn-info');
                            
                            // Show this nested JSON content
                            const idx = parseInt(this.dataset.index);
                            updateNestedJsonViewer(idx);
                        });
                        
                        // Make the first item in first group the default
                        if (groupIndex === 0 && itemIndex === 0) {
                            firstTabButton = dropdownItem;
                        }
                        
                        dropdownMenu.appendChild(dropdownItem);
                    });
                    
                    dropdownContainer.appendChild(dropdownButton);
                    dropdownContainer.appendChild(dropdownMenu);
                    tabsContainer.appendChild(dropdownContainer);
                    
                    // Create manual dropdown toggle functionality
                    dropdownButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Toggle the dropdown menu visibility
                        const isOpen = dropdownMenu.classList.contains('show');
                        
                        // Close all other dropdowns first
                        const allOpenDropdowns = modal.querySelectorAll('.dropdown-menu.show');
                        allOpenDropdowns.forEach(menu => {
                            menu.classList.remove('show');
                            menu.previousElementSibling.setAttribute('aria-expanded', 'false');
                        });
                        
                        if (!isOpen) {
                            // Position and show the dropdown
                            dropdownMenu.classList.add('show');
                            dropdownButton.setAttribute('aria-expanded', 'true');
                            
                            // Position the dropdown below the button
                            const buttonRect = dropdownButton.getBoundingClientRect();
                            dropdownMenu.style.top = `${buttonRect.bottom}px`;
                            dropdownMenu.style.left = `${buttonRect.left}px`;
                            dropdownMenu.style.minWidth = `${buttonRect.width}px`;
                            
                            // Add click handler to close dropdown when clicking outside
                            setTimeout(() => {
                                document.addEventListener('click', closeDropdown);
                            }, 0);
                        }
                    });
                    
                    function closeDropdown(e) {
                        if (!dropdownMenu.contains(e.target) && e.target !== dropdownButton) {
                            dropdownMenu.classList.remove('show');
                            dropdownButton.setAttribute('aria-expanded', 'false');
                            document.removeEventListener('click', closeDropdown);
                        }
                    }
                }
            });
            
            // Add the tabs container to the DOM
            nestedJsonTabs.appendChild(tabsContainer);

            // First, let's fix the dropdown UI and behavior
            const fixDropdownDisplay = () => {
                // Find all dropdowns in the modal
                const dropdowns = modal.querySelectorAll('.dropdown');
                
                // Add a container for popups that's above everything else
                let popupContainer = document.getElementById('modal-popup-container');
                if (!popupContainer) {
                    popupContainer = document.createElement('div');
                    popupContainer.id = 'modal-popup-container';
                    popupContainer.style.position = 'fixed';
                    popupContainer.style.top = '0';
                    popupContainer.style.left = '0';
                    popupContainer.style.width = '100%';
                    popupContainer.style.height = '100%';
                    popupContainer.style.pointerEvents = 'none'; // Let clicks pass through
                    popupContainer.style.zIndex = '10000'; // Very high z-index, increased for better stacking
                    document.body.appendChild(popupContainer);
                }
                
                // Track open menus to help with proper cleanup
                const openMenus = new Set();
                
                dropdowns.forEach(dropdown => {
                    const button = dropdown.querySelector('.dropdown-toggle');
                    const originalMenu = dropdown.querySelector('.dropdown-menu');
                    
                    if (button && originalMenu) {
                        // Create a copy of the menu that we'll place in the popup container
                        const menu = originalMenu.cloneNode(true);
                        originalMenu.style.display = 'none'; // Hide the original
                        
                        // Generate a unique ID for this menu for tracking
                        const menuId = `dropdown-menu-${Math.random().toString(36).substring(2, 9)}`;
                        menu.dataset.menuId = menuId;
                        
                        // Style the detached menu
                        menu.style.position = 'absolute';
                        menu.style.display = 'none';
                        menu.style.backgroundColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#343a40' : '#fff';
                        menu.style.border = '1px solid rgba(0,0,0,0.15)';
                        menu.style.borderRadius = '0.25rem';
                        menu.style.padding = '0.5rem 0';
                        menu.style.minWidth = '10rem';
                        menu.style.boxShadow = '0 0.5rem 1rem rgba(0,0,0,0.175)';
                        menu.style.pointerEvents = 'auto'; // Enable interaction
                        
                        // Add the detached menu to the popup container
                        popupContainer.appendChild(menu);
                        
                        // Clear any existing listeners to prevent duplicates
                        const newButton = button.cloneNode(true);
                        button.parentNode.replaceChild(newButton, button);
                        
                        // Store relation between button and menu
                        newButton.dataset.controls = menuId;
                        
                        // Add proper toggle behavior
                        newButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Close all other open menus first
                            const allOpenMenus = popupContainer.querySelectorAll('.dropdown-menu[style*="display: block"]');
                            allOpenMenus.forEach(openMenu => {
                                if (openMenu !== menu) {
                                    openMenu.style.display = 'none';
                                    openMenus.delete(openMenu.dataset.menuId);
                                    
                                    // Find and update the button state
                                    const relatedButton = modal.querySelector(`[data-controls="${openMenu.dataset.menuId}"]`);
                                    if (relatedButton) {
                                        relatedButton.setAttribute('aria-expanded', 'false');
                                    }
                                }
                            });
                            
                            // Toggle this dropdown
                            if (menu.style.display === 'none' || menu.style.display === '') {
                                // Get button position relative to viewport
                                const buttonRect = newButton.getBoundingClientRect();
                                const modalRect = modal.querySelector('.modal-content').getBoundingClientRect();
                                
                                // Position menu below the button
                                menu.style.top = `${buttonRect.bottom + 5}px`;
                                menu.style.left = `${buttonRect.left}px`;
                                menu.style.display = 'block';
                                newButton.setAttribute('aria-expanded', 'true');
                                openMenus.add(menuId);
                                
                                // Ensure the menu is visible by checking if it goes off screen
                                setTimeout(() => {
                                    const menuRect = menu.getBoundingClientRect();
                                    const viewportWidth = window.innerWidth;
                                    
                                    // If menu extends beyond right edge of viewport
                                    if (menuRect.right > viewportWidth) {
                                        // Adjust position to be within viewport
                                        const newLeft = Math.max(10, viewportWidth - menuRect.width - 10);
                                        menu.style.left = `${newLeft}px`;
                                    }
                                    
                                    // If menu extends beyond the bottom of viewport
                                    if (menuRect.bottom > window.innerHeight) {
                                        // Position above the button if there's space
                                        if (buttonRect.top > menuRect.height + 10) {
                                            menu.style.top = `${buttonRect.top - menuRect.height - 5}px`;
                                        }
                                    }
                                }, 0);
                            } else {
                                menu.style.display = 'none';
                                newButton.setAttribute('aria-expanded', 'false');
                                openMenus.delete(menuId);
                            }
                        });
                        
                        // Style and add click handlers to menu items
                        const menuItems = menu.querySelectorAll('.dropdown-item');
                        menuItems.forEach((item, index) => {
                            // Apply styles to dropdown items
                            item.style.display = 'block';
                            item.style.width = '100%';
                            item.style.padding = '0.25rem 1rem';
                            item.style.clear = 'both';
                            item.style.textAlign = 'inherit';
                            item.style.whiteSpace = 'nowrap';
                            item.style.backgroundColor = 'transparent';
                            item.style.border = '0';
                            item.style.cursor = 'pointer';
                            
                            // Get the corresponding item from the original menu to get the index
                            const originalItem = originalMenu.querySelectorAll('.dropdown-item')[index];
                            const dataIndex = originalItem ? originalItem.dataset.index : null;
                            
                            if (dataIndex !== null) {
                                item.dataset.index = dataIndex;
                            }
                            
                            // Add hover effect
                            item.addEventListener('mouseover', function() {
                                this.style.backgroundColor = document.documentElement.getAttribute('data-theme') === 'dark' 
                                    ? 'rgba(255,255,255,0.1)' 
                                    : 'rgba(0,0,0,0.05)';
                            });
                            
                            item.addEventListener('mouseout', function() {
                                this.style.backgroundColor = 'transparent';
                            });
                            
                            item.addEventListener('click', function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // Close the dropdown menu
                                menu.style.display = 'none';
                                newButton.setAttribute('aria-expanded', 'false');
                                openMenus.delete(menuId);
                                
                                // Update active state on buttons
                                const allButtons = tabsContainer.querySelectorAll('button.btn-info:not(.dropdown-toggle)');
                                allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));
                                
                                // Set dropdown button as active
                                newButton.classList.replace('btn-outline-info', 'btn-info');
                                
                                // Show selected nested JSON content
                                const idx = parseInt(this.dataset.index);
                                updateNestedJsonViewer(idx);
                            });
                        });
                    }
                });
                
                // Global click handler to close dropdowns when clicking outside
                const outsideClickHandler = function(e) {
                    // Only process if modal is visible
                    if (modal.style.display !== 'block') return;
                    
                    // Get all open menus
                    const dropdownMenus = popupContainer.querySelectorAll('.dropdown-menu[style*="display: block"]');
                    if (!dropdownMenus.length) return;
                    
                    // Find if the click was on a dropdown toggle button
                    let clickedOnToggle = false;
                    const toggleButtons = modal.querySelectorAll('.dropdown-toggle');
                    toggleButtons.forEach(button => {
                        if (button.contains(e.target)) {
                            clickedOnToggle = true;
                        }
                    });
                    
                    // If not clicking on a menu or a toggle button, close all menus
                    if (!clickedOnToggle) {
                        let clickedInsideMenu = false;
                        dropdownMenus.forEach(menu => {
                            if (menu.contains(e.target)) {
                                clickedInsideMenu = true;
                            }
                        });
                        
                        if (!clickedInsideMenu) {
                            dropdownMenus.forEach(menu => {
                                menu.style.display = 'none';
                                
                                // Find and update the button state
                                const toggleButtons = modal.querySelectorAll('.dropdown-toggle[aria-expanded="true"]');
                                toggleButtons.forEach(button => {
                                    button.setAttribute('aria-expanded', 'false');
                                });
                            });
                        }
                    }
                };
                
                // Add the global click handler
                document.addEventListener('mousedown', outsideClickHandler);
                
                // Clean up when modal closes
                modal.querySelector('.close-modal').addEventListener('click', function() {
                    // Remove all menus from popup container
                    while (popupContainer.firstChild) {
                        popupContainer.removeChild(popupContainer.firstChild);
                    }
                    
                    // Remove the global click handler
                    document.removeEventListener('mousedown', outsideClickHandler);
                });
            };

            // Apply the dropdown fixes
            fixDropdownDisplay();

            // Function to handle regular tab button clicks
            function handleNestedJsonTabClick(e) {
                // Update active tab styling
                const allButtons = tabsContainer.querySelectorAll('.btn-info');
                allButtons.forEach(btn => {
                    if (btn.classList.contains('dropdown-toggle') || !btn.classList.contains('dropdown-item')) {
                        btn.classList.replace('btn-info', 'btn-outline-info');
                    }
                });
                
                // Set this button as active
                e.target.classList.replace('btn-outline-info', 'btn-info');
                
                // Show selected nested JSON
                const idx = parseInt(e.target.dataset.index);
                updateNestedJsonViewer(idx);
            }

            // Function to update the nested JSON viewer
            function updateNestedJsonViewer(index) {
                if (nestedEditor) {
                    nestedEditor.dispose();
                }
                
                // Get path info for display
                const item = nestedJsonObjects[index];
                const pathDisplay = document.createElement('div');
                pathDisplay.className = 'path-display small text-muted mb-2 border-bottom pb-1';
                
                // Show breadcrumb-style path
                if (item.path.length > 1) {
                    const pathHTML = item.path.map((segment, i) => {
                        if (i === item.path.length - 1) {
                            return `<strong>${segment}</strong>`;
                        }
                        return `<span>${segment}</span>`;
                    }).join(' → ');
                    pathDisplay.innerHTML = `<i class="bi bi-diagram-3 me-1"></i> ${pathHTML}`;
                } else {
                    pathDisplay.innerHTML = `<i class="bi bi-braces me-1"></i> ${item.property}`;
                }
                
                // Create wrapper to hold path display and editor
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'd-flex flex-column h-100';
                contentWrapper.appendChild(pathDisplay);
                
                const editorContainer = document.createElement('div');
                editorContainer.className = 'flex-grow-1';
                contentWrapper.appendChild(editorContainer);
                
                // Clear and add the new content
                nestedContent.innerHTML = '';
                nestedContent.appendChild(contentWrapper);
                
                // Create editor in the container
                nestedEditor = monaco.editor.create(editorContainer, {
                    value: JSON.stringify(item.json, null, 2),
                    language: 'json',
                    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
                    automaticLayout: true,
                    minimap: { enabled: true },
                    folding: true,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false
                });
                
                // Store the reference globally
                window.currentNestedEditor = nestedEditor;
            }

            // Initialize with the first tab
            if (firstTabButton) {
                // If it's a dropdown item, we need to handle it specially
                if (firstTabButton.classList.contains('dropdown-item')) {
                    // Get the index and trigger the nested viewer directly
                    const idx = parseInt(firstTabButton.dataset.index);
                    updateNestedJsonViewer(idx);
                    
                    // Set the parent dropdown button as active
                    const parentDropdown = firstTabButton.closest('.dropdown');
                    if (parentDropdown) {
                        const dropdownToggle = parentDropdown.querySelector('.dropdown-toggle');
                        if (dropdownToggle) {
                            // Make this dropdown button active
                            const allButtons = tabsContainer.querySelectorAll('button.btn-info');
                            allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));
                            dropdownToggle.classList.replace('btn-outline-info', 'btn-info');
                        }
                    }
                } else {
                    // Regular button, just click it
                    firstTabButton.click();
                }
            }
        }
        
        modal.style.display = 'block';
        
        // Notify Monaco editor of layout change
        setTimeout(() => {
            if (mainEditor) mainEditor.layout();
            if (nestedEditor) mainEditor.layout();
        }, 100);
    }

    function setupResizeHandle(modal) {
        const resizeHandle = modal.querySelector('#resizeHandle');
        const mainEditorContainer = modal.querySelector('#jsonContainer');
        const nestedWrapper = modal.querySelector('#nestedJsonWrapper');
        const container = modal.querySelector('.resizable-container');
        
        let isDragging = false;
        let startY, startHeightMain, startHeightNested;
        let rafId = null;
        let containerHeight;
        
        // Add resize handle event listeners
        resizeHandle.addEventListener('mousedown', startResize);
        
        function startResize(e) {
            isDragging = true;
            
            // Get current editor references (these are set in showJsonModal)
            const mainEditor = window.currentMainEditor;
            const nestedEditor = window.currentNestedEditor;
            
            // Cache initial measurements
            containerHeight = container.getBoundingClientRect().height;
            startY = e.clientY;
            startHeightMain = mainEditorContainer.offsetHeight;
            startHeightNested = nestedWrapper.offsetHeight;
            
            // Add visual feedback
            document.body.style.cursor = 'ns-resize';
            document.body.classList.add('resizing');
            
            // Add event listeners for dragging
            document.addEventListener('mousemove', onMouseMove, { passive: false });
            document.addEventListener('mouseup', stopResize);
            
            e.preventDefault();
        }
        
        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            // Use requestAnimationFrame for better performance
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    // Calculate delta and new heights
                    const deltaY = e.clientY - startY;
                    let newMainHeight = startHeightMain + deltaY;
                    let newNestedHeight = startHeightNested - deltaY;
                    
                    // Calculate minimum height (10% of container)
                    const minHeight = Math.max(60, containerHeight * 0.1);
                    
                    // Apply minimum height constraints
                    if (newMainHeight < minHeight) {
                        newMainHeight = minHeight;
                        newNestedHeight = containerHeight - minHeight - 6;
                    }
                    if (newNestedHeight < minHeight) {
                        newNestedHeight = minHeight;
                        newMainHeight = containerHeight - minHeight - 6;
                    }
                    
                    // Apply new heights directly (using pixels for better performance)
                    mainEditorContainer.style.height = `${newMainHeight}px`;
                    nestedWrapper.style.height = `${newNestedHeight}px`;
                    
                    // Update editor layouts
                    if (window.currentMainEditor) window.currentMainEditor.layout();
                    if (window.currentNestedEditor) window.currentNestedEditor.layout();
                    
                    rafId = null;
                });
            }
        }
        
        function stopResize() {
            if (!isDragging) return;
            
            // Reset state
            isDragging = false;
            document.body.style.cursor = '';
            document.body.classList.remove('resizing');
            
            // Remove event listeners with proper arguments
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', stopResize);
            
            // Final layout update
            if (window.currentMainEditor) window.currentMainEditor.layout();
            if (window.currentNestedEditor) window.currentNestedEditor.layout();
            
            // Cancel any pending animation frame
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }
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

        try {
            // Fetch the step output from the resultsUrl
            const response = await fetch(step.resultsUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch step output: ${response.status}`);
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

            // Show in JSON modal
            showStepOutputModal(step, outputData);
        } catch (error) {
            console.error('Error fetching step output:', error);
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

        showJsonModal(fakeEvent);
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

    // Update URL with execution ID for navigation tracking
    function updateExecutionUrl(executionId) {
        const currentHash = window.location.hash;
        const baseHash = currentHash.split('?')[0] || '#execution';
        const newUrl = `${baseHash}?executionId=${executionId}`;
        window.history.pushState({ executionId }, '', newUrl);
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

        // If current execution not found in linked list, it might be the first one
        // or there's an ID mismatch - try to find by metadata
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

        panel.innerHTML = `
            <h5 class="border-bottom pb-2 mb-2 d-flex align-items-center justify-content-between">
                <span><i class="bi bi-link-45deg me-1"></i>Execution Chain</span>
                <span class="badge bg-secondary">${currentExecIndex + 1} / ${totalCount}</span>
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

    // Return public methods
    return {
        initTheme,
        showError,
        showLoading,
        showLoadingProgress,
        hideLoadingProgress,
        displayResults,
        initResultsContainer,
        renderLogsIncremental,
        updateStepNavigationFromLogs,
        updateStepNavigationFromStepResults,
        updateStepNavigationCombined,
        renderLinkedExecutions,
        showWelcome,
        getExecutionId,
        detectAndSetupJsonViewers,
        showJsonModal
    };
})();