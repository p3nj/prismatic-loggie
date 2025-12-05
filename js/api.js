// API configuration and interaction
const API = (() => {
    // Available endpoints
    const ENDPOINTS = [
        { value: 'https://app.prismatic.io', label: 'US (app.prismatic.io)' },
        { value: 'https://app.ap-southeast-2.prismatic.io', label: 'AP Southeast 2 (Sydney)' },
        { value: 'https://app.ca-central-1.prismatic.io', label: 'CA Central 1 (Canada)' },
        { value: 'https://app.eu-west-1.prismatic.io', label: 'EU West 1 (Ireland)' },
        { value: 'https://app.eu-west-2.prismatic.io', label: 'EU West 2 (London)' },
        { value: 'https://app.us-gov-west-1.prismatic.io', label: 'US Gov West 1' }
    ];

    // Get current endpoint from localStorage
    function getEndpoint() {
        return localStorage.getItem('selectedEndpoint') || 'https://app.prismatic.io';
    }

    // Set endpoint in localStorage
    function setEndpoint(endpoint) {
        localStorage.setItem('selectedEndpoint', endpoint);
    }

    // Get API endpoint URL (with /api suffix)
    function getApiEndpoint() {
        return getEndpoint() + '/api';
    }

    // Get token for current endpoint
    function getToken() {
        const endpoint = getEndpoint();
        return localStorage.getItem(`apiToken_${endpoint}`) || '';
    }

    // Set token for current endpoint
    function setToken(token) {
        const endpoint = getEndpoint();
        localStorage.setItem(`apiToken_${endpoint}`, token);
    }

    // Check if authenticated (has token for current endpoint)
    function isAuthenticated() {
        return !!getToken();
    }

    // Get token URL for current endpoint
    function getTokenUrl() {
        return `${getEndpoint()}/get_auth_token`;
    }

    // GraphQL query for execution results
    const executionResultQuery = `
        query QueryExecutionResult($id: ID!) {
            executionResult(id: $id) {
                id
                startedAt
                instance {
                    id
                    name
                }
                flow {
                    name
                }
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
                            instanceName
                            flowName
                        }
                    }
                }
                startedAt
                status
                stepCount
            }
        }
    `;

    // GraphQL query for instances list
    const instancesQuery = `
        query GetInstances($first: Int, $after: String, $searchTerm: String) {
            instances(
                first: $first,
                after: $after,
                name_Icontains: $searchTerm,
                sortBy: [{field: NAME, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                edges {
                    node {
                        id
                        name
                        description
                        enabled
                        customer {
                            id
                            name
                        }
                        integration {
                            id
                            name
                        }
                        lastExecutedAt
                    }
                }
            }
        }
    `;

    // GraphQL query for executions by instance with datetime filtering
    const executionsByInstanceQuery = `
        query GetExecutionsByInstance($instanceId: ID!, $first: Int, $after: String, $startedAtGte: DateTime, $startedAtLte: DateTime) {
            executionResults(
                instance: $instanceId,
                first: $first,
                after: $after,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                orderBy: {field: STARTED_AT, direction: DESC}
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                edges {
                    node {
                        id
                        startedAt
                        endedAt
                        status
                        flow {
                            name
                        }
                    }
                }
            }
        }
    `;

    // Generic GraphQL request helper
    async function graphqlRequest(query, variables = {}) {
        const token = getToken();
        if (!token) {
            throw new Error('API token is required. Please authenticate first.');
        }

        const response = await fetch(getApiEndpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Authentication failed. Please check your API token.');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(data.errors[0].message);
        }

        return data.data;
    }

    // Fetch execution results from the API
    async function fetchExecutionResults(executionId) {
        console.log(`Fetching execution results for ID: ${executionId}`);
        const data = await graphqlRequest(executionResultQuery, { id: executionId });
        return data.executionResult;
    }

    // Fetch instances list with pagination
    async function fetchInstances(options = {}) {
        const { first = 20, after = null, searchTerm = null } = options;
        console.log('Fetching instances list');

        const variables = { first };
        if (after) variables.after = after;
        if (searchTerm) variables.searchTerm = searchTerm;

        const data = await graphqlRequest(instancesQuery, variables);
        return data.instances;
    }

    // Fetch executions for a specific instance
    async function fetchExecutionsByInstance(instanceId, options = {}) {
        const { first = 20, after = null, startedAtGte = null, startedAtLte = null } = options;
        console.log(`Fetching executions for instance: ${instanceId}`);

        const variables = {
            instanceId,
            first,
            after
        };

        // Add datetime filters if provided
        if (startedAtGte) {
            variables.startedAtGte = startedAtGte;
        }
        if (startedAtLte) {
            variables.startedAtLte = startedAtLte;
        }

        const data = await graphqlRequest(executionsByInstanceQuery, variables);
        return data.executionResults;
    }

    // Legacy support - update config from DOM elements (for backward compatibility)
    function updateConfig() {
        const endpointSelect = document.getElementById('endpointSelect');
        const tokenInput = document.getElementById('apiToken');

        if (endpointSelect) {
            setEndpoint(endpointSelect.value);
        }

        if (tokenInput) {
            const inputToken = tokenInput.value.trim();
            if (inputToken) {
                setToken(inputToken);
            }
        }
    }

    // Legacy support - load saved config to DOM elements
    function loadSavedConfig() {
        const endpointSelect = document.getElementById('endpointSelect');
        const tokenInput = document.getElementById('apiToken');

        if (endpointSelect) {
            const savedEndpoint = getEndpoint();
            const options = endpointSelect.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === savedEndpoint) {
                    endpointSelect.selectedIndex = i;
                    break;
                }
            }
        }

        if (tokenInput) {
            const savedToken = getToken();
            if (savedToken) {
                tokenInput.value = savedToken;
            }
        }
    }

    // Return public methods
    return {
        // New methods
        getEndpoint,
        setEndpoint,
        getToken,
        setToken,
        isAuthenticated,
        getTokenUrl,
        getApiEndpoint,
        ENDPOINTS,
        fetchExecutionResults,
        fetchInstances,
        fetchExecutionsByInstance,
        // Legacy methods for backward compatibility
        loadSavedConfig,
        updateConfig
    };
})();

window.API = API;
