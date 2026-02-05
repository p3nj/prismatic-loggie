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
                    lineage {
                        hasChildren
                        invokedBy {
                            execution {
                                id
                                startedAt
                            }
                        }
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
    // Filters by flowConfig_Flow to only get same-flow recursive calls, not cross-flow calls
    const linkedExecutionsQuery = `
        query getLinkedExecutionList($invokedBy: ExecutionInvokedByInput, $flowId: ID) {
            executionResults(
                invokedBy: $invokedBy
                flowConfig_Flow: $flowId
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
                        id
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
                createdAt
                hasUnpublishedChanges
                category
                labels
                versionCreatedBy {
                    id
                    name
                    email
                }
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
                        publishedAt
                        publishedBy {
                            id
                            name
                            email
                        }
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

    // GraphQL mutation for publishing integration
    const publishIntegrationMutation = `
        mutation PublishIntegration($id: ID!, $comment: String) {
            publishIntegration(input: {
                id: $id,
                comment: $comment
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

    // ============================================
    // Analysis Page Queries
    // ============================================

    // GraphQL query for organization daily usage metrics
    const orgDailyUsageMetricsQuery = `
        query GetOrgDailyUsageMetrics($first: Int, $after: String, $snapshotDateGte: Date, $snapshotDateLte: Date) {
            orgDailyUsageMetrics(
                first: $first,
                after: $after,
                snapshotDate_Gte: $snapshotDateGte,
                snapshotDate_Lte: $snapshotDateLte,
                sortBy: [{field: SNAPSHOT_DATE, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    snapshotDate
                    successfulExecutionCount
                    failedExecutionCount
                    stepCount
                    spendMbSecs
                }
            }
        }
    `;

    // GraphQL query for customers list
    const customersQuery = `
        query GetCustomers($first: Int, $after: String, $searchTerm: String) {
            customers(
                first: $first,
                after: $after,
                name_Icontains: $searchTerm,
                sortBy: [{field: NAME, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    name
                    externalId
                }
            }
        }
    `;

    // GraphQL query for instances by customer
    const instancesByCustomerQuery = `
        query GetInstancesByCustomer($customerId: ID!, $first: Int, $after: String) {
            instances(
                customer: $customerId,
                first: $first,
                after: $after,
                sortBy: [{field: NAME, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    name
                    enabled
                    lastExecutedAt
                    integration {
                        id
                        name
                    }
                }
            }
        }
    `;

    // GraphQL query for instance daily usage metrics (with instance filter)
    const instanceDailyUsageMetricsQuery = `
        query GetInstanceDailyUsageMetrics($first: Int, $after: String, $instanceId: ID, $snapshotDateGte: Date, $snapshotDateLte: Date) {
            instanceDailyUsageMetrics(
                first: $first,
                after: $after,
                instance: $instanceId,
                snapshotDate_Gte: $snapshotDateGte,
                snapshotDate_Lte: $snapshotDateLte,
                sortBy: [{field: SNAPSHOT_DATE, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    snapshotDate
                    successfulExecutionCount
                    failedExecutionCount
                    stepCount
                    spendMbSecs
                    instance {
                        id
                        name
                        customer {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    // GraphQL query for ALL instances daily usage metrics (no instance filter - for aggregation)
    const allInstancesDailyUsageMetricsQuery = `
        query GetAllInstancesDailyUsageMetrics($first: Int, $after: String, $snapshotDateGte: Date, $snapshotDateLte: Date) {
            instanceDailyUsageMetrics(
                first: $first,
                after: $after,
                snapshotDate_Gte: $snapshotDateGte,
                snapshotDate_Lte: $snapshotDateLte,
                sortBy: [{field: SNAPSHOT_DATE, direction: ASC}]
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    snapshotDate
                    successfulExecutionCount
                    failedExecutionCount
                    stepCount
                    spendMbSecs
                    instance {
                        id
                        name
                        customer {
                            id
                            name
                        }
                        integration {
                            id
                            name
                        }
                    }
                }
            }
        }
    `;

    // GraphQL query for recent executions with more details for analysis
    const recentExecutionsAnalysisQuery = `
        query GetRecentExecutionsAnalysis($first: Int, $after: String, $instanceId: ID, $customerId: ID, $startedAtGte: DateTime, $startedAtLte: DateTime) {
            executionResults(
                first: $first,
                after: $after,
                instance: $instanceId,
                instance_Customer: $customerId,
                startedAt_Gte: $startedAtGte,
                startedAt_Lte: $startedAtLte,
                orderBy: {field: STARTED_AT, direction: DESC}
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    id
                    startedAt
                    endedAt
                    status
                    invokeType
                    stepCount
                    spendMbSecs
                    error
                    flow {
                        id
                        name
                    }
                    instance {
                        id
                        name
                        customer {
                            id
                            name
                        }
                    }
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
    // flowId parameter filters to only get same-flow executions (excludes cross-flow calls)
    async function fetchLinkedExecutions(executionId, startedAt, flowId = null) {
        console.log(`Fetching linked executions for: ${executionId}${flowId ? ` (flow: ${flowId})` : ''}`);

        const variables = {
            invokedBy: {
                id: executionId,
                startedAt: startedAt
            }
        };

        if (flowId) {
            variables.flowId = flowId;
        }

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

    // Publish integration with optional comment
    async function publishIntegration(integrationId, comment = null) {
        console.log(`Publishing integration: ${integrationId}${comment ? ` with comment: "${comment}"` : ''}`);

        const variables = { id: integrationId };
        if (comment) {
            variables.comment = comment;
        }

        const data = await graphqlRequest(publishIntegrationMutation, variables);

        if (data.publishIntegration.errors && data.publishIntegration.errors.length > 0) {
            const errorMessages = data.publishIntegration.errors
                .map(e => e.messages.join(', '))
                .join('; ');
            throw new Error(`Failed to publish integration: ${errorMessages}`);
        }

        return data.publishIntegration.integration;
    }

    // ============================================
    // Analysis Page API Functions
    // ============================================

    // Fetch organization daily usage metrics
    async function fetchOrgDailyUsageMetrics(options = {}) {
        const { first = 100, after = null, snapshotDateGte = null, snapshotDateLte = null } = options;
        console.log('Fetching org daily usage metrics');

        const variables = { first };
        if (after) variables.after = after;
        if (snapshotDateGte) variables.snapshotDateGte = snapshotDateGte;
        if (snapshotDateLte) variables.snapshotDateLte = snapshotDateLte;

        const data = await graphqlRequest(orgDailyUsageMetricsQuery, variables);
        return data.orgDailyUsageMetrics;
    }

    // Fetch all org daily usage metrics with pagination
    async function* fetchAllOrgDailyUsageMetrics(options = {}) {
        const { batchSize = 100, snapshotDateGte = null, snapshotDateLte = null } = options;
        let allMetrics = [];
        let cursor = null;
        let hasMore = true;

        while (hasMore) {
            const metricsData = await fetchOrgDailyUsageMetrics({
                first: batchSize,
                after: cursor,
                snapshotDateGte,
                snapshotDateLte
            });

            if (!metricsData || !metricsData.nodes) break;

            allMetrics = allMetrics.concat(metricsData.nodes);
            hasMore = metricsData.pageInfo?.hasNextPage || false;
            cursor = metricsData.pageInfo?.endCursor || null;

            yield {
                metrics: allMetrics,
                loadedCount: allMetrics.length,
                totalCount: metricsData.totalCount,
                isComplete: !hasMore
            };
        }

        return allMetrics;
    }

    // Fetch customers list
    async function fetchCustomers(options = {}) {
        const { first = 50, after = null, searchTerm = null } = options;
        console.log('Fetching customers list');

        const variables = { first };
        if (after) variables.after = after;
        if (searchTerm) variables.searchTerm = searchTerm;

        const data = await graphqlRequest(customersQuery, variables);
        return data.customers;
    }

    // Fetch instances by customer
    async function fetchInstancesByCustomer(customerId, options = {}) {
        const { first = 50, after = null } = options;
        console.log(`Fetching instances for customer: ${customerId}`);

        const variables = { customerId, first };
        if (after) variables.after = after;

        const data = await graphqlRequest(instancesByCustomerQuery, variables);
        return data.instances;
    }

    // Fetch instance daily usage metrics
    // Note: Customer filtering is not supported by the API - filter client-side if needed
    async function fetchInstanceDailyUsageMetrics(options = {}) {
        const { first = 100, after = null, instanceId = null, snapshotDateGte = null, snapshotDateLte = null } = options;
        console.log('Fetching instance daily usage metrics');

        const variables = { first };
        if (after) variables.after = after;
        if (instanceId) variables.instanceId = instanceId;
        if (snapshotDateGte) variables.snapshotDateGte = snapshotDateGte;
        if (snapshotDateLte) variables.snapshotDateLte = snapshotDateLte;

        const data = await graphqlRequest(instanceDailyUsageMetricsQuery, variables);
        return data.instanceDailyUsageMetrics;
    }

    // Fetch all instance daily usage metrics with pagination (for specific instance)
    async function* fetchAllInstanceDailyUsageMetrics(options = {}) {
        const { batchSize = 100, instanceId = null, snapshotDateGte = null, snapshotDateLte = null } = options;
        let allMetrics = [];
        let cursor = null;
        let hasMore = true;

        while (hasMore) {
            const metricsData = await fetchInstanceDailyUsageMetrics({
                first: batchSize,
                after: cursor,
                instanceId,
                snapshotDateGte,
                snapshotDateLte
            });

            if (!metricsData || !metricsData.nodes) break;

            allMetrics = allMetrics.concat(metricsData.nodes);
            hasMore = metricsData.pageInfo?.hasNextPage || false;
            cursor = metricsData.pageInfo?.endCursor || null;

            yield {
                metrics: allMetrics,
                loadedCount: allMetrics.length,
                totalCount: metricsData.totalCount,
                isComplete: !hasMore
            };
        }

        return allMetrics;
    }

    // Fetch ALL instances' daily usage metrics (no instance filter - for top performers aggregation)
    async function fetchAllInstancesDailyUsageMetrics(options = {}) {
        const { first = 100, after = null, snapshotDateGte = null, snapshotDateLte = null } = options;
        console.log('Fetching all instances daily usage metrics');

        const variables = { first };
        if (after) variables.after = after;
        if (snapshotDateGte) variables.snapshotDateGte = snapshotDateGte;
        if (snapshotDateLte) variables.snapshotDateLte = snapshotDateLte;

        const data = await graphqlRequest(allInstancesDailyUsageMetricsQuery, variables);
        return data.instanceDailyUsageMetrics;
    }

    // Generator to fetch ALL instances' daily metrics with full pagination
    async function* fetchAllInstancesDailyUsageMetricsFull(options = {}) {
        const { batchSize = 100, snapshotDateGte = null, snapshotDateLte = null } = options;
        let allMetrics = [];
        let cursor = null;
        let hasMore = true;
        let totalCount = 0;

        while (hasMore) {
            const metricsData = await fetchAllInstancesDailyUsageMetrics({
                first: batchSize,
                after: cursor,
                snapshotDateGte,
                snapshotDateLte
            });

            if (!metricsData || !metricsData.nodes) break;

            totalCount = metricsData.totalCount || totalCount;
            allMetrics = allMetrics.concat(metricsData.nodes);
            hasMore = metricsData.pageInfo?.hasNextPage || false;
            cursor = metricsData.pageInfo?.endCursor || null;

            yield {
                metrics: allMetrics,
                loadedCount: allMetrics.length,
                totalCount: totalCount,
                hasMore: hasMore,
                isComplete: !hasMore
            };
        }

        return allMetrics;
    }

    // Fetch recent executions for analysis
    async function fetchRecentExecutionsAnalysis(options = {}) {
        const { first = 50, after = null, instanceId = null, customerId = null, startedAtGte = null, startedAtLte = null } = options;
        console.log('Fetching recent executions for analysis');

        const variables = { first };
        if (after) variables.after = after;
        if (instanceId) variables.instanceId = instanceId;
        if (customerId) variables.customerId = customerId;
        if (startedAtGte) variables.startedAtGte = startedAtGte;
        if (startedAtLte) variables.startedAtLte = startedAtLte;

        const data = await graphqlRequest(recentExecutionsAnalysisQuery, variables);
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
        publishIntegration,
        // Analysis methods
        fetchOrgDailyUsageMetrics,
        fetchAllOrgDailyUsageMetrics,
        fetchCustomers,
        fetchInstancesByCustomer,
        fetchInstanceDailyUsageMetrics,
        fetchAllInstanceDailyUsageMetrics,
        fetchAllInstancesDailyUsageMetrics,
        fetchAllInstancesDailyUsageMetricsFull,
        fetchRecentExecutionsAnalysis,
        // Legacy methods for backward compatibility
        loadSavedConfig,
        updateConfig
    };
})();

window.API = API;
