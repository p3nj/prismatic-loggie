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
        errorDiv.classList.remove('d-none');
        errorDiv.textContent = `Error: ${message}`;
        document.getElementById('results').innerHTML = '';
    }

    // Show loading indicator
    function showLoading() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '<div class="col-12 text-center">Loading...</div>';
        document.getElementById('error').classList.add('d-none');
    }

    // Display execution results
    function displayResults(result) {
        const resultsDiv = document.getElementById('results');
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

    // Add execution details to the sidebar
    function addExecutionDetailsToSidebar(result) {
        const sidebar = document.querySelector('.sidebar');
        
        // Remove existing execution details if any
        let existingDetails = document.getElementById('execution-details');
        if (existingDetails) {
            existingDetails.remove();
        }
        
        // Create execution details panel
        const detailsPanel = document.createElement('div');
        detailsPanel.id = 'execution-details';
        detailsPanel.className = 'execution-details mb-4';
        
        detailsPanel.innerHTML = `
            <h5 class="border-bottom pb-2 mb-2">Execution Details</h5>
            <div class="mb-2">
                <strong>Instance:</strong>
                <div class="text-truncate">${result.instance?.name || 'Unknown'}</div>
            </div>
            <div class="mb-2">
                <strong>Flow:</strong>
                <div class="text-truncate">${result.flow?.name || 'Unknown'}</div>
            </div>
            <div class="mb-2">
                <strong>Status:</strong>
                <span class="badge ${getStatusBadgeClass(result.status)}">${result.status || 'Unknown'}</span>
            </div>
            <div class="mb-2">
                <strong>Started:</strong>
                <div>${result.startedAt ? new Date(result.startedAt).toLocaleString() : 'Unknown'}</div>
            </div>
        `;
        
        // Insert execution details at the beginning of sidebar, after input fields
        const lastInputGroup = sidebar.querySelector('div.mb-3:last-of-type');
        if (lastInputGroup) {
            lastInputGroup.insertAdjacentElement('afterend', detailsPanel);
        } else {
            sidebar.prepend(detailsPanel);
        }
    }

    // Helper function to get appropriate badge class for status
    function getStatusBadgeClass(status) {
        switch (status) {
            case 'SUCCEEDED':
                return 'bg-success';
            case 'FAILED':
                return 'bg-danger';
            case 'RUNNING':
                return 'bg-primary';
            case 'PENDING':
                return 'bg-warning';
            default:
                return 'bg-secondary';
        }
    }

    // Initialize sticky header behavior
    function initStickyHeader() {
        const header = document.querySelector('.sticky-header');
        const headerContainer = document.querySelector('.sticky-header-container');
        const spacer = document.querySelector('.header-spacer');
        const resultsContainer = document.querySelector('.results-container');
        
        if (!header || !headerContainer || !spacer || !resultsContainer) return;
        
        // Store the original position of the header
        const headerRect = headerContainer.getBoundingClientRect();
        const originalTop = headerRect.top + window.scrollY;
        const headerHeight = headerRect.height;
        
        // Set the spacer height to match the header height
        spacer.style.height = headerHeight + 'px';
        
        // Function to handle scroll events
        function handleScroll() {
            const resultsContainerScroll = resultsContainer.scrollTop;
            
            if (resultsContainerScroll > 10) { // Small threshold to trigger fixed positioning
                // Fixed position when scrolled
                header.classList.add('fixed-header');
                spacer.style.display = 'block';
                
                // Calculate the width dynamically based on the results container
                const containerWidth = resultsContainer.clientWidth;
                header.style.width = containerWidth + 'px';
            } else {
                // Normal position when at the top
                header.classList.remove('fixed-header');
                spacer.style.display = 'none';
                header.style.width = '100%';
            }
        }
        
        // Add scroll event listener to the results container instead of window
        resultsContainer.addEventListener('scroll', handleScroll);
        
        // Add resize event listener to adjust width if window is resized
        window.addEventListener('resize', handleScroll);
        
        // Initial call to set the correct state
        handleScroll();
    }

    // Add a welcome message function
    function showWelcome() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <div class="col-12 text-left p-5">
                <div class="log-card">
                    <h2>Welcome to Prismatic Loggie</h2>
                    <p class="lead">Enter an Execution ID and click "Load" to view execution logs.</p>
                    <hr>
                    <p>This tool helps you analyze and navigate through Prismatic execution logs with features like:</p>
                    <ul>
                        <li>Step-by-step navigation with the TOC sidebar</li>
                        <li>JSON data auto-detection and formatted viewing</li>
                        <li>Loop iterations organized in a tree structure</li>
                        <li>Dark/light theme support</li>
                    </ul>
                    <button class="btn btn-primary" onclick="document.getElementById('loadButton').click()">
                        Load Execution Results
                    </button>
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
            const sidebar = document.querySelector('.sidebar');
            
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

    // Get execution ID from input field and save it
    function getExecutionId() {
        const id = document.getElementById('executionId').value.trim();
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
            
            // Look for potential nested JSON in string properties
            if (typeof jsonObj === 'object') {
                // Check common properties that might contain JSON strings
                const jsonProps = ['message', 'payload', 'response', 'stack', 'data', 'result', 'error', 'headers', 'body', 'content'];
                
                for (const prop of jsonProps) {
                    if (jsonObj[prop] && typeof jsonObj[prop] === 'string') {
                        try {
                            const parsedProp = JSON.parse(jsonObj[prop]);
                            nestedJsonObjects.push({
                                property: prop,
                                json: parsedProp
                            });
                        } catch (e) {
                            // Not a valid JSON string, ignore
                        }
                    }
                }
                
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
            
            nestedJsonObjects.forEach((item, index) => {
                const tabButton = document.createElement('button');
                tabButton.className = `btn btn-sm ${index === 0 ? 'btn-info' : 'btn-outline-info'}`;
                tabButton.textContent = item.property;
                tabButton.dataset.index = index;
                
                tabButton.addEventListener('click', (e) => {
                    // Update active tab styling
                    const tabs = nestedJsonTabs.querySelectorAll('button');
                    tabs.forEach(tab => tab.className = 'btn btn-sm btn-outline-info');
                    e.target.className = 'btn btn-sm btn-info';
                    
                    // Show selected nested JSON
                    const idx = parseInt(e.target.dataset.index);
                    if (nestedEditor) {
                        nestedEditor.dispose();
                    }
                    
                    nestedEditor = monaco.editor.create(nestedContent, {
                        value: JSON.stringify(nestedJsonObjects[idx].json, null, 2),
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
                });
                
                nestedJsonTabs.appendChild(tabButton);
            });
            
            // Initialize the first nested JSON by default
            nestedContent.innerHTML = ''; // Clear the container first
            nestedEditor = monaco.editor.create(nestedContent, {
                value: JSON.stringify(nestedJsonObjects[0].json, null, 2),
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
        
        modal.style.display = 'block';
        
        // Notify Monaco editor of layout change
        setTimeout(() => {
            if (mainEditor) mainEditor.layout();
            if (nestedEditor) nestedEditor.layout();
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

    // Return public methods
    return {
        initTheme,
        showError,
        showLoading,
        displayResults,
        showWelcome,
        getExecutionId,
        detectAndSetupJsonViewers,
        showJsonModal
    };
})();