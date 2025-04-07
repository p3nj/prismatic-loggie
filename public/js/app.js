// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    UI.initTheme();
    
    // Load saved endpoint and token configuration
    API.loadSavedConfig();
    
    // Initialize event listeners
    document.getElementById('loadButton').addEventListener('click', fetchResults);

    // Handle Enter key on input field
    document.getElementById('executionId').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchResults();
        }
    });

    // Handle endpoint change to load corresponding cached token
    document.getElementById('endpointSelect').addEventListener('change', () => {
        API.updateConfig();
    });

    document.getElementById('getTokenButton').addEventListener('click', () => {
        const endpointSelect = document.getElementById('endpointSelect');
        const apiEndpoint = endpointSelect.value;
        window.open(`${apiEndpoint}/get_auth_token`, '_blank');
    });
    
    // Main fetch function
    async function fetchResults() {
        const executionId = UI.getExecutionId();
        
        if (!executionId) {
            UI.showError('Please enter an Execution ID');
            return;
        }

        UI.showLoading();

        try {
            const result = await API.fetchExecutionResults(executionId);
            UI.displayResults(result);
        } catch (error) {
            UI.showError(error.message);
        }
    }

    // Cache the execution ID if provided
    const executionId = UI.getExecutionId();
    if (executionId) {
        localStorage.setItem('lastExecutionId', executionId);
    } else {
        // Load the last used execution ID if available
        const lastExecutionId = localStorage.getItem('lastExecutionId');
        if (lastExecutionId) {
            document.getElementById('executionId').value = lastExecutionId;
        }
    }

    // Add a "click to load" message in the results area
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="col-12 text-center p-5">
            <div class="log-card">
                <h4>Welcome to Prismatic Loggie</h4>
                <p>Enter an Execution ID and click "Load" to view logs</p>
                <button class="btn btn-primary" onclick="document.getElementById('loadButton').click()">
                    Load Execution Results
                </button>
            </div>
        </div>
    `;
});