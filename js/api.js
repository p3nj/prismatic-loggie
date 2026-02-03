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

    // Validate token by making a test API call
    async function validateToken() {
        const token = getToken();
        if (!token) {
            return { valid: false, reason: 'no_token' };
        }

        try {
            const response = await fetch(getApiEndpoint(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    query: `query { authenticatedUser { id email name } }`
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    return { valid: false, reason: 'expired' };
                }
                return { valid: false, reason: 'error', message: `HTTP ${response.status}` };
            }

            const data = await response.json();
            if (data.errors) {
                return { valid: false, reason: 'expired', message: data.errors[0].message };
            }

            return { valid: true, user: data.data.authenticatedUser };
        } catch (error) {
            return { valid: false, reason: 'network', message: error.message };
        }
    }

    // Get token URL for current endpoint
    function getTokenUrl() {
        return `${getEndpoint()}/get_auth_token`;
    }

    // GraphQL query for execution results (metadata only, logs fetched separately)
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
                startedAt
                status
                stepCount
            }
        }
    `;

    // GraphQL query for execution logs with pagination (DESC order to fetch most recent first)
    const executionLogsQuery = `
        query QueryExecutionLogs($id: ID!, $first: Int, $after: String) {
            executionResult(id: $id) {
                id
                logs(first: $first, after: $after, orderBy: {direction: DESC, field: TIMESTAMP}) {
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

    // GraphQL query to get flows for an instance
    const instanceFlowsQuery = `
        query GetInstanceFlows($instanceId: ID!) {
            instance(id: $instanceId) {
                id
                name
                flowConfigs {
                    nodes {
                        id
                        flow {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    // GraphQL query for executions by instance with datetime and status filtering
    const executionsByInstanceQuery = `
        query GetExecutionsByInstance($instanceId: ID!, $first: Int, $after: String, $startedAtGte: DateTime, $startedAtLte: DateTime, $status: ExecutionStatus) {
            executionResults(
                instance: $instanceId,
                first: $first,
                after: $after,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                status: $status,
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

    // GraphQL query for all executions (without instance filter) with datetime and status filtering
    const executionsQuery = `
        query GetExecutions($first: Int, $after: String, $startedAtGte: DateTime, $startedAtLte: DateTime, $status: ExecutionStatus, $instanceId: ID) {
            executionResults(
                instance: $instanceId,
                first: $first,
                after: $after,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                status: $status,
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
                        instance {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    // GraphQL mutation for replaying an execution
    const replayExecutionMutation = `
        mutation ReplayExecution($executionId: ID!) {
            replayExecution(input: {id: $executionId}) {
                instanceExecutionResult {
                    id
                }
                errors {
                    field
                    messages
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

    // Fetch execution results (metadata only) from the API
    async function fetchExecutionResults(executionId) {
        console.log(`Fetching execution results for ID: ${executionId}`);
        const data = await graphqlRequest(executionResultQuery, { id: executionId });
        return data.executionResult;
    }

    // Fetch execution logs with pagination
    async function fetchExecutionLogs(executionId, options = {}) {
        const { first = 100, after = null } = options;
        console.log(`Fetching execution logs for ID: ${executionId}, first: ${first}, after: ${after}`);

        const variables = { id: executionId, first };
        if (after) {
            variables.after = after;
        }

        const data = await graphqlRequest(executionLogsQuery, variables);
        return data.executionResult?.logs || null;
    }

    // Fetch all execution logs continuously in batches
    // Returns an async generator that yields progress updates
    async function* fetchAllExecutionLogs(executionId, batchSize = 100) {
        let allLogs = [];
        let cursor = null;
        let hasMore = true;
        let totalCount = null;

        while (hasMore) {
            const logsData = await fetchExecutionLogs(executionId, {
                first: batchSize,
                after: cursor
            });

            if (!logsData) {
                break;
            }

            // Get total count from first response
            if (totalCount === null) {
                totalCount = logsData.totalCount || 0;
            }

            // Append new logs
            const newLogs = logsData.edges || [];
            allLogs = allLogs.concat(newLogs);

            // Update pagination state
            hasMore = logsData.pageInfo?.hasNextPage || false;
            cursor = logsData.pageInfo?.endCursor || null;

            // Yield progress update
            yield {
                logs: allLogs,
                loadedCount: allLogs.length,
                totalCount: totalCount,
                hasMore: hasMore,
                isComplete: !hasMore
            };
        }

        return allLogs;
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

    // Fetch flows for a specific instance
    async function fetchInstanceFlows(instanceId) {
        console.log(`Fetching flows for instance: ${instanceId}`);
        const data = await graphqlRequest(instanceFlowsQuery, { instanceId });
        return data.instance;
    }

    // Fetch executions for a specific instance
    async function fetchExecutionsByInstance(instanceId, options = {}) {
        const { first = 20, after = null, startedAtGte = null, startedAtLte = null, status = null } = options;
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
        // Add status filter if provided
        if (status) {
            variables.status = status;
        }

        const data = await graphqlRequest(executionsByInstanceQuery, variables);
        return data.executionResults;
    }

    // Fetch executions with optional instance filter (for "All Instances" mode)
    async function fetchExecutions(options = {}) {
        const { first = 20, after = null, startedAtGte = null, startedAtLte = null, status = null, instanceId = null } = options;
        console.log('Fetching executions');

        const variables = { first, after };

        // Add instance filter if provided
        if (instanceId) {
            variables.instanceId = instanceId;
        }
        // Add datetime filters if provided
        if (startedAtGte) {
            variables.startedAtGte = startedAtGte;
        }
        if (startedAtLte) {
            variables.startedAtLte = startedAtLte;
        }
        // Add status filter if provided
        if (status) {
            variables.status = status;
        }

        const data = await graphqlRequest(executionsQuery, variables);
        return data.executionResults;
    }

    // Replay an execution (refire with the same input data)
    async function replayExecution(executionId) {
        console.log(`Replaying execution: ${executionId}`);
        const data = await graphqlRequest(replayExecutionMutation, { executionId });

        if (data.replayExecution.errors && data.replayExecution.errors.length > 0) {
            const errorMessages = data.replayExecution.errors
                .map(e => e.messages.join(', '))
                .join('; ');
            throw new Error(`Failed to replay execution: ${errorMessages}`);
        }

        return data.replayExecution.instanceExecutionResult;
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
        validateToken,
        getTokenUrl,
        getApiEndpoint,
        ENDPOINTS,
        fetchExecutionResults,
        fetchExecutionLogs,
        fetchAllExecutionLogs,
        fetchInstances,
        fetchInstanceFlows,
        fetchExecutionsByInstance,
        fetchExecutions,
        replayExecution,
        // Legacy methods for backward compatibility
        loadSavedConfig,
        updateConfig
    };
})();

window.API = API;
