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
                    console.log('Invalid JSON format detected:', e);
                }
            }
        });
    }

    // Show JSON modal
    function showJsonModal(event) {
        const jsonStr = event.target.dataset.json;
        let formattedJson;
        
        try {
            // Format the JSON with indentation
            const jsonObj = JSON.parse(jsonStr);
            formattedJson = JSON.stringify(jsonObj, null, 2);
        } catch (e) {
            formattedJson = jsonStr;
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
        document.getElementById('jsonContent').textContent = formattedJson;
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