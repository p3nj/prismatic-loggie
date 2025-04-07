// UI handling functionality
const UI = (() => {
    // Initialize theme
    function initTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = document.querySelector('.theme-icon');
        
        // Check for saved theme preference or use preferred color scheme
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
            themeIcon.className = 'theme-icon bi bi-sun';
        }
        
        // Add event listener for theme toggle
        themeToggle.addEventListener('change', function() {
            if (this.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeIcon.className = 'theme-icon bi bi-sun';
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeIcon.className = 'theme-icon bi bi-moon';
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

    // Get execution ID from input field
    function getExecutionId() {
        return document.getElementById('executionId').value.trim();
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
        let formattedJson;
        let nestedJson = null;
        
        try {
            // First attempt - parse the direct JSON string
            const jsonObj = JSON.parse(jsonStr);
            formattedJson = JSON.stringify(jsonObj, null, 2);
            
            // Look for potential nested JSON in string properties
            if (typeof jsonObj === 'object') {
                // Check common properties that might contain JSON strings
                const jsonProps = ['message', 'payload', 'response', 'data', 'result', 'error'];
                
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
                                nestedJson = JSON.stringify(extractedJson, null, 2);
                                break; // Found nested JSON, no need to check other properties
                            }
                        } catch (e) {
                            // Not valid JSON in this property, continue checking
                        }
                    }
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
                } else {
                    formattedJson = jsonStr;
                }
            } catch (nestedError) {
                formattedJson = jsonStr;
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
                    <pre id="jsonContent"></pre>
                    <div id="nestedJsonContainer" style="display: none; margin-top: 20px;">
                        <h4>Nested JSON Data</h4>
                        <button id="toggleNestedJson" class="btn btn-sm btn-info mb-2">Show Nested JSON</button>
                        <pre id="nestedJsonContent" style="display: none;"></pre>
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
            
            // Add toggle functionality for nested JSON
            document.getElementById('toggleNestedJson').addEventListener('click', (e) => {
                const nestedContent = document.getElementById('nestedJsonContent');
                if (nestedContent.style.display === 'none') {
                    nestedContent.style.display = 'block';
                    e.target.textContent = 'Hide Nested JSON';
                } else {
                    nestedContent.style.display = 'none';
                    e.target.textContent = 'Show Nested JSON';
                }
            });
        }
        
        // Set content and display modal
        document.getElementById('jsonContent').textContent = formattedJson;
        
        // Handle nested JSON if available
        const nestedContainer = document.getElementById('nestedJsonContainer');
        const nestedContent = document.getElementById('nestedJsonContent');
        
        if (nestedJson) {
            nestedContainer.style.display = 'block';
            nestedContent.textContent = nestedJson;
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
                        nestedJson = JSON.stringify(payloadObj, null, 2);
                        
                        nestedContainer.style.display = 'block';
                        nestedContent.textContent = nestedJson;
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