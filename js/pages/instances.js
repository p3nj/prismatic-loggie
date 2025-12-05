// Instances Page Handler
const InstancesPage = (() => {
    let initialized = false;
    let instancesData = null;
    let executionsData = null;
    let selectedInstance = null;
    let searchTimeout = null;
    let allFlowNames = new Set(); // Track all unique flow names
    let currentFilters = {
        dateFrom: null,
        dateTo: null,
        flowName: null,
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

    // Update URL with current state
    function updateUrl() {
        const params = new URLSearchParams();

        if (selectedInstance) {
            params.set('instanceId', selectedInstance.id);
            params.set('instanceName', selectedInstance.name);
        }

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

        const newHash = `#instances?${params.toString()}`;
        history.replaceState(null, '', newHash);
    }

    // Copy shareable link to clipboard
    function copyShareableLink() {
        const url = window.location.href;
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
        currentFilters.flowName = flowSelect.value || null;
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
                                  currentFilters.flowName || currentFilters.status;
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

    // Populate flow dropdown from executions data
    function populateFlowDropdown() {
        const flowSelect = document.getElementById('filterFlow');
        if (!flowSelect) return;

        // Get current selection before repopulating
        const currentSelection = currentFilters.flowName || flowSelect.value;

        // Clear and repopulate
        flowSelect.innerHTML = '<option value="">All Flows</option>';

        // Sort flow names alphabetically
        const sortedFlows = Array.from(allFlowNames).sort((a, b) => a.localeCompare(b));

        sortedFlows.forEach(flowName => {
            const option = document.createElement('option');
            option.value = flowName;
            option.textContent = flowName;
            flowSelect.appendChild(option);
        });

        // Restore selection if it exists
        if (currentSelection && allFlowNames.has(currentSelection)) {
            flowSelect.value = currentSelection;
        }
    }

    // Extract flow names from executions and add to the set
    function extractFlowNames(edges) {
        edges.forEach(edge => {
            const flowName = edge.node.flow?.name;
            if (flowName) {
                allFlowNames.add(flowName);
            }
        });
    }

    // Load all available flows for the dropdown from instance flowConfigs
    async function loadFlowsForDropdown(instanceId) {
        try {
            const instanceData = await API.fetchInstanceFlows(instanceId);
            if (instanceData && instanceData.flowConfigs && instanceData.flowConfigs.nodes) {
                allFlowNames = new Set();
                instanceData.flowConfigs.nodes.forEach(config => {
                    if (config.flow && config.flow.name) {
                        allFlowNames.add(config.flow.name);
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
                        <div class="fw-bold text-truncate" title="${instance.name}">${instance.name}</div>
                        <small class="text-muted d-block text-truncate">${instance.customer?.name || 'No customer'}</small>
                        <small class="text-muted d-block text-truncate">${instance.integration?.name || 'Unknown integration'}</small>
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

        // Reset flow names when selecting a new instance
        allFlowNames = new Set();

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

        // Reset flow names
        allFlowNames = new Set();

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

    // Load executions for an instance
    async function loadExecutions(instanceId, reset = false) {
        const contentDiv = document.getElementById('executionsContent');
        const loadMoreDiv = document.getElementById('executionsLoadMore');

        if (reset) {
            executionsData = null;
            contentDiv.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"></div><div class="mt-2">Loading executions...</div></div>';
        }

        try {
            const options = { first: 50 }; // Fetch more to get flow names
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
            // Note: Flow filtering is done client-side since API doesn't support it

            const data = await API.fetchExecutionsByInstance(instanceId, options);

            if (reset) {
                executionsData = data;
            } else {
                executionsData.edges = [...executionsData.edges, ...data.edges];
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

    // Render executions table (with client-side flow filtering)
    function renderExecutions(reset = false) {
        const contentDiv = document.getElementById('executionsContent');

        // Apply client-side flow filter
        let filteredEdges = executionsData.edges;
        if (currentFilters.flowName) {
            filteredEdges = executionsData.edges.filter(edge =>
                edge.node.flow?.name === currentFilters.flowName
            );
        }

        if (filteredEdges.length === 0) {
            const filterActive = currentFilters.dateFrom || currentFilters.dateTo ||
                                  currentFilters.flowName || currentFilters.status;
            contentDiv.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-inbox display-4 mb-3 d-block"></i>
                    ${filterActive ? 'No executions found matching the filter criteria' : 'No executions found for this instance'}
                </div>
            `;
            return;
        }

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

        filteredEdges.forEach(edge => {
            const exec = edge.node;
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
            <div class="text-muted small">
                Showing: ${filteredEdges.length} executions
                ${currentFilters.flowName ? ` (filtered by flow: ${currentFilters.flowName})` : ''}
                ${executionsData.totalCount ? ` | Total: ${executionsData.totalCount}` : ''}
            </div>
        `;

        contentDiv.innerHTML = html;

        // Add click handlers for view buttons
        contentDiv.querySelectorAll('.view-execution-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const executionId = btn.dataset.executionId;
                Router.navigate('execution', { executionId });
            });
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
        const badges = {
            'SUCCEEDED': '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Succeeded</span>',
            'FAILED': '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Failed</span>',
            'RUNNING': '<span class="badge bg-primary"><i class="bi bi-play-circle me-1"></i>Running</span>',
            'PENDING': '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass me-1"></i>Pending</span>',
            'CANCELED': '<span class="badge bg-secondary"><i class="bi bi-slash-circle me-1"></i>Canceled</span>'
        };
        return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
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
        currentFilters = { dateFrom: null, dateTo: null, flowName: null, status: null };
        allFlowNames = new Set();

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
