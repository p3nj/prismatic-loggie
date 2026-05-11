// Instances Page Handler
const InstancesPage = (() => {
    let initialized = false;
    let instancesData = null;
    let executionsData = null;
    let selectedInstance = null;
    let searchTimeout = null;
    let fp = null; // Flatpickr range picker instance
    let allFlows = new Map(); // Map of flow name -> flow id
    let currentFilters = {
        dateFrom: null,
        dateTo: null,
        flowId: null,
        flowName: null, // Keep for display purposes
        status: null
    };

    // Live polling state for execution list
    // Prismatic API limit: 20 req/s. Built-in rate limiter: 4 req/s (250ms).
    // Polling at 5s intervals uses ~0.2 req/s - very conservative.
    const EXEC_POLL_INTERVAL = 5000; // 5 seconds - balances freshness vs API usage
    const ACTIVE_EXEC_STATUSES = ['RUNNING', 'IN_PROGRESS', 'PENDING', 'QUEUED'];
    let execPollTimer = null;
    let isExecPollInFlight = false;

    function isActiveExecStatus(status) {
        return ACTIVE_EXEC_STATUSES.includes(status?.toUpperCase());
    }

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

        // Date range picker (Flatpickr)
        let _fpBlocking = false;
        fp = flatpickr('#filterDateRange', {
            mode: 'range',
            enableTime: true,
            time_24hr: true,
            dateFormat: 'M d, Y H:i',
            onReady(selectedDates, dateStr, instance) {
                const label = document.createElement('div');
                label.className = 'fp-time-label';
                label.textContent = 'Setting: start time';
                const timeEl = instance.calendarContainer.querySelector('.flatpickr-time');
                if (timeEl) timeEl.prepend(label);
            },
            onChange(selectedDates, dateStr, instance) {
                const label = instance.calendarContainer.querySelector('.fp-time-label');
                if (label) label.textContent = selectedDates.length < 2 ? 'Setting: start time' : 'Setting: end time';

                if (_fpBlocking || selectedDates.length !== 2) return;
                const [s, e] = selectedDates;
                if (isSameCalendarDay(s, e)) {
                    _fpBlocking = true;
                    const dayStart = new Date(s); dayStart.setHours(0, 0, 0, 0);
                    const dayEnd   = new Date(s); dayEnd.setHours(23, 59, 0, 0);
                    fp.setDate([dayStart, dayEnd]);
                    fp.close();
                    _fpBlocking = false;
                }
                validateDateRange();
            }
        });
        setDefaultDateValues();
    }

    function isSameCalendarDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
               a.getMonth()    === b.getMonth()    &&
               a.getDate()     === b.getDate();
    }

    // Build the params blob the router/UrlState codec expects.
    function buildRouteParams() {
        const params = {};
        if (selectedInstance) {
            params.instanceId = selectedInstance.id;
            if (selectedInstance.name) params.instanceName = selectedInstance.name;
        }
        if (currentFilters.dateFrom) params.from = currentFilters.dateFrom;
        if (currentFilters.dateTo) params.to = currentFilters.dateTo;
        if (currentFilters.status) params.status = currentFilters.status;
        if (currentFilters.flowId) params.flowId = currentFilters.flowId;
        return params;
    }

    function updateUrl() {
        Router.replaceState('instances', buildRouteParams());
    }

    function buildShareableUrl() {
        return UrlState.buildShareUrl('instances', buildRouteParams());
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

    // Validate date range — Flatpickr ensures start ≤ end, so just check a range is selected
    function validateDateRange() {
        const applyBtn = document.getElementById('applyFilterBtn');
        const valid = fp && fp.selectedDates.length === 2;
        if (applyBtn) applyBtn.disabled = !valid;
        return valid;
    }

    // Set default date values (7 days ago 00:00 → today 00:00) via Flatpickr
    function setDefaultDateValues() {
        if (!fp || fp.selectedDates.length > 0) return;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date();
        toDate.setHours(0, 0, 0, 0);
        fp.setDate([fromDate, toDate], false);
    }

    // Apply all filters
    function applyFilters() {
        stopExecPolling();
        if (!validateDateRange()) return;

        const [fromDate, toDate] = fp.selectedDates;
        const flowSelect = document.getElementById('filterFlow');
        const statusSelect = document.getElementById('filterStatusSelect');

        currentFilters.dateFrom = fromDate.toISOString();
        currentFilters.dateTo = toDate.toISOString();
        currentFilters.flowId = flowSelect.value || null;
        currentFilters.flowName = flowSelect.selectedOptions[0]?.text !== 'All Flows' ? flowSelect.selectedOptions[0]?.text : null;
        currentFilters.status = statusSelect.value || null;

        updateUrl();
        updateFilterStatus();

        if (selectedInstance) {
            loadExecutions(selectedInstance.id, true);
        }
    }

    // Clear all filters
    function clearFilters() {
        stopExecPolling();

        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date();
        toDate.setHours(0, 0, 0, 0);
        if (fp) fp.setDate([fromDate, toDate], false);

        document.getElementById('filterFlow').value = '';
        document.getElementById('filterStatusSelect').value = '';

        currentFilters = {
            dateFrom: null,
            dateTo: null,
            flowId: null,
            flowName: null,
            status: null
        };

        updateUrl();
        updateFilterStatus();

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
        const flowSelect = document.getElementById('filterFlow');
        const statusSelect = document.getElementById('filterStatusSelect');

        if (filters.from && filters.to && fp) {
            fp.setDate([new Date(filters.from), new Date(filters.to)], false);
            currentFilters.dateFrom = filters.from;
            currentFilters.dateTo = filters.to;
        } else if (filters.from && fp) {
            fp.setDate([new Date(filters.from), new Date()], false);
            currentFilters.dateFrom = filters.from;
        }

        if (filters.flowId && flowSelect) {
            // Canonical case: URL/state carries the flowId.
            currentFilters.flowId = filters.flowId;
            // Look up name now if flows are already loaded; otherwise populateFlowDropdown
            // will fill the dropdown selection once it runs.
            for (const [name, id] of allFlows.entries()) {
                if (id === filters.flowId) {
                    currentFilters.flowName = name;
                    break;
                }
            }
            // If the option already exists in the dropdown, select it.
            if (Array.from(flowSelect.options).some(o => o.value === filters.flowId)) {
                flowSelect.value = filters.flowId;
            }
        } else if (filters.flow && flowSelect) {
            // Backward compat: legacy URLs carry flow name only. Resolved by
            // populateFlowDropdown once the flow list has loaded.
            currentFilters.flowName = filters.flow;
        }

        if (filters.status && statusSelect) {
            statusSelect.value = filters.status;
            currentFilters.status = filters.status;
        }

        updateFilterStatus();
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

        // Backward compat: if state came from a legacy URL that carried flow=NAME,
        // resolve it to the canonical flowId now that allFlows is populated.
        if (!currentFilters.flowId && currentFilters.flowName && allFlows.has(currentFilters.flowName)) {
            currentFilters.flowId = allFlows.get(currentFilters.flowName);
        }

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
        // Stop any existing execution list polling
        stopExecPolling();

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
    // onProgress callback for live UI updates: (executions, remaining, fetched) => void
    // alreadyLoadedNodes: optional array of nodes already loaded (from previous batches) to avoid redundant fetches
    async function fetchCompleteChains(executions, targetFlowId, onProgress, alreadyLoadedNodes = []) {
        const allExecutions = new Map(); // Final map of all executions
        const processedRoots = new Set(); // Track which roots we've already fetched

        // Add already-loaded nodes to map first (these are from previous Load More batches)
        for (const exec of alreadyLoadedNodes) {
            if (exec) {
                allExecutions.set(exec.id, exec);
            }
        }

        // Add initial executions to map
        for (const exec of executions) {
            if (exec) allExecutions.set(exec.id, exec);
        }

        // Find nodes that need back-fetching to find their roots
        // NOTE: We only back-fetch (find parents), NOT forward-fetch (find children), because:
        // - hasChildren=true includes cross-flow calls, but we filter by same-flow
        // - Forward-fetching causes excessive API calls (49 calls returning empty for cross-flow)
        // - Same-flow children within date filter are already in results
        // Back-fetch works for ANY node with parent outside results (including leaf nodes)
        let pendingRoots = new Map();
        for (const exec of executions) {
            if (!exec) continue;

            const parentRef = exec.lineage?.invokedBy?.execution;

            // Back-fetch: has parent outside results - fetch to find the root and complete the chain
            if (parentRef?.id && parentRef?.startedAt) {
                if (!allExecutions.has(parentRef.id) && !processedRoots.has(parentRef.id) && !pendingRoots.has(parentRef.id)) {
                    pendingRoots.set(parentRef.id, { id: parentRef.id, startedAt: parentRef.startedAt });
                }
            }
        }

        if (pendingRoots.size === 0) {
            // No chains to fetch - return all executions (including already-loaded)
            return Array.from(allExecutions.values());
        }

        let fetchedCount = 0;

        // Keep fetching until no more pending roots (back-fetch to true root)
        while (pendingRoots.size > 0) {
            console.log(`Fetching ${pendingRoots.size} chain(s) for flowId: ${targetFlowId}...`);

            const newPendingRoots = new Map();

            // Fetch chains sequentially to respect API rate limits
            for (const root of pendingRoots.values()) {
                processedRoots.add(root.id);
                fetchedCount++;

                try {
                    const chainExecutions = await API.fetchLinkedExecutions(root.id, root.startedAt, targetFlowId);

                    for (const exec of chainExecutions) {
                        allExecutions.set(exec.id, exec);

                        // Check if this fetched execution also needs back-fetch
                        // (its parent might also be outside our results - continue up the chain)
                        const parentRef = exec.lineage?.invokedBy?.execution;
                        if (parentRef?.id && parentRef?.startedAt &&
                            !processedRoots.has(parentRef.id) &&
                            !allExecutions.has(parentRef.id)) {
                            // Parent is outside our results - need to back-fetch
                            newPendingRoots.set(parentRef.id, { id: parentRef.id, startedAt: parentRef.startedAt });
                        }
                    }

                    // Live update UI after each fetch
                    if (onProgress) {
                        const remaining = pendingRoots.size - fetchedCount + newPendingRoots.size;
                        onProgress(Array.from(allExecutions.values()), remaining, fetchedCount);
                    }
                } catch (error) {
                    console.error(`Error fetching chain for ${root.id}:`, error);
                }
            }

            pendingRoots = newPendingRoots;
            fetchedCount = 0; // Reset for next round
        }

        return Array.from(allExecutions.values());
    }

    // ==========================================
    // Live Polling for Execution List
    // ==========================================

    function startExecPolling() {
        stopExecPolling();
        isExecPollInFlight = false;
        showExecLiveIndicator();
        execPollTimer = setInterval(pollExecutions, EXEC_POLL_INTERVAL);
        console.log(`Execution list polling started (${EXEC_POLL_INTERVAL}ms interval)`);
    }

    function stopExecPolling() {
        if (execPollTimer) {
            clearInterval(execPollTimer);
            execPollTimer = null;
            console.log('Execution list polling stopped');
        }
        isExecPollInFlight = false;
        hideExecLiveIndicator();
    }

    function showExecLiveIndicator() {
        let liveEl = document.getElementById('executions-live-indicator');
        if (!liveEl) {
            liveEl = document.createElement('span');
            liveEl.id = 'executions-live-indicator';
            liveEl.className = 'live-indicator executions-live-indicator';
            liveEl.innerHTML = '<span class="live-dot"></span> <span class="live-text">LIVE</span>';
            const header = document.querySelector('#executionsPanel .card-header h5');
            if (header) {
                header.appendChild(liveEl);
            }
        }
    }

    function hideExecLiveIndicator() {
        const liveEl = document.getElementById('executions-live-indicator');
        if (liveEl) liveEl.remove();
    }

    // Check if polling should be active based on current execution data
    function checkAndStartExecPolling() {
        if (!executionsData || !executionsData.nodes) {
            stopExecPolling();
            return;
        }

        const hasActive = executionsData.nodes.some(exec =>
            exec && isActiveExecStatus(exec.status)
        );

        if (hasActive && !execPollTimer) {
            startExecPolling();
        } else if (!hasActive && execPollTimer) {
            stopExecPolling();
        }
    }

    async function pollExecutions() {
        if (isExecPollInFlight || !selectedInstance || !executionsData) return;
        isExecPollInFlight = true;

        try {
            // Re-fetch the first page of executions with same filters
            const options = { first: 50 };
            if (currentFilters.dateFrom) options.startedAtGte = currentFilters.dateFrom;
            if (currentFilters.dateTo) options.startedAtLte = currentFilters.dateTo;
            if (currentFilters.status) options.status = currentFilters.status;
            if (currentFilters.flowId) options.flowId = currentFilters.flowId;

            const data = await API.fetchExecutionsByInstance(selectedInstance.id, options);
            if (!data || !data.nodes) return;

            // Build maps for comparison
            const existingMap = new Map();
            executionsData.nodes.forEach(exec => {
                if (exec) existingMap.set(exec.id, exec);
            });

            let hasChanges = false;

            // Check for changes in the refreshed data
            for (const exec of data.nodes) {
                if (!exec) continue;
                const existing = existingMap.get(exec.id);
                if (!existing) {
                    hasChanges = true;
                    break;
                }
                if (existing.status !== exec.status || existing.endedAt !== exec.endedAt) {
                    hasChanges = true;
                    break;
                }
            }

            // Also check if totalCount changed (new executions may have started)
            if (!hasChanges && data.totalCount !== executionsData.totalCount) {
                hasChanges = true;
            }

            if (hasChanges) {
                // Merge: update existing nodes with new data
                const newMap = new Map();
                data.nodes.forEach(exec => {
                    if (exec) newMap.set(exec.id, exec);
                });

                // Update existing entries with fresh data
                executionsData.nodes = executionsData.nodes.map(exec => {
                    if (!exec) return exec;
                    return newMap.get(exec.id) || exec;
                });

                // Add new executions at the beginning (they're newer)
                const existingIds = new Set(executionsData.nodes.map(e => e?.id).filter(Boolean));
                const newExecs = data.nodes.filter(e => e && !existingIds.has(e.id));
                if (newExecs.length > 0) {
                    executionsData.nodes = [...newExecs, ...executionsData.nodes];
                }

                // Update totalCount
                if (data.totalCount) {
                    executionsData.totalCount = data.totalCount;
                }

                renderExecutions(false);
            }

            // Check if we should continue polling
            const hasActiveExecutions = executionsData.nodes.some(exec =>
                exec && isActiveExecStatus(exec.status)
            );

            if (!hasActiveExecutions) {
                stopExecPolling();
            }
        } catch (error) {
            console.error('Execution list polling error:', error);
        } finally {
            isExecPollInFlight = false;
        }
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
                // For Load More (reset=false), preserve existing nodes before chain fetching
                // This prevents the old batch from being lost during onProgress updates
                const existingNodes = (!reset && executionsData?.nodes) ? [...executionsData.nodes] : [];

                // Live update callback - render progressively as chains are fetched
                // allNodes already includes existingNodes + new batch + chain-fetched nodes
                const onProgress = (allNodes, remaining, fetched) => {
                    executionsData = { ...data, nodes: allNodes };
                    // Use false to preserve scroll position during progress updates
                    renderExecutions(false);

                    // Show progress indicator
                    const progressDiv = document.getElementById('chainLoadingProgress');
                    if (progressDiv) {
                        if (remaining > 0) {
                            progressDiv.innerHTML = `<small class="text-muted"><i class="bi bi-arrow-repeat spin me-1"></i>Loading chains... ${remaining} remaining</small>`;
                            progressDiv.classList.remove('d-none');
                        } else {
                            progressDiv.classList.add('d-none');
                        }
                    }
                };

                // Pass existingNodes to avoid redundant API calls for already-loaded chains
                // fetchCompleteChains returns all nodes (existing + new + chain-fetched)
                data.nodes = await fetchCompleteChains(data.nodes, currentFilters.flowId, onProgress, existingNodes);
            }

            if (reset) {
                executionsData = data;
            } else {
                // For flow filter: data already contains combined old + new (deduped above)
                // For non-flow filter: need to append normally
                if (currentFilters.flowId) {
                    executionsData = data;
                } else {
                    executionsData.nodes = [...executionsData.nodes, ...data.nodes];
                }
                executionsData.pageInfo = data.pageInfo;
            }

            renderExecutions(reset);

            // Show/hide load more button
            if (executionsData.pageInfo.hasNextPage) {
                loadMoreDiv.classList.remove('d-none');
            } else {
                loadMoreDiv.classList.add('d-none');
            }

            // Start/stop live polling based on whether active executions exist
            checkAndStartExecPolling();

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
                <tr data-execution-id="${exec.id}">
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
    //
    // Filter preservation strategy:
    //   1. URL is the canonical state for share links and full-page reloads.
    //      All filter fields are round-tripped via a single base64 `f` query param.
    //   2. In-memory `currentFilters` survives in-app navigation (the user switching
    //      to another page and coming back), because the browser wipes the hash
    //      query string when navigating to a different hash anchor.
    //   3. URL params overwrite in-memory state when present, so a shared link
    //      always reproduces the exact view it was copied from.
    //   4. allFlows is reset every route entry because it's per-instance.
    function onRoute(params) {
        init();

        // Stop any existing polling
        stopExecPolling();

        // Reset per-instance flow cache (rebuilt by loadFlowsForDropdown)
        allFlows = new Map();

        // Router has already decoded the base64 hash into `params`.
        const urlParams = params || {};
        const urlHasFilters = urlParams.from || urlParams.to || urlParams.status ||
                              urlParams.flow || urlParams.flowId;

        // Only reset currentFilters if the URL is providing fresh filter state.
        // If the URL has no filter params, keep the in-memory state so that
        // navigating away and back doesn't drop the user's filters.
        if (urlHasFilters) {
            currentFilters = { dateFrom: null, dateTo: null, flowId: null, flowName: null, status: null };
        }

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
                            // Restore filters from URL before selecting (so loadExecutions sees them)
                            if (urlHasFilters) {
                                setFilterInputs({
                                    from: urlParams.from,
                                    to: urlParams.to,
                                    status: urlParams.status,
                                    flow: urlParams.flow,
                                    flowId: urlParams.flowId
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
                            flow: urlParams.flow,
                            flowId: urlParams.flowId
                        });
                    }
                } else if (selectedInstance && !urlHasFilters) {
                    // No URL state but we still remember a selection in memory.
                    // Reselect so the previous filtered view is restored on nav-back.
                    const instance = instancesData?.edges?.find(e => e.node.id === selectedInstance.id)?.node;
                    if (instance) {
                        // Push currentFilters back into the input elements before reselecting.
                        setFilterInputs({
                            from: currentFilters.dateFrom,
                            to: currentFilters.dateTo,
                            status: currentFilters.status,
                            flowId: currentFilters.flowId
                        });
                        selectInstance(instance, true);
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
        loadInstances,
        stopExecPolling
    };
})();

window.InstancesPage = InstancesPage;
