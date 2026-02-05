// Instances Page Handler
const InstancesPage = (() => {
    let initialized = false;
    let instancesData = null;
    let executionsData = null;
    let selectedInstance = null;
    let searchTimeout = null;
    let allFlows = new Map(); // Map of flow name -> flow id
    let currentFilters = {
        dateFrom: null,
        dateTo: null,
        flowId: null,
        flowName: null, // Keep for display purposes
        status: null
    };

    // Initialize the instances page
    function init() {
        if (initialized) return;

        setupEventListeners();
        initialized = true;
    }

    // Setup event listeners
    function setupEventListeners() {
        // Refresh instances button
        const refreshBtn = document.getElementById('refreshInstancesBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadInstances(true));
        }

        // Search input with debounce
        const searchInput = document.getElementById('instanceSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadInstances(true, e.target.value);
                }, 300);
            });
        }

        // Load more instances button
        const loadMoreInstancesBtn = document.getElementById('loadMoreInstancesBtn');
        if (loadMoreInstancesBtn) {
            loadMoreInstancesBtn.addEventListener('click', loadMoreInstances);
        }

        // Load more executions button
        const loadMoreExecutionsBtn = document.getElementById('loadMoreExecutionsBtn');
        if (loadMoreExecutionsBtn) {
            loadMoreExecutionsBtn.addEventListener('click', loadMoreExecutions);
        }

        // Filter buttons
        const applyFilterBtn = document.getElementById('applyFilterBtn');
        if (applyFilterBtn) {
            applyFilterBtn.addEventListener('click', applyFilters);
        }

        const clearFilterBtn = document.getElementById('clearFilterBtn');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', clearFilters);
        }

        // Share button
        const shareFilterBtn = document.getElementById('shareFilterBtn');
        if (shareFilterBtn) {
            shareFilterBtn.addEventListener('click', copyShareableLink);
        }

        // Date input validation listeners
        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');
        if (fromInput) {
            fromInput.addEventListener('change', validateDateRange);
        }
        if (toInput) {
            toInput.addEventListener('change', validateDateRange);
        }
    }

    // Parse URL parameters
    function parseUrlParams() {
        const hash = window.location.hash;
        const params = {};

        // Parse hash parameters (e.g., #instances?instanceId=xxx&from=xxx&to=xxx&status=xxx&flow=xxx)
        if (hash.includes('?')) {
            const queryString = hash.split('?')[1];
            const urlParams = new URLSearchParams(queryString);

            if (urlParams.has('instanceId')) {
                params.instanceId = urlParams.get('instanceId');
            }
            if (urlParams.has('instanceName')) {
                params.instanceName = decodeURIComponent(urlParams.get('instanceName'));
            }
            if (urlParams.has('from')) {
                params.from = urlParams.get('from');
            }
            if (urlParams.has('to')) {
                params.to = urlParams.get('to');
            }
            if (urlParams.has('status')) {
                params.status = urlParams.get('status');
            }
            if (urlParams.has('flow')) {
                params.flow = decodeURIComponent(urlParams.get('flow'));
            }
        }

        return params;
    }

    // Update URL with current state (excludes datetime filters - those are only for sharing)
    function updateUrl() {
        const params = new URLSearchParams();

        if (selectedInstance) {
            params.set('instanceId', selectedInstance.id);
            params.set('instanceName', selectedInstance.name);
        }

        // Only include flow and status in URL, NOT datetime
        if (currentFilters.status) {
            params.set('status', currentFilters.status);
        }
        if (currentFilters.flowName) {
            params.set('flow', currentFilters.flowName);
        }

        const newHash = `#instances?${params.toString()}`;
        history.replaceState(null, '', newHash);
    }

    // Build full shareable URL including datetime filters
    function buildShareableUrl() {
        const params = new URLSearchParams();

        if (selectedInstance) {
            params.set('instanceId', selectedInstance.id);
            params.set('instanceName', selectedInstance.name);
        }

        // Include all filters for sharing
        if (currentFilters.dateFrom) {
            params.set('from', currentFilters.dateFrom);
        }
        if (currentFilters.dateTo) {
            params.set('to', currentFilters.dateTo);
        }
        if (currentFilters.status) {
            params.set('status', currentFilters.status);
        }
        if (currentFilters.flowName) {
            params.set('flow', currentFilters.flowName);
        }

        return `${window.location.origin}${window.location.pathname}#instances?${params.toString()}`;
    }

    // Copy shareable link to clipboard (includes datetime filters)
    function copyShareableLink() {
        const url = buildShareableUrl();
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('shareFilterBtn');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
            btn.classList.replace('btn-outline-secondary', 'btn-success');

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.classList.replace('btn-success', 'btn-outline-secondary');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy link. Please copy the URL manually.');
        });
    }

    // Validate date range (from cannot be after to)
    function validateDateRange() {
        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');
        const errorDiv = document.getElementById('dateValidationError');
        const applyBtn = document.getElementById('applyFilterBtn');

        if (fromInput.value && toInput.value) {
            const fromDate = new Date(fromInput.value);
            const toDate = new Date(toInput.value);

            if (fromDate > toDate) {
                errorDiv.classList.remove('d-none');
                applyBtn.disabled = true;
                fromInput.classList.add('is-invalid');
                toInput.classList.add('is-invalid');
                return false;
            }
        }

        errorDiv.classList.add('d-none');
        applyBtn.disabled = false;
        fromInput.classList.remove('is-invalid');
        toInput.classList.remove('is-invalid');
        return true;
    }

    // Set default date values (current datetime for "to", 7 days ago for "from")
    function setDefaultDateValues() {
        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');

        if (fromInput && !fromInput.value) {
            // Default "from" to 7 days ago
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 7);
            fromInput.value = formatDateForInput(fromDate);
        }

        if (toInput && !toInput.value) {
            // Default "to" to current datetime
            const toDate = new Date();
            toInput.value = formatDateForInput(toDate);
        }
    }

    // Apply all filters
    function applyFilters() {
        // Validate date range first
        if (!validateDateRange()) {
            return;
        }

        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');
        const flowSelect = document.getElementById('filterFlow');
        const statusSelect = document.getElementById('filterStatusSelect');

        currentFilters.dateFrom = fromInput.value ? new Date(fromInput.value).toISOString() : null;
        currentFilters.dateTo = toInput.value ? new Date(toInput.value).toISOString() : null;
        // Flow select value is the flow ID, get name from selected option text
        currentFilters.flowId = flowSelect.value || null;
        currentFilters.flowName = flowSelect.selectedOptions[0]?.text !== 'All Flows' ? flowSelect.selectedOptions[0]?.text : null;
        currentFilters.status = statusSelect.value || null;

        // Update URL
        updateUrl();

        // Update filter status badge
        updateFilterStatus();

        // Reload executions with filter
        if (selectedInstance) {
            loadExecutions(selectedInstance.id, true);
        }
    }

    // Clear all filters
    function clearFilters() {
        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');
        const flowSelect = document.getElementById('filterFlow');
        const statusSelect = document.getElementById('filterStatusSelect');
        const errorDiv = document.getElementById('dateValidationError');

        // Reset to default date values
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        fromInput.value = formatDateForInput(fromDate);

        const toDate = new Date();
        toInput.value = formatDateForInput(toDate);

        flowSelect.value = '';
        statusSelect.value = '';

        // Clear validation errors
        errorDiv.classList.add('d-none');
        fromInput.classList.remove('is-invalid');
        toInput.classList.remove('is-invalid');
        document.getElementById('applyFilterBtn').disabled = false;

        currentFilters = {
            dateFrom: null,
            dateTo: null,
            flowId: null,
            flowName: null,
            status: null
        };

        // Update URL
        updateUrl();

        // Update filter status
        updateFilterStatus();

        // Reload executions without filter
        if (selectedInstance) {
            loadExecutions(selectedInstance.id, true);
        }
    }

    // Update filter status badge
    function updateFilterStatus() {
        const filterStatus = document.getElementById('filterStatusBadge');
        const hasActiveFilters = currentFilters.dateFrom || currentFilters.dateTo ||
                                  currentFilters.flowId || currentFilters.status;
        if (hasActiveFilters) {
            filterStatus.classList.remove('d-none');
        } else {
            filterStatus.classList.add('d-none');
        }
    }

    // Set filter inputs from values
    function setFilterInputs(filters) {
        const fromInput = document.getElementById('filterDateFrom');
        const toInput = document.getElementById('filterDateTo');
        const flowSelect = document.getElementById('filterFlow');
        const statusSelect = document.getElementById('filterStatusSelect');

        if (filters.from && fromInput) {
            const fromDate = new Date(filters.from);
            fromInput.value = formatDateForInput(fromDate);
            currentFilters.dateFrom = filters.from;
        }

        if (filters.to && toInput) {
            const toDate = new Date(filters.to);
            toInput.value = formatDateForInput(toDate);
            currentFilters.dateTo = filters.to;
        }

        if (filters.flow && flowSelect) {
            // We'll set this after loading executions when we have the flow list
            currentFilters.flowName = filters.flow;
        }

        if (filters.status && statusSelect) {
            statusSelect.value = filters.status;
            currentFilters.status = filters.status;
        }

        updateFilterStatus();
    }

    // Format date for datetime-local input
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Show filter bar and share button
    function showFilterBar() {
        const filterBar = document.getElementById('executionsFilterBar');
        const shareBtn = document.getElementById('shareFilterBtn');
        if (filterBar) filterBar.classList.remove('d-none');
        if (shareBtn) shareBtn.classList.remove('d-none');
    }

    // Populate flow dropdown with flow IDs as values
    function populateFlowDropdown() {
        const flowSelect = document.getElementById('filterFlow');
        if (!flowSelect) return;

        // Get current selection before repopulating
        const currentFlowId = currentFilters.flowId || flowSelect.value;

        // Clear and repopulate
        flowSelect.innerHTML = '<option value="">All Flows</option>';

        // Sort flow names alphabetically and create options
        const sortedFlows = Array.from(allFlows.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        sortedFlows.forEach(([flowName, flowId]) => {
            const option = document.createElement('option');
            option.value = flowId;
            option.textContent = flowName;
            flowSelect.appendChild(option);
        });

        // Restore selection if it exists
        if (currentFlowId) {
            flowSelect.value = currentFlowId;
        }
    }

    // Load all available flows for the dropdown from instance flowConfigs
    async function loadFlowsForDropdown(instanceId) {
        try {
            const instanceData = await API.fetchInstanceFlows(instanceId);
            if (instanceData && instanceData.flowConfigs && instanceData.flowConfigs.nodes) {
                allFlows = new Map();
                instanceData.flowConfigs.nodes.forEach(config => {
                    if (config.flow && config.flow.name && config.flow.id) {
                        allFlows.set(config.flow.name, config.flow.id);
                    }
                });
                populateFlowDropdown();
            }
        } catch (error) {
            console.error('Error loading flows for dropdown:', error);
        }
    }

    // Load instances from API
    async function loadInstances(reset = false, searchTerm = null) {
        if (!API.isAuthenticated()) {
            showAuthRequired();
            return;
        }

        const listContainer = document.getElementById('instancesList');
        const loadMoreDiv = document.getElementById('instancesLoadMore');

        if (reset) {
            instancesData = null;
            listContainer.innerHTML = '<div class="p-3 text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading...</div>';
        }

        try {
            const options = { first: 20 };
            if (instancesData && instancesData.pageInfo.endCursor && !reset) {
                options.after = instancesData.pageInfo.endCursor;
            }
            if (searchTerm) {
                options.searchTerm = searchTerm;
            }

            const data = await API.fetchInstances(options);

            if (reset) {
                instancesData = data;
                listContainer.innerHTML = '';
            } else {
                // Append new edges
                instancesData.edges = [...instancesData.edges, ...data.edges];
                instancesData.pageInfo = data.pageInfo;
            }

            renderInstances(reset ? data.edges : data.edges);

            // Show/hide load more button
            if (instancesData.pageInfo.hasNextPage) {
                loadMoreDiv.classList.remove('d-none');
            } else {
                loadMoreDiv.classList.add('d-none');
            }

            if (instancesData.edges.length === 0) {
                listContainer.innerHTML = '<div class="p-3 text-center text-muted">No instances found</div>';
            }

        } catch (error) {
            console.error('Error loading instances:', error);
            listContainer.innerHTML = `<div class="p-3 text-center text-danger"><i class="bi bi-exclamation-circle me-1"></i>${error.message}</div>`;
        }
    }

    // Render instances to the list
    function renderInstances(instances) {
        const listContainer = document.getElementById('instancesList');

        instances.forEach(edge => {
            const instance = edge.node;
            const item = document.createElement('div');
            item.className = 'instance-item p-3 border-bottom';
            item.dataset.instanceId = instance.id;
            item.dataset.instanceName = instance.name;

            const statusClass = instance.enabled ? 'text-success' : 'text-muted';
            const statusIcon = instance.enabled ? 'bi-check-circle-fill' : 'bi-pause-circle';

            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 min-width-0">
                        <div class="instance-name" title="${instance.name}">${instance.name}</div>
                        <small class="text-muted d-block instance-meta">${instance.customer?.name || 'No customer'}</small>
                        <small class="text-muted d-block instance-meta">${instance.integration?.name || 'Unknown integration'}</small>
                    </div>
                    <div class="ms-2">
                        <i class="bi ${statusIcon} ${statusClass}"></i>
                    </div>
                </div>
                ${instance.lastExecutedAt ? `<small class="text-muted"><i class="bi bi-clock me-1"></i>Last: ${formatDate(instance.lastExecutedAt)}</small>` : ''}
            `;

            item.addEventListener('click', () => selectInstance(instance));
            listContainer.appendChild(item);
        });
    }

    // Load more instances (pagination)
    function loadMoreInstances() {
        const searchInput = document.getElementById('instanceSearchInput');
        const searchTerm = searchInput ? searchInput.value : null;
        loadInstances(false, searchTerm);
    }

    // Select an instance
    async function selectInstance(instance, skipUrlUpdate = false) {
        selectedInstance = instance;

        // Reset flows when selecting a new instance
        allFlows = new Map();

        // Update visual selection
        document.querySelectorAll('.instance-item').forEach(item => {
            item.classList.remove('active', 'bg-primary', 'text-white');
        });
        const selectedItem = document.querySelector(`[data-instance-id="${instance.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active', 'bg-primary', 'text-white');
        }

        // Update header
        document.getElementById('selectedInstanceName').textContent = instance.name;

        // Show filter bar
        showFilterBar();

        // Set default date values
        setDefaultDateValues();

        // Update URL if not skipping
        if (!skipUrlUpdate) {
            updateUrl();
        }

        // Load flows for dropdown first (without flow filter)
        await loadFlowsForDropdown(instance.id);

        // Load executions for this instance
        loadExecutions(instance.id, true);
    }

    // Select instance by ID (for URL-based selection)
    async function selectInstanceById(instanceId, instanceName, filters = {}) {
        // Create a minimal instance object
        const instance = {
            id: instanceId,
            name: instanceName || 'Loading...'
        };

        selectedInstance = instance;

        // Reset flows
        allFlows = new Map();

        // Update header
        document.getElementById('selectedInstanceName').textContent = instance.name;

        // Show filter bar
        showFilterBar();

        // Set default date values
        setDefaultDateValues();

        // Set filters if provided
        if (filters.from || filters.to || filters.status || filters.flow) {
            setFilterInputs(filters);
        }

        // Load flows for dropdown first (without flow filter)
        await loadFlowsForDropdown(instanceId);

        // Load executions for this instance
        await loadExecutions(instanceId, true);
    }

    // Fetch complete execution chains for executions that have lineage data
    // Uses server-side flowId filter to only get same-flow recursive calls (excludes cross-flow)
    // Back-fetches until true root is found (handles parents outside date filter)
    async function fetchCompleteChains(executions, targetFlowId) {
        const allExecutions = new Map(); // Final map of all executions
        const processedRoots = new Set(); // Track which roots we've already fetched

        // Add initial executions to map
        for (const exec of executions) {
            if (exec) allExecutions.set(exec.id, exec);
        }

        // Find initial chain roots from current executions
        let pendingRoots = new Map();
        for (const exec of executions) {
            if (!exec) continue;

            const parentRef = exec.lineage?.invokedBy?.execution;
            const hasChildren = exec.lineage?.hasChildren;

            if (parentRef?.id && parentRef?.startedAt) {
                // Has parent - add parent as potential root
                if (!processedRoots.has(parentRef.id) && !pendingRoots.has(parentRef.id)) {
                    pendingRoots.set(parentRef.id, { id: parentRef.id, startedAt: parentRef.startedAt });
                }
            } else if (hasChildren) {
                // Is a root with children - fetch its descendants
                if (!processedRoots.has(exec.id) && !pendingRoots.has(exec.id)) {
                    pendingRoots.set(exec.id, { id: exec.id, startedAt: exec.startedAt });
                }
            }
        }

        // Keep fetching until no more pending roots (back-fetch to true root)
        while (pendingRoots.size > 0) {
            console.log(`Fetching ${pendingRoots.size} chain(s) for flowId: ${targetFlowId}...`);

            const newPendingRoots = new Map();

            // Fetch chains sequentially to respect API rate limits
            for (const root of pendingRoots.values()) {
                processedRoots.add(root.id);

                try {
                    const chainExecutions = await API.fetchLinkedExecutions(root.id, root.startedAt, targetFlowId);

                    for (const exec of chainExecutions) {
                        allExecutions.set(exec.id, exec);

                        // Check if this fetched execution has a parent we haven't processed
                        const parentRef = exec.lineage?.invokedBy?.execution;
                        if (parentRef?.id && parentRef?.startedAt &&
                            !processedRoots.has(parentRef.id) &&
                            !allExecutions.has(parentRef.id)) {
                            // Parent is outside our results - need to back-fetch
                            newPendingRoots.set(parentRef.id, { id: parentRef.id, startedAt: parentRef.startedAt });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching chain for ${root.id}:`, error);
                }
            }

            pendingRoots = newPendingRoots;
        }

        return Array.from(allExecutions.values());
    }

    // Load executions for an instance
    async function loadExecutions(instanceId, reset = false) {
        const contentDiv = document.getElementById('executionsContent');
        const loadMoreDiv = document.getElementById('executionsLoadMore');

        if (reset) {
            executionsData = null;
            contentDiv.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"></div><div class="mt-2">Loading executions...</div></div>';
        }

        try {
            const options = { first: 50 };
            if (executionsData && executionsData.pageInfo.endCursor && !reset) {
                options.after = executionsData.pageInfo.endCursor;
            }

            // Add date filters (server-side)
            if (currentFilters.dateFrom) {
                options.startedAtGte = currentFilters.dateFrom;
            }
            if (currentFilters.dateTo) {
                options.startedAtLte = currentFilters.dateTo;
            }
            // Add status filter (server-side)
            if (currentFilters.status) {
                options.status = currentFilters.status;
            }
            // Add flow filter (server-side)
            if (currentFilters.flowId) {
                options.flowId = currentFilters.flowId;
            }

            const data = await API.fetchExecutionsByInstance(instanceId, options);

            // When flow filter is active, fetch complete chains to include executions outside date range
            // Uses server-side flowId filter to exclude cross-flow calls
            if (currentFilters.flowId && data.nodes && data.nodes.length > 0) {
                contentDiv.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"></div><div class="mt-2">Loading execution chains...</div></div>';
                data.nodes = await fetchCompleteChains(data.nodes, currentFilters.flowId);
            }

            if (reset) {
                executionsData = data;
            } else {
                // API now returns nodes instead of edges
                executionsData.nodes = [...executionsData.nodes, ...data.nodes];
                executionsData.pageInfo = data.pageInfo;
            }

            renderExecutions(reset);

            // Show/hide load more button
            if (executionsData.pageInfo.hasNextPage) {
                loadMoreDiv.classList.remove('d-none');
            } else {
                loadMoreDiv.classList.add('d-none');
            }

        } catch (error) {
            console.error('Error loading executions:', error);
            contentDiv.innerHTML = `<div class="text-center text-danger py-4"><i class="bi bi-exclamation-circle me-1"></i>${error.message}</div>`;
        }
    }

    // Build filter summary for display
    function getFilterSummary() {
        const parts = [];
        if (currentFilters.flowName) {
            parts.push(`Flow: ${currentFilters.flowName}`);
        }
        if (currentFilters.status) {
            parts.push(`Status: ${currentFilters.status}`);
        }
        if (currentFilters.dateFrom || currentFilters.dateTo) {
            const fromDate = currentFilters.dateFrom ? new Date(currentFilters.dateFrom).toLocaleDateString() : 'any';
            const toDate = currentFilters.dateTo ? new Date(currentFilters.dateTo).toLocaleDateString() : 'any';
            parts.push(`Date: ${fromDate} - ${toDate}`);
        }
        return parts.length > 0 ? ` (${parts.join(', ')})` : '';
    }

    // Group executions by their execution chain
    // Traverses lineage within the results to find the actual root
    function groupExecutionsByChain(executions) {
        const chains = new Map(); // Map of root execution ID -> array of executions
        const executionMap = new Map(); // Map of execution ID -> execution

        // First pass: build execution map
        executions.forEach(exec => {
            if (exec) {
                executionMap.set(exec.id, exec);
            }
        });

        // Second pass: group by chain
        executions.forEach(exec => {
            if (!exec) return;

            // Find the root of this chain
            let rootId = exec.id;
            let rootExec = exec;

            // If this execution was invoked by another, find the root
            if (exec.lineage?.invokedBy?.execution?.id) {
                const parentId = exec.lineage.invokedBy.execution.id;
                // Check if parent is in our list (same filter/time range)
                if (executionMap.has(parentId)) {
                    rootId = parentId;
                    rootExec = executionMap.get(parentId);
                    // Keep traversing up to find the actual root
                    while (rootExec.lineage?.invokedBy?.execution?.id &&
                           executionMap.has(rootExec.lineage.invokedBy.execution.id)) {
                        rootId = rootExec.lineage.invokedBy.execution.id;
                        rootExec = executionMap.get(rootId);
                    }
                }
            }

            // Add to chain group
            if (!chains.has(rootId)) {
                chains.set(rootId, []);
            }
            chains.get(rootId).push(exec);
        });

        // Sort executions within each chain by startedAt (ascending - oldest first)
        chains.forEach((chainExecutions, rootId) => {
            chainExecutions.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
        });

        // Convert to array and sort by first execution's startedAt (descending - newest chains first)
        return Array.from(chains.values()).sort((a, b) => {
            const aFirst = new Date(a[0].startedAt);
            const bFirst = new Date(b[0].startedAt);
            return bFirst - aFirst;
        });
    }

    // Get the final status of a chain (status of the last execution)
    function getChainFinalStatus(chainExecutions) {
        if (!chainExecutions || chainExecutions.length === 0) return 'UNKNOWN';
        const lastExec = chainExecutions[chainExecutions.length - 1];
        return lastExec.status;
    }

    // Calculate total duration of a chain
    function calculateChainDuration(chainExecutions) {
        if (!chainExecutions || chainExecutions.length === 0) return 'N/A';

        const firstStart = new Date(chainExecutions[0].startedAt);
        const lastExec = chainExecutions[chainExecutions.length - 1];

        // If the last execution hasn't ended, show as running
        if (!lastExec.endedAt) {
            const diff = Date.now() - firstStart.getTime();
            return formatDurationMs(diff) + ' (running)';
        }

        const lastEnd = new Date(lastExec.endedAt);
        const diff = lastEnd - firstStart;
        return formatDurationMs(diff);
    }

    // Format milliseconds to duration string
    function formatDurationMs(diff) {
        if (diff < 1000) return `${diff}ms`;
        if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
        return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
    }

    // Render execution chain card
    function renderExecutionChainCard(chainExecutions, chainIndex) {
        const firstExec = chainExecutions[0];
        const lastExec = chainExecutions[chainExecutions.length - 1];
        const finalStatus = getChainFinalStatus(chainExecutions);
        const statusBadge = getStatusBadge(finalStatus);
        const totalDuration = calculateChainDuration(chainExecutions);
        const isMultiExecution = chainExecutions.length > 1;
        const chainId = `chain-${chainIndex}`;

        let html = `
            <div class="execution-chain-card card mb-2" data-chain-id="${chainId}">
                <div class="card-header p-2 ${isMultiExecution ? 'cursor-pointer chain-header-toggle' : ''}"
                     ${isMultiExecution ? `data-bs-toggle="collapse" data-bs-target="#${chainId}-body"` : ''}>
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center flex-grow-1 min-width-0">
                            ${isMultiExecution ? `
                                <i class="bi bi-chevron-right chain-toggle-icon me-2"></i>
                            ` : ''}
                            ${statusBadge}
                            <span class="ms-2 text-truncate" title="${firstExec.flow?.name || 'Unknown'}">
                                ${firstExec.flow?.name || 'Unknown'}
                            </span>
                            ${isMultiExecution ? `
                                <span class="badge bg-secondary ms-2" title="Execution chain with ${chainExecutions.length} runs">
                                    <i class="bi bi-link-45deg"></i> ${chainExecutions.length}
                                </span>
                            ` : ''}
                        </div>
                        <div class="d-flex align-items-center ms-2 flex-shrink-0">
                            <small class="text-muted me-2 d-none d-md-inline">
                                <i class="bi bi-clock me-1"></i>${totalDuration}
                            </small>
                            <small class="text-muted me-3 d-none d-lg-inline">
                                ${formatDate(firstExec.startedAt)}
                            </small>
                            <button class="btn btn-sm btn-outline-primary view-execution-btn"
                                    data-execution-id="${firstExec.id}"
                                    title="View First Execution"
                                    onclick="event.stopPropagation();">
                                <i class="bi bi-journal-text"></i>
                            </button>
                        </div>
                    </div>
                </div>`;

        // Add collapsible body for multi-execution chains
        if (isMultiExecution) {
            html += `
                <div id="${chainId}-body" class="collapse">
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover mb-0 chain-executions-table">
                                <thead class="table-light">
                                    <tr>
                                        <th class="ps-3" style="width: 40px;">#</th>
                                        <th>Status</th>
                                        <th>Started</th>
                                        <th>Duration</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;

            chainExecutions.forEach((exec, index) => {
                const execStatusBadge = getStatusBadge(exec.status);
                const execDuration = calculateDuration(exec.startedAt, exec.endedAt);

                html += `
                    <tr class="chain-execution-row">
                        <td class="ps-3 text-muted">${index + 1}</td>
                        <td>${execStatusBadge}</td>
                        <td><small>${formatDate(exec.startedAt)}</small></td>
                        <td><small>${execDuration}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary view-execution-btn"
                                    data-execution-id="${exec.id}"
                                    title="View Execution">
                                <i class="bi bi-journal-text"></i>
                            </button>
                        </td>
                    </tr>`;
            });

            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        }

        html += `</div>`;
        return html;
    }

    // Render executions table (standard view without chain grouping)
    function renderExecutionsTable(executions) {
        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Flow</th>
                            <th>Started</th>
                            <th>Duration</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        executions.forEach(exec => {
            if (!exec) return;
            const statusBadge = getStatusBadge(exec.status);
            const duration = calculateDuration(exec.startedAt, exec.endedAt);

            html += `
                <tr>
                    <td>${statusBadge}</td>
                    <td>${exec.flow?.name || 'Unknown'}</td>
                    <td><small>${formatDate(exec.startedAt)}</small></td>
                    <td><small>${duration}</small></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-execution-btn" data-execution-id="${exec.id}" title="View Logs">
                            <i class="bi bi-journal-text"></i> View
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        return html;
    }

    // Render executions with chain grouping
    function renderExecutions(reset = false) {
        const contentDiv = document.getElementById('executionsContent');

        // Defensive check for executionsData
        if (!executionsData || !executionsData.nodes) {
            contentDiv.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-inbox display-4 mb-3 d-block"></i>
                    No executions data available
                </div>
            `;
            return;
        }

        const executions = executionsData.nodes;

        if (executions.length === 0) {
            const filterActive = currentFilters.dateFrom || currentFilters.dateTo ||
                                  currentFilters.flowId || currentFilters.status;
            contentDiv.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-inbox display-4 mb-3 d-block"></i>
                    ${filterActive ? 'No executions found matching the filter criteria' : 'No executions found for this instance'}
                </div>
            `;
            return;
        }

        let html = '';

        // Check if flow filter is active - use chain grouping view
        if (currentFilters.flowId) {
            // Group executions by chain
            const chains = groupExecutionsByChain(executions);

            // Check if there are any actual chains (groups with more than 1 execution)
            const hasChains = chains.some(chain => chain.length > 1);

            if (hasChains) {
                html += `<div class="execution-chains-container">`;
                chains.forEach((chain, index) => {
                    html += renderExecutionChainCard(chain, index);
                });
                html += `</div>`;
            } else {
                // No chains found, use standard table view
                html = renderExecutionsTable(executions);
            }
        } else {
            // Standard table view when no flow filter
            html = renderExecutionsTable(executions);
        }

        html += `
            <div class="text-muted small mt-2">
                Showing: ${executions.length} executions${getFilterSummary()}
                ${executionsData.totalCount ? ` | Total: ${executionsData.totalCount}` : ''}
            </div>
        `;

        contentDiv.innerHTML = html;

        // Scroll to top of executions panel when filters are applied (reset=true)
        if (reset) {
            const panel = document.getElementById('executionsPanel');
            if (panel) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // Add click handlers for view buttons
        contentDiv.querySelectorAll('.view-execution-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const executionId = btn.dataset.executionId;
                Router.navigate('execution', { executionId });
            });
        });

        // Add toggle icon animation for chain cards
        contentDiv.querySelectorAll('.chain-header-toggle').forEach(header => {
            const chainCard = header.closest('.execution-chain-card');
            const chainId = chainCard.dataset.chainId;
            const collapseEl = document.getElementById(`${chainId}-body`);
            const toggleIcon = header.querySelector('.chain-toggle-icon');

            if (collapseEl && toggleIcon) {
                collapseEl.addEventListener('show.bs.collapse', () => {
                    toggleIcon.classList.remove('bi-chevron-right');
                    toggleIcon.classList.add('bi-chevron-down');
                });
                collapseEl.addEventListener('hide.bs.collapse', () => {
                    toggleIcon.classList.remove('bi-chevron-down');
                    toggleIcon.classList.add('bi-chevron-right');
                });
            }
        });
    }

    // Load more executions (pagination)
    function loadMoreExecutions() {
        if (selectedInstance) {
            loadExecutions(selectedInstance.id, false);
        }
    }

    // Show authentication required message
    function showAuthRequired() {
        const listContainer = document.getElementById('instancesList');
        listContainer.innerHTML = `
            <div class="p-4 text-center">
                <i class="bi bi-key display-4 text-warning mb-3 d-block"></i>
                <p class="mb-3">Please set up your API token to view instances.</p>
                <button class="btn btn-primary" onclick="Router.navigate('auth')">
                    <i class="bi bi-key me-1"></i>Setup Token
                </button>
            </div>
        `;
    }

    // Helper: Get status badge HTML
    function getStatusBadge(status) {
        // Normalize status to handle API variations
        const normalizedStatus = status ? status.toUpperCase() : '';

        // Success states (green)
        if (normalizedStatus === 'SUCCEEDED' || normalizedStatus === 'SUCCESS') {
            return '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Succeeded</span>';
        }
        // Failed/Error states (red)
        if (normalizedStatus === 'FAILED' || normalizedStatus === 'FAILURE' || normalizedStatus === 'ERROR') {
            return '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Failed</span>';
        }
        // Running states (blue)
        if (normalizedStatus === 'RUNNING' || normalizedStatus === 'IN_PROGRESS') {
            return '<span class="badge bg-primary"><i class="bi bi-play-circle me-1"></i>Running</span>';
        }
        // Pending states (yellow)
        if (normalizedStatus === 'PENDING' || normalizedStatus === 'QUEUED') {
            return '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass me-1"></i>Pending</span>';
        }
        // Canceled state (gray)
        if (normalizedStatus === 'CANCELED' || normalizedStatus === 'CANCELLED') {
            return '<span class="badge bg-secondary"><i class="bi bi-slash-circle me-1"></i>Canceled</span>';
        }
        // Unknown status (gray)
        return `<span class="badge bg-secondary">${status || 'Unknown'}</span>`;
    }

    // Helper: Format date
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    // Helper: Calculate duration
    function calculateDuration(start, end) {
        if (!start || !end) return 'N/A';
        const startTime = new Date(start);
        const endTime = new Date(end);
        const diff = endTime - startTime;

        if (diff < 1000) return `${diff}ms`;
        if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
        return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
    }

    // Route handler
    function onRoute(params) {
        init();

        // Reset filters on new route
        currentFilters = { dateFrom: null, dateTo: null, flowId: null, flowName: null, status: null };
        allFlows = new Map();

        // Parse URL parameters
        const urlParams = parseUrlParams();

        // Load instances if authenticated
        if (API.isAuthenticated()) {
            loadInstances(true).then(() => {
                // Check if we have an instance to select from URL params
                if (urlParams.instanceId) {
                    // Try to find the instance in the loaded list
                    const instanceItem = document.querySelector(`[data-instance-id="${urlParams.instanceId}"]`);
                    if (instanceItem) {
                        // Get the full instance data and select it
                        const instance = instancesData?.edges?.find(e => e.node.id === urlParams.instanceId)?.node;
                        if (instance) {
                            // Set filters before selecting
                            if (urlParams.from || urlParams.to || urlParams.status || urlParams.flow) {
                                setFilterInputs({
                                    from: urlParams.from,
                                    to: urlParams.to,
                                    status: urlParams.status,
                                    flow: urlParams.flow
                                });
                            }
                            selectInstance(instance, true);
                        }
                    } else {
                        // Instance not in current list, select by ID directly
                        selectInstanceById(urlParams.instanceId, urlParams.instanceName, {
                            from: urlParams.from,
                            to: urlParams.to,
                            status: urlParams.status,
                            flow: urlParams.flow
                        });
                    }
                }
            });
        } else {
            showAuthRequired();
        }
    }

    return {
        init,
        onRoute,
        loadInstances
    };
})();

window.InstancesPage = InstancesPage;
