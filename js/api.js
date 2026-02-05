// API configuration and interaction
const API = (() => {
    // Rate limiter to prevent hitting API limits (20 req/s, using 250ms delay for safety)
    const RateLimiter = {
        lastRequest: 0,
        minDelay: 250, // 250ms between requests (4 req/s, very conservative)

        async wait() {
            const now = Date.now();
            const elapsed = now - this.lastRequest;
            if (elapsed < this.minDelay) {
                await new Promise(resolve => setTimeout(resolve, this.minDelay - elapsed));
            }
            this.lastRequest = Date.now();
        }
    };

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

    // GraphQL query for executions by instance with datetime, status, and flow filtering
    const executionsByInstanceQuery = `
        query GetExecutionsByInstance($instanceId: ID!, $first: Int, $after: String, $startedAtGte: DateTime, $startedAtLte: DateTime, $status: ExecutionStatus, $flowId: ID) {
            executionResults(
                instance: $instanceId,
                first: $first,
                after: $after,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                status: $status,
                flowConfig_Flow: $flowId,
                orderBy: {field: STARTED_AT, direction: DESC}
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                nodes {
                    id
                    startedAt
                    endedAt
                    status
                    flow {
                        id
                        name
                    }
                }
            }
        }
    `;

    // GraphQL query for all executions (without instance filter) with datetime, status, and flow filtering
    const executionsQuery = `
        query GetExecutions($first: Int, $after: String, $startedAtGte: DateTime, $startedAtLte: DateTime, $status: ExecutionStatus, $instanceId: ID, $flowId: ID) {
            executionResults(
                instance: $instanceId,
                first: $first,
                after: $after,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                status: $status,
                flowConfig_Flow: $flowId,
                orderBy: {field: STARTED_AT, direction: DESC}
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                    startCursor
                    endCursor
                }
                nodes {
                    id
                    startedAt
                    endedAt
                    status
                    flow {
                        id
                        name
                    }
                    instance {
                        id
                        name
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

    // GraphQL query for step results (step outputs)
    const stepResultsQuery = `
        query getStepOutput($executionId: ID!, $first: Int, $isRootResult: Boolean, $loopPath: String, $after: String, $startedAt: DateTime) {
            stepResults(
                executionResult: $executionId
                isRootResult: $isRootResult
                loopPath: $loopPath
                first: $first
                orderBy: {direction: ASC, field: STARTED_AT}
                after: $after
                startedAt_Gte: $startedAt
            ) {
                nodes {
                    id
                    startedAt
                    endedAt
                    loopStepIndex
                    loopStepName
                    stepName
                    displayStepName
                    isLoopStep
                    isRootResult
                    loopPath
                    hasError
                    resultsUrl
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `;

    // GraphQL query for a single step result by ID (used to refresh presigned URL)
    const singleStepResultQuery = `
        query getStepResultById($id: ID!) {
            stepResult(id: $id) {
                id
                startedAt
                endedAt
                loopStepIndex
                loopStepName
                stepName
                displayStepName
                isLoopStep
                isRootResult
                loopPath
                hasError
                resultsUrl
            }
        }
    `;

    // GraphQL query for linked/chained executions (for long-running flows)
    const linkedExecutionsQuery = `
        query getLinkedExecutionList($invokedBy: ExecutionInvokedByInput) {
            executionResults(
                invokedBy: $invokedBy
                orderBy: {direction: ASC, field: STARTED_AT}
            ) {
                nodes {
                    id
                    startedAt
                    endedAt
                    queuedAt
                    resumedAt
                    error
                    invokeType
                    allowUpdate
                    status
                    flow {
                        name
                    }
                    lineage {
                        hasChildren
                        invokedBy {
                            execution {
                                id
                            }
                        }
                    }
                }
            }
        }
    `;

    // GraphQL query for integrations list (low-code integrations only)
    const integrationsQuery = `
        query GetIntegrations($first: Int, $after: String, $searchTerm: String) {
            integrations(
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
                nodes {
                    id
                    name
                    description
                    versionNumber
                    versionIsLatest
                    versionCreatedAt
                    versionComment
                    category
                    labels
                    customer {
                        id
                        name
                    }
                }
            }
        }
    `;

    // GraphQL query for integration with versions
    const integrationWithVersionsQuery = `
        query GetIntegrationWithVersions($id: ID!) {
            integration(id: $id) {
                id
                name
                description
                definition
                versionNumber
                versionIsLatest
                versionCreatedAt
                versionComment
                versionSequenceId
                category
                labels
                customer {
                    id
                    name
                }
                versions {
                    nodes {
                        id
                        versionNumber
                        comment
                        isAvailable
                    }
                }
            }
        }
    `;

    // GraphQL query for specific version by versionSequenceId and versionNumber
    const integrationVersionDefinitionQuery = `
        query GetIntegrationVersionDefinition($versionSequenceId: UUID!, $versionNumber: Int!) {
            integrations(
                versionSequenceId: $versionSequenceId,
                versionNumber: $versionNumber,
                allVersions: true
            ) {
                nodes {
                    id
                    name
                    versionNumber
                    versionComment
                    versionCreatedAt
                    definition
                }
            }
        }
    `;

    // GraphQL mutation for importing integration
    const importIntegrationMutation = `
        mutation ImportIntegration($integrationId: ID, $definition: String!) {
            importIntegration(input: {
                integrationId: $integrationId,
                definition: $definition
            }) {
                integration {
                    id
                    name
                    versionNumber
                }
                errors {
                    field
                    messages
                }
            }
        }
    `;

    // Generic GraphQL request helper (with rate limiting)
    async function graphqlRequest(query, variables = {}, useRateLimiter = true) {
        const token = getToken();
        if (!token) {
            throw new Error('API token is required. Please authenticate first.');
        }

        // Apply rate limiting if enabled
        if (useRateLimiter) {
            await RateLimiter.wait();
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
        const { first = 20, after = null, startedAtGte = null, startedAtLte = null, status = null, flowId = null } = options;
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
        // Add flow filter if provided
        if (flowId) {
            variables.flowId = flowId;
        }

        const data = await graphqlRequest(executionsByInstanceQuery, variables);
        return data.executionResults;
    }

    // Fetch executions with optional instance filter (for "All Instances" mode)
    async function fetchExecutions(options = {}) {
        const { first = 20, after = null, startedAtGte = null, startedAtLte = null, status = null, instanceId = null, flowId = null } = options;
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
        // Add flow filter if provided
        if (flowId) {
            variables.flowId = flowId;
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

    // Fetch step results for an execution (with pagination support)
    async function fetchStepResults(executionId, options = {}) {
        const { first = 100, after = null, isRootResult = null, loopPath = null, startedAt = null } = options;
        console.log(`Fetching step results for execution: ${executionId}, loopPath: ${loopPath || 'root'}`);

        const variables = {
            executionId,
            first
        };

        if (after) variables.after = after;
        if (isRootResult !== null) variables.isRootResult = isRootResult;
        if (loopPath) variables.loopPath = loopPath;
        if (startedAt) variables.startedAt = startedAt;

        const data = await graphqlRequest(stepResultsQuery, variables);
        return data.stepResults;
    }

    // Fetch a single step result by ID (used to refresh presigned URL)
    async function fetchSingleStepResult(stepId) {
        console.log(`Fetching single step result: ${stepId}`);
        const data = await graphqlRequest(singleStepResultQuery, { id: stepId });
        return data.stepResult;
    }

    // Fetch all step results with pagination (batch load with rate limiting)
    async function* fetchAllStepResults(executionId, options = {}) {
        const { batchSize = 100, isRootResult = null, loopPath = null, startedAt = null } = options;
        let allSteps = [];
        let cursor = null;
        let hasMore = true;

        while (hasMore) {
            const stepsData = await fetchStepResults(executionId, {
                first: batchSize,
                after: cursor,
                isRootResult,
                loopPath,
                startedAt
            });

            if (!stepsData || !stepsData.nodes) {
                break;
            }

            // Append new steps
            allSteps = allSteps.concat(stepsData.nodes);

            // Update pagination state
            hasMore = stepsData.pageInfo?.hasNextPage || false;
            cursor = stepsData.pageInfo?.endCursor || null;

            // Yield progress update
            yield {
                steps: allSteps,
                loadedCount: allSteps.length,
                hasMore: hasMore,
                isComplete: !hasMore
            };
        }

        return allSteps;
    }

    // Fetch linked/chained executions for long-running flows
    async function fetchLinkedExecutions(executionId, startedAt) {
        console.log(`Fetching linked executions for: ${executionId}`);

        const variables = {
            invokedBy: {
                id: executionId,
                startedAt: startedAt
            }
        };

        const data = await graphqlRequest(linkedExecutionsQuery, variables);
        return data.executionResults?.nodes || [];
    }

    // Fetch integrations list with pagination
    async function fetchIntegrations(options = {}) {
        const { first = 20, after = null, searchTerm = null } = options;
        console.log('Fetching integrations list');

        const variables = { first };
        if (after) variables.after = after;
        if (searchTerm) variables.searchTerm = searchTerm;

        const data = await graphqlRequest(integrationsQuery, variables);
        return data.integrations;
    }

    // Fetch integration with all versions
    async function fetchIntegrationWithVersions(integrationId) {
        console.log(`Fetching integration with versions: ${integrationId}`);
        const data = await graphqlRequest(integrationWithVersionsQuery, { id: integrationId });
        return data.integration;
    }

    // Fetch specific version's definition by versionSequenceId and versionNumber
    async function fetchIntegrationVersionDefinition(versionSequenceId, versionNumber) {
        console.log(`Fetching integration version definition: versionSequenceId=${versionSequenceId}, versionNumber=${versionNumber}`);
        const data = await graphqlRequest(integrationVersionDefinitionQuery, {
            versionSequenceId,
            versionNumber
        });

        const nodes = data.integrations?.nodes;
        if (!nodes || nodes.length === 0) return null;

        // Return the first matching integration version
        return nodes[0];
    }

    // Import integration from YAML definition
    async function importIntegration(definition, integrationId = null) {
        console.log(`Importing integration${integrationId ? ` (updating ${integrationId})` : ' (new)'}`);

        const variables = { definition };
        if (integrationId) {
            variables.integrationId = integrationId;
        }

        const data = await graphqlRequest(importIntegrationMutation, variables);

        if (data.importIntegration.errors && data.importIntegration.errors.length > 0) {
            const errorMessages = data.importIntegration.errors
                .map(e => e.messages.join(', '))
                .join('; ');
            throw new Error(`Failed to import integration: ${errorMessages}`);
        }

        return data.importIntegration.integration;
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
        // Core methods
        getEndpoint,
        setEndpoint,
        getToken,
        setToken,
        isAuthenticated,
        validateToken,
        getTokenUrl,
        getApiEndpoint,
        ENDPOINTS,
        // Execution methods
        fetchExecutionResults,
        fetchExecutionLogs,
        fetchAllExecutionLogs,
        fetchStepResults,
        fetchSingleStepResult,
        fetchAllStepResults,
        fetchLinkedExecutions,
        // Instance methods
        fetchInstances,
        fetchInstanceFlows,
        fetchExecutionsByInstance,
        fetchExecutions,
        replayExecution,
        // Integration methods
        fetchIntegrations,
        fetchIntegrationWithVersions,
        fetchIntegrationVersionDefinition,
        importIntegration,
        // Legacy methods for backward compatibility
        loadSavedConfig,
        updateConfig
    };
})();

window.API = API;
