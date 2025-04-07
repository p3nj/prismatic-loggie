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
            <div class="col-12">
                <div class="p-4 mb-4 bg-light rounded-3">
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

    // Helper function to highlight JSON using Prism.js
    function highlightJSON(jsonString) {
        // Format the JSON with proper indentation
        const formattedJson = JSON.stringify(JSON.parse(jsonString), null, 2);
        
        // Create a pre element to properly maintain whitespace
        const preElement = document.createElement('pre');
        preElement.className = 'language-json';
        preElement.style.margin = '0'; // Remove default margins
        
        // Create a code element for Prism highlighting
        const codeElement = document.createElement('code');
        codeElement.className = 'language-json';
        codeElement.textContent = formattedJson;
        
        // Add the code element to the pre element
        preElement.appendChild(codeElement);
        
        // Highlight the code
        if (window.Prism) {
            Prism.highlightElement(codeElement);
        }
        
        return preElement;
    }

    // Show JSON modal with improved formatting
    function showJsonModal(event) {
        const jsonStr = event.target.dataset.json;
        let formattedJson;
        let nestedJson = null;
        let mainJsonElement;
        let nestedJsonElement;
        
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
            const jsonObj = JSON.parse(jsonStr);
            formattedJson = JSON.stringify(jsonObj, null, 2);
            mainJsonElement = highlightJSON(jsonStr);
            
            // Look for potential nested JSON in string properties
            if (typeof jsonObj === 'object') {
                // Check common properties that might contain JSON strings
                const jsonProps = ['message', 'payload', 'response', 'data', 'result', 'error', 'headers', 'body', 'content'];
                let nestedJsonObjects = []; // Store all found nested JSON objects
                
                for (const prop of jsonProps) {
                    if (jsonObj[prop] && typeof jsonObj[prop] === 'string') {
                        try {
                            // Try to extract and parse JSON from this property
                            const propContent = jsonObj[prop];
                            
                            // Look for patterns like JSON within the string
                            const jsonPattern = /\{[\s\S]*\}/;
                            const match = propContent.match(jsonPattern);
                            
                            if (match) {
                                // Try to parse as JSON
                                const extractedJson = JSON.parse(match[0]);
                                nestedJsonObjects.push({
                                    property: prop,
                                    json: match[0],
                                    formattedJson: JSON.stringify(extractedJson, null, 2),
                                    element: highlightJSON(match[0])
                                });
                            }
                        } catch (e) {
                            // Not valid JSON in this property, continue checking
                        }
                    }
                }
                
                // If we found any nested JSON objects, store them for later use
                if (nestedJsonObjects.length > 0) {
                    nestedJson = true;
                    nestedJsonElement = nestedJsonObjects;
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
                    const jsonObj = JSON.parse(unescapedJson);
                    formattedJson = JSON.stringify(jsonObj, null, 2);
                    mainJsonElement = highlightJSON(unescapedJson);
                } else {
                    formattedJson = jsonStr;
                    // For non-JSON content, just use a simple pre
                    const preElement = document.createElement('pre');
                    preElement.textContent = jsonStr;
                    mainJsonElement = preElement;
                }
            } catch (nestedError) {
                formattedJson = jsonStr;
                // For non-JSON content, just use a simple pre
                const preElement = document.createElement('pre');
                preElement.textContent = jsonStr;
                mainJsonElement = preElement;
            }
        }
        
        // Create modal if it doesn't exist
        let modal = document.getElementById('jsonModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'jsonModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-modal">&times;</span>
                    <div class="step-details mb-3">
                        <h3>JSON Data</h3>
                        <div class="step-info border-top border-bottom py-2 my-2">
                            <div id="modalStepName" class="fw-bold"></div>
                            <div id="modalTimestamp" class="text-muted small"></div>
                            <div id="modalLoopInfo" class="mt-1 badge-container"></div>
                            <div id="modalLoopPath" class="small text-secondary fst-italic"></div>
                        </div>
                    </div>
                    <div id="jsonContent" class="code-container"></div>
                    <div id="nestedJsonContainer" style="display: none; margin-top: 20px;">
                        <h4>Nested JSON Data</h4>
                        <div id="nestedJsonTabs" class="mb-2"></div>
                        <div id="nestedJsonContent" class="code-container"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add close functionality
            modal.querySelector('.close-modal').addEventListener('click', () => {
                modal.style.display = 'none';
            });
            
            // Close when clicking outside the modal
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
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
        
        // Set content and display modal
        const jsonContentDiv = document.getElementById('jsonContent');
        jsonContentDiv.innerHTML = '';
        jsonContentDiv.appendChild(mainJsonElement);
        
        // Handle nested JSON if available
        const nestedContainer = document.getElementById('nestedJsonContainer');
        const nestedContent = document.getElementById('nestedJsonContent');
        const nestedJsonTabs = document.getElementById('nestedJsonTabs');
        
        if (nestedJson && Array.isArray(nestedJsonElement) && nestedJsonElement.length > 0) {
            nestedContainer.style.display = 'block';
            
            // Create tabs for each nested JSON property
            nestedJsonTabs.innerHTML = '';
            nestedJsonElement.forEach((item, index) => {
                const tabButton = document.createElement('button');
                tabButton.className = `btn btn-sm ${index === 0 ? 'btn-info' : 'btn-outline-info'}`;
                tabButton.textContent = item.property;
                tabButton.style.marginRight = '5px';
                tabButton.dataset.index = index;
                tabButton.addEventListener('click', switchNestedJsonTab);
                nestedJsonTabs.appendChild(tabButton);
            });
            
            // Show the first nested JSON by default
            nestedContent.innerHTML = '';
            nestedContent.appendChild(nestedJsonElement[0].element);
        } else if (nestedJson && nestedJsonElement) {
            // Handle legacy single nested JSON case
            nestedContainer.style.display = 'block';
            nestedJsonTabs.innerHTML = '';
            nestedContent.innerHTML = '';
            nestedContent.appendChild(nestedJsonElement);
        } else {
            // Check for potential nested JSON in the formatted string
            try {
                // Try to extract payload or other common nested JSON fields
                const payloadMatch = formattedJson.match(/"payload":\s*"({[\s\S]*?})"/);
                if (payloadMatch) {
                    let extractedPayload = payloadMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                    
                    try {
                        const payloadObj = JSON.parse(extractedPayload);
                        
                        nestedContainer.style.display = 'block';
                        nestedJsonTabs.innerHTML = '';
                        
                        const tabButton = document.createElement('button');
                        tabButton.className = 'btn btn-sm btn-info';
                        tabButton.textContent = 'payload';
                        nestedJsonTabs.appendChild(tabButton);
                        
                        const nestedElement = highlightJSON(extractedPayload);
                        nestedContent.innerHTML = '';
                        nestedContent.appendChild(nestedElement);
                    } catch (e) {
                        nestedContainer.style.display = 'none';
                    }
                } else {
                    nestedContainer.style.display = 'none';
                }
            } catch (e) {
                nestedContainer.style.display = 'none';
            }
        }
        
        modal.style.display = 'block';
        
        // Add function to handle tab switching
        function switchNestedJsonTab(event) {
            // Update active tab styling
            const tabs = nestedJsonTabs.querySelectorAll('button');
            tabs.forEach(tab => tab.className = 'btn btn-sm btn-outline-info');
            event.target.className = 'btn btn-sm btn-info';
            
            // Show selected nested JSON
            const index = parseInt(event.target.dataset.index);
            nestedContent.innerHTML = '';
            nestedContent.appendChild(nestedJsonElement[index].element);
            
            // Make sure Prism re-highlights the new content
            if (window.Prism) {
                Prism.highlightElement(nestedContent.querySelector('code'));
            }
        }
        
        // Make sure Prism re-highlights any new elements
        if (window.Prism) {
            Prism.highlightAll();
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