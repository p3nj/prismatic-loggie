// API configuration and interaction
const API = (() => {
    let apiEndpoint = 'https://app.prismatic.io/api';
    let apiToken = '';

    // Update API endpoint and token dynamically
    function updateConfig() {
        const endpointSelect = document.getElementById('endpointSelect');
        const tokenInput = document.getElementById('apiToken');
        
        // Save selected endpoint to localStorage
        const selectedEndpoint = endpointSelect.value;
        localStorage.setItem('selectedEndpoint', selectedEndpoint);
        
        // Update the endpoint for API calls
        apiEndpoint = selectedEndpoint + "/api";
        
        // Get token from input or keep existing if empty
        const inputToken = tokenInput.value.trim();
        if (inputToken) {
            // Save token to localStorage (associated with this endpoint)
            localStorage.setItem(`apiToken_${selectedEndpoint}`, inputToken);
            apiToken = inputToken;
        } else {
            // If input is empty, use cached token if available
            apiToken = localStorage.getItem(`apiToken_${selectedEndpoint}`) || '';
            
            // Update the input field with cached token if available
            if (apiToken) {
                tokenInput.value = apiToken;
            }
        }
    }

    // Load saved endpoint and token
    function loadSavedConfig() {
        const endpointSelect = document.getElementById('endpointSelect');
        const tokenInput = document.getElementById('apiToken');
        
        // Load saved endpoint if available
        const savedEndpoint = localStorage.getItem('selectedEndpoint');
        if (savedEndpoint) {
            // Find and select the saved endpoint option
            const options = endpointSelect.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === savedEndpoint) {
                    endpointSelect.selectedIndex = i;
                    break;
                }
            }
        }
        
        // Load token associated with selected endpoint
        const currentEndpoint = endpointSelect.value;
        const savedToken = localStorage.getItem(`apiToken_${currentEndpoint}`);
        if (savedToken) {
            tokenInput.value = savedToken;
            apiToken = savedToken;
        }
    }

    // GraphQL query for execution results
    const executionResultQuery = `
        query QueryExecutionResult($id: ID!) {
            executionResult(id: $id) {
                id
                logs(orderBy: {direction: DESC, field: TIMESTAMP}) {
                    edges {
                        node {
                            id
                            stepName
                            message
                            loopStepName
                            loopStepIndex
                            loopPath
                            timestamp
                        }
                    }
                }
            }
        }
    `;

    // Fetch execution results from the API
    async function fetchExecutionResults(executionId) {
        updateConfig();

        if (!apiToken) {
            throw new Error('API token is required.');
        }

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify({
                query: executionResultQuery,
                variables: {
                    id: executionId
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(data.errors[0].message);
        }

        return data.data.executionResult;
    }

    // Return public methods
    return {
        fetchExecutionResults,
        loadSavedConfig,
        updateConfig
    };
})();