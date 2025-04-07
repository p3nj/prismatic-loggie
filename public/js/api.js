// API configuration and interaction
const API = (() => {
    let apiEndpoint = 'https://app.prismatic.io/api';
    let apiToken = '';

    // Update API endpoint and token dynamically
    function updateConfig() {
        const endpointSelect = document.getElementById('endpointSelect');
        const tokenInput = document.getElementById('apiToken');
        apiEndpoint = endpointSelect.value + "/api";
        apiToken = tokenInput.value.trim();
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
        fetchExecutionResults
    };
})();