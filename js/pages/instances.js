// Instances Page Handler
const InstancesPage = (() => {
    let initialized = false;
    let instancesData = null;
    let executionsData = null;
    let selectedInstance = null;
    let searchTimeout = null;

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
    function selectInstance(instance) {
        selectedInstance = instance;

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

        // Load executions for this instance
        loadExecutions(instance.id, true);
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
            const options = { first: 20 };
            if (executionsData && executionsData.pageInfo.endCursor && !reset) {
                options.after = executionsData.pageInfo.endCursor;
            }

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

    // Render executions table
    function renderExecutions(reset = false) {
        const contentDiv = document.getElementById('executionsContent');

        if (executionsData.edges.length === 0) {
            contentDiv.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-inbox display-4 mb-3 d-block"></i>No executions found for this instance</div>';
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

        executionsData.edges.forEach(edge => {
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
            <div class="text-muted small">Total: ${executionsData.totalCount} executions</div>
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

        // Check if we have an instance to select (from params)
        if (params.instanceId) {
            // Try to find and select the instance
            const instanceItem = document.querySelector(`[data-instance-id="${params.instanceId}"]`);
            if (instanceItem) {
                instanceItem.click();
            }
        }

        // Load instances if authenticated
        if (API.isAuthenticated()) {
            loadInstances(true);
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
