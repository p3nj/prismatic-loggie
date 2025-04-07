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

        const logsHtml = result.logs.edges.map(edge => {
            const log = edge.node;
            return `
                <div class="col-12 mb-3">
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
                    <h3>JSON Data</h3>
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
        getExecutionId,
        detectAndSetupJsonViewers,
        showJsonModal
    };
})();