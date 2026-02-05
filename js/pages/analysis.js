// Analysis Page - Comprehensive metrics dashboard with drill-down capabilities
const AnalysisPage = (() => {
    // State management
    let state = {
        initialized: false,
        level: 'org', // 'org', 'customer', 'instance'
        selectedCustomerId: null,
        selectedCustomerName: null,
        selectedInstanceId: null,
        selectedInstanceName: null,
        timeRange: '7d',
        dateFrom: null,
        dateTo: null,
        autoRefresh: true,
        refreshInterval: 30000,
        lastUpdated: null,
        refreshTimer: null,
        // Data caches
        data: {
            dailyMetrics: [],
            customers: [],
            customerInstances: [],
            recentExecutions: []
        },
        // Pagination
        pagination: {
            customers: { cursor: null, hasMore: true },
            instances: { cursor: null, hasMore: true }
        }
    };

    // Chart instances
    let charts = {
        executionsTime: null,
        outcome: null,
        trigger: null,
        spend: null,
        topVolume: null,
        topErrors: null
    };

    // Chart.js default colors
    const chartColors = {
        success: 'rgba(25, 135, 84, 0.8)',
        successBg: 'rgba(25, 135, 84, 0.2)',
        error: 'rgba(220, 53, 69, 0.8)',
        errorBg: 'rgba(220, 53, 69, 0.2)',
        primary: 'rgba(13, 110, 253, 0.8)',
        primaryBg: 'rgba(13, 110, 253, 0.2)',
        secondary: 'rgba(108, 117, 125, 0.8)',
        warning: 'rgba(255, 193, 7, 0.8)',
        info: 'rgba(13, 202, 240, 0.8)',
        palette: [
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(199, 199, 199, 0.8)',
            'rgba(83, 102, 255, 0.8)',
            'rgba(255, 99, 255, 0.8)',
            'rgba(99, 255, 132, 0.8)'
        ]
    };

    // Initialize the page
    function init() {
        if (state.initialized) return;

        setupEventListeners();
        initializeDateRange();
        state.initialized = true;
    }

    // Set up event listeners
    function setupEventListeners() {
        // Time range buttons
        document.querySelectorAll('#timeRangeButtons button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#timeRangeButtons button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                state.timeRange = e.target.dataset.range;
                updateDateRange();
                loadAllData();
            });
        });

        // Custom date inputs
        document.getElementById('analysisDateFrom')?.addEventListener('change', (e) => {
            state.dateFrom = e.target.value;
            document.querySelectorAll('#timeRangeButtons button').forEach(b => b.classList.remove('active'));
            loadAllData();
        });

        document.getElementById('analysisDateTo')?.addEventListener('change', (e) => {
            state.dateTo = e.target.value;
            document.querySelectorAll('#timeRangeButtons button').forEach(b => b.classList.remove('active'));
            loadAllData();
        });

        // Auto-refresh toggle
        document.getElementById('autoRefreshToggle')?.addEventListener('change', (e) => {
            state.autoRefresh = e.target.checked;
            if (state.autoRefresh) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });

        // Manual refresh button
        document.getElementById('refreshAnalysisBtn')?.addEventListener('click', () => {
            loadAllData();
        });

        // Clear drilldown button
        document.getElementById('clearDrilldownBtn')?.addEventListener('click', () => {
            clearDrilldown();
        });

        // Customer search
        let customerSearchTimeout = null;
        document.getElementById('analysisCustomerSearch')?.addEventListener('input', (e) => {
            clearTimeout(customerSearchTimeout);
            customerSearchTimeout = setTimeout(() => {
                loadCustomers(true, e.target.value);
            }, 300);
        });

        // Load more customers
        document.getElementById('loadMoreCustomersBtn')?.addEventListener('click', () => {
            loadCustomers(false);
        });

        // Load more instances
        document.getElementById('loadMoreInstancesAnalysisBtn')?.addEventListener('click', () => {
            loadInstances(false);
        });

        // Breadcrumb navigation
        document.getElementById('breadcrumbOrg')?.addEventListener('click', (e) => {
            e.preventDefault();
            clearDrilldown();
        });

        document.getElementById('breadcrumbCustomer')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.selectedCustomerId) {
                selectCustomer(state.selectedCustomerId, state.selectedCustomerName, true);
            }
        });

        // Chart type buttons
        document.querySelectorAll('#chartTypeButtons button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                document.querySelectorAll('#chartTypeButtons button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                updateExecutionsTimeChart(button.dataset.chartType);
            });
        });

        // Top volume/errors metric selectors
        document.getElementById('topVolumeMetric')?.addEventListener('change', () => {
            updateTopVolumeChart();
        });

        document.getElementById('topErrorsMetric')?.addEventListener('change', () => {
            updateTopErrorsChart();
        });
    }

    // Initialize date range based on default time range
    function initializeDateRange() {
        updateDateRange();
    }

    // Update date range based on selected time range
    function updateDateRange() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let fromDate = new Date(today);

        switch (state.timeRange) {
            case '1d':
                // Today only
                break;
            case '7d':
                fromDate.setDate(fromDate.getDate() - 6);
                break;
            case '30d':
                fromDate.setDate(fromDate.getDate() - 29);
                break;
            case '90d':
                fromDate.setDate(fromDate.getDate() - 89);
                break;
        }

        state.dateFrom = formatDateForInput(fromDate);
        state.dateTo = formatDateForInput(today);

        // Update input fields
        const fromInput = document.getElementById('analysisDateFrom');
        const toInput = document.getElementById('analysisDateTo');
        if (fromInput) fromInput.value = state.dateFrom;
        if (toInput) toInput.value = state.dateTo;
    }

    // Format date for input field (YYYY-MM-DD)
    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    // Format date for display
    function formatDateForDisplay(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Format number with commas
    function formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Number(num).toLocaleString();
    }

    // Format large numbers (K, M, B)
    function formatLargeNumber(num) {
        if (num === null || num === undefined) return '-';
        num = Number(num);
        if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    // Load all data
    async function loadAllData() {
        try {
            updateLastUpdated();

            // Load data in parallel where possible
            await Promise.all([
                loadDailyMetrics(),
                loadCustomers(true),
                loadRecentExecutions()
            ]);

        } catch (error) {
            console.error('Error loading analysis data:', error);
            showError('Failed to load analysis data: ' + error.message);
        }
    }

    // Load daily metrics
    async function loadDailyMetrics() {
        try {
            let metricsData;

            if (state.level === 'org') {
                // Fetch org-level metrics
                const result = await API.fetchOrgDailyUsageMetrics({
                    first: 100,
                    snapshotDateGte: state.dateFrom,
                    snapshotDateLte: state.dateTo
                });
                metricsData = result?.nodes || [];
            } else {
                // Fetch instance-level metrics (filtered by customer or instance)
                const options = {
                    first: 100,
                    snapshotDateGte: state.dateFrom,
                    snapshotDateLte: state.dateTo
                };

                if (state.level === 'instance' && state.selectedInstanceId) {
                    options.instanceId = state.selectedInstanceId;
                } else if (state.level === 'customer' && state.selectedCustomerId) {
                    options.customerId = state.selectedCustomerId;
                }

                const result = await API.fetchInstanceDailyUsageMetrics(options);

                // Aggregate by date if customer level (multiple instances)
                if (state.level === 'customer') {
                    metricsData = aggregateMetricsByDate(result?.nodes || []);
                } else {
                    metricsData = result?.nodes || [];
                }
            }

            state.data.dailyMetrics = metricsData;
            updateKPIs();
            updateExecutionsTimeChart();
            updateOutcomeChart();
            updateSpendChart();

        } catch (error) {
            console.error('Error loading daily metrics:', error);
        }
    }

    // Aggregate metrics by date (for customer-level view)
    function aggregateMetricsByDate(metrics) {
        const byDate = {};

        metrics.forEach(m => {
            const date = m.snapshotDate;
            if (!byDate[date]) {
                byDate[date] = {
                    snapshotDate: date,
                    successfulExecutionCount: 0,
                    failedExecutionCount: 0,
                    stepCount: 0,
                    spendMbSecs: 0
                };
            }
            byDate[date].successfulExecutionCount += Number(m.successfulExecutionCount) || 0;
            byDate[date].failedExecutionCount += Number(m.failedExecutionCount) || 0;
            byDate[date].stepCount += Number(m.stepCount) || 0;
            byDate[date].spendMbSecs += Number(m.spendMbSecs) || 0;
        });

        return Object.values(byDate).sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    }

    // Update KPI cards
    function updateKPIs() {
        const metrics = state.data.dailyMetrics;

        let totalSuccess = 0;
        let totalFailed = 0;
        let totalSteps = 0;
        let totalSpend = 0;

        metrics.forEach(m => {
            totalSuccess += Number(m.successfulExecutionCount) || 0;
            totalFailed += Number(m.failedExecutionCount) || 0;
            totalSteps += Number(m.stepCount) || 0;
            totalSpend += Number(m.spendMbSecs) || 0;
        });

        const total = totalSuccess + totalFailed;
        const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : 0;

        document.getElementById('kpiTotalExecutions').textContent = formatLargeNumber(total);
        document.getElementById('kpiSuccessful').textContent = formatLargeNumber(totalSuccess);
        document.getElementById('kpiFailed').textContent = formatLargeNumber(totalFailed);
        document.getElementById('kpiSuccessRate').textContent = successRate + '%';
        document.getElementById('kpiSuccessRateBar').style.width = successRate + '%';
        document.getElementById('kpiTotalSteps').textContent = formatLargeNumber(totalSteps);
    }

    // Update executions over time chart
    function updateExecutionsTimeChart(chartType = 'line') {
        const ctx = document.getElementById('executionsTimeChart');
        if (!ctx) return;

        const metrics = state.data.dailyMetrics;
        const labels = metrics.map(m => formatDateForDisplay(m.snapshotDate));
        const successData = metrics.map(m => Number(m.successfulExecutionCount) || 0);
        const failedData = metrics.map(m => Number(m.failedExecutionCount) || 0);

        // Destroy existing chart
        if (charts.executionsTime) {
            charts.executionsTime.destroy();
        }

        const isArea = chartType === 'area';
        const type = chartType === 'bar' ? 'bar' : 'line';

        charts.executionsTime = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Successful',
                        data: successData,
                        borderColor: chartColors.success,
                        backgroundColor: isArea ? chartColors.successBg : chartColors.success,
                        fill: isArea,
                        tension: 0.3
                    },
                    {
                        label: 'Failed',
                        data: failedData,
                        borderColor: chartColors.error,
                        backgroundColor: isArea ? chartColors.errorBg : chartColors.error,
                        fill: isArea,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatNumber(context.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatLargeNumber(value)
                        }
                    }
                }
            }
        });
    }

    // Update outcome donut chart
    function updateOutcomeChart() {
        const ctx = document.getElementById('outcomeChart');
        if (!ctx) return;

        const metrics = state.data.dailyMetrics;
        let totalSuccess = 0;
        let totalFailed = 0;

        metrics.forEach(m => {
            totalSuccess += Number(m.successfulExecutionCount) || 0;
            totalFailed += Number(m.failedExecutionCount) || 0;
        });

        if (charts.outcome) {
            charts.outcome.destroy();
        }

        charts.outcome = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Successful', 'Failed'],
                datasets: [{
                    data: [totalSuccess, totalFailed],
                    backgroundColor: [chartColors.success, chartColors.error],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${formatNumber(context.raw)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Update trigger type chart (from recent executions)
    function updateTriggerChart() {
        const ctx = document.getElementById('triggerChart');
        if (!ctx) return;

        const executions = state.data.recentExecutions;
        const triggerCounts = {};

        executions.forEach(e => {
            const trigger = e.invokeType || 'UNKNOWN';
            triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
        });

        const labels = Object.keys(triggerCounts).map(t => formatTriggerType(t));
        const data = Object.values(triggerCounts);

        if (charts.trigger) {
            charts.trigger.destroy();
        }

        charts.trigger = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: chartColors.palette.slice(0, labels.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
    }

    // Format trigger type for display
    function formatTriggerType(type) {
        const map = {
            'WEBHOOK': 'Webhook',
            'SCHEDULED': 'Scheduled',
            'INTEGRATION_FLOW_TEST': 'Flow Test',
            'INTEGRATION_ENDPOINT_TEST': 'Endpoint Test',
            'DEPLOY_FLOW': 'Deploy',
            'TEAR_DOWN_FLOW': 'Tear Down',
            'CROSS_FLOW': 'Cross Flow',
            'AI_AGENT': 'AI Agent',
            'WEBHOOK_SNAPSHOT': 'Webhook Snapshot'
        };
        return map[type] || type;
    }

    // Update spend chart
    function updateSpendChart() {
        const ctx = document.getElementById('spendChart');
        if (!ctx) return;

        const metrics = state.data.dailyMetrics;
        const labels = metrics.map(m => formatDateForDisplay(m.snapshotDate));
        const spendData = metrics.map(m => Number(m.spendMbSecs) || 0);

        if (charts.spend) {
            charts.spend.destroy();
        }

        charts.spend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'MB-secs',
                    data: spendData,
                    borderColor: chartColors.info,
                    backgroundColor: 'rgba(13, 202, 240, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Spend: ${formatNumber(context.raw)} MB-secs`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatLargeNumber(value)
                        }
                    }
                }
            }
        });
    }

    // Update top volume chart
    async function updateTopVolumeChart() {
        const ctx = document.getElementById('topVolumeChart');
        if (!ctx) return;

        const metric = document.getElementById('topVolumeMetric')?.value || 'customers';
        let data = await getTopPerformersData(metric, 'volume');

        if (charts.topVolume) {
            charts.topVolume.destroy();
        }

        charts.topVolume = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Executions',
                    data: data.values,
                    backgroundColor: chartColors.primary,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatLargeNumber(value)
                        }
                    }
                }
            }
        });
    }

    // Update top errors chart
    async function updateTopErrorsChart() {
        const ctx = document.getElementById('topErrorsChart');
        if (!ctx) return;

        const metric = document.getElementById('topErrorsMetric')?.value || 'customers';
        let data = await getTopPerformersData(metric, 'errors');

        if (charts.topErrors) {
            charts.topErrors.destroy();
        }

        charts.topErrors = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Errors',
                    data: data.values,
                    backgroundColor: chartColors.error,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatLargeNumber(value)
                        }
                    }
                }
            }
        });
    }

    // Get top performers data
    async function getTopPerformersData(metric, type) {
        const executions = state.data.recentExecutions;
        const counts = {};

        executions.forEach(e => {
            let key, name;

            switch (metric) {
                case 'customers':
                    key = e.instance?.customer?.id;
                    name = e.instance?.customer?.name || 'Unknown';
                    break;
                case 'instances':
                    key = e.instance?.id;
                    name = e.instance?.name || 'Unknown';
                    break;
                case 'flows':
                    key = e.flow?.id;
                    name = e.flow?.name || 'Unknown';
                    break;
            }

            if (!key) return;

            if (!counts[key]) {
                counts[key] = { name, total: 0, errors: 0 };
            }

            counts[key].total++;
            if (e.status === 'ERROR' || e.status === 'FAILED') {
                counts[key].errors++;
            }
        });

        // Sort and get top 10
        const sorted = Object.values(counts)
            .sort((a, b) => type === 'errors' ? b.errors - a.errors : b.total - a.total)
            .slice(0, 10);

        return {
            labels: sorted.map(s => truncateString(s.name, 20)),
            values: sorted.map(s => type === 'errors' ? s.errors : s.total)
        };
    }

    // Truncate string
    function truncateString(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    // Load customers
    async function loadCustomers(reset = false, searchTerm = null) {
        try {
            if (reset) {
                state.pagination.customers = { cursor: null, hasMore: true };
                state.data.customers = [];
            }

            if (!state.pagination.customers.hasMore && !reset) return;

            const result = await API.fetchCustomers({
                first: 30,
                after: state.pagination.customers.cursor,
                searchTerm: searchTerm || null
            });

            if (result) {
                if (reset) {
                    state.data.customers = result.nodes || [];
                } else {
                    state.data.customers = [...state.data.customers, ...(result.nodes || [])];
                }

                state.pagination.customers.cursor = result.pageInfo?.endCursor;
                state.pagination.customers.hasMore = result.pageInfo?.hasNextPage || false;

                renderCustomerList();

                document.getElementById('customerCountBadge').textContent = result.totalCount || state.data.customers.length;

                const loadMoreBtn = document.getElementById('customerLoadMore');
                if (state.pagination.customers.hasMore) {
                    loadMoreBtn?.classList.remove('d-none');
                } else {
                    loadMoreBtn?.classList.add('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading customers:', error);
        }
    }

    // Render customer list
    function renderCustomerList() {
        const container = document.getElementById('analysisCustomerList');
        if (!container) return;

        if (state.data.customers.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <small>No customers found</small>
                </div>
            `;
            return;
        }

        container.innerHTML = state.data.customers.map(customer => `
            <div class="analysis-list-item p-2 border-bottom cursor-pointer ${state.selectedCustomerId === customer.id ? 'active' : ''}"
                 data-customer-id="${customer.id}"
                 data-customer-name="${escapeHtml(customer.name)}">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="min-width-0">
                        <div class="fw-medium text-truncate" title="${escapeHtml(customer.name)}">${escapeHtml(customer.name)}</div>
                        ${customer.externalId ? `<small class="text-muted">${escapeHtml(customer.externalId)}</small>` : ''}
                    </div>
                    <i class="bi bi-chevron-right text-muted"></i>
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.analysis-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const customerId = item.dataset.customerId;
                const customerName = item.dataset.customerName;
                selectCustomer(customerId, customerName);
            });
        });
    }

    // Select customer for drill-down
    async function selectCustomer(customerId, customerName, keepInstance = false) {
        state.level = 'customer';
        state.selectedCustomerId = customerId;
        state.selectedCustomerName = customerName;

        if (!keepInstance) {
            state.selectedInstanceId = null;
            state.selectedInstanceName = null;
        }

        // Update UI
        updateBreadcrumb();
        renderCustomerList(); // Re-render to show active state

        // Show instance panel
        document.getElementById('instanceSelectionPanel')?.classList.remove('d-none');

        // Load instances for this customer
        await loadInstances(true);

        // Reload metrics for customer level
        await Promise.all([
            loadDailyMetrics(),
            loadRecentExecutions()
        ]);
    }

    // Load instances for selected customer
    async function loadInstances(reset = false) {
        if (!state.selectedCustomerId) return;

        try {
            if (reset) {
                state.pagination.instances = { cursor: null, hasMore: true };
                state.data.customerInstances = [];
            }

            if (!state.pagination.instances.hasMore && !reset) return;

            const result = await API.fetchInstancesByCustomer(state.selectedCustomerId, {
                first: 30,
                after: state.pagination.instances.cursor
            });

            if (result) {
                if (reset) {
                    state.data.customerInstances = result.nodes || [];
                } else {
                    state.data.customerInstances = [...state.data.customerInstances, ...(result.nodes || [])];
                }

                state.pagination.instances.cursor = result.pageInfo?.endCursor;
                state.pagination.instances.hasMore = result.pageInfo?.hasNextPage || false;

                renderInstanceList();

                document.getElementById('instanceCountBadge').textContent = result.totalCount || state.data.customerInstances.length;

                const loadMoreBtn = document.getElementById('instanceLoadMore');
                if (state.pagination.instances.hasMore) {
                    loadMoreBtn?.classList.remove('d-none');
                } else {
                    loadMoreBtn?.classList.add('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading instances:', error);
        }
    }

    // Render instance list
    function renderInstanceList() {
        const container = document.getElementById('analysisInstanceList');
        if (!container) return;

        if (state.data.customerInstances.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <small>No instances found</small>
                </div>
            `;
            return;
        }

        container.innerHTML = state.data.customerInstances.map(instance => `
            <div class="analysis-list-item p-2 border-bottom cursor-pointer ${state.selectedInstanceId === instance.id ? 'active' : ''}"
                 data-instance-id="${instance.id}"
                 data-instance-name="${escapeHtml(instance.name)}">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="min-width-0">
                        <div class="fw-medium text-truncate" title="${escapeHtml(instance.name)}">${escapeHtml(instance.name)}</div>
                        <small class="text-muted">${escapeHtml(instance.integration?.name || '')}</small>
                    </div>
                    <span class="badge ${instance.enabled ? 'bg-success' : 'bg-secondary'}">${instance.enabled ? 'Active' : 'Disabled'}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.analysis-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const instanceId = item.dataset.instanceId;
                const instanceName = item.dataset.instanceName;
                selectInstance(instanceId, instanceName);
            });
        });
    }

    // Select instance for drill-down
    async function selectInstance(instanceId, instanceName) {
        state.level = 'instance';
        state.selectedInstanceId = instanceId;
        state.selectedInstanceName = instanceName;

        // Update UI
        updateBreadcrumb();
        renderInstanceList(); // Re-render to show active state

        // Reload metrics for instance level
        await Promise.all([
            loadDailyMetrics(),
            loadRecentExecutions()
        ]);
    }

    // Clear drilldown and return to org level
    function clearDrilldown() {
        state.level = 'org';
        state.selectedCustomerId = null;
        state.selectedCustomerName = null;
        state.selectedInstanceId = null;
        state.selectedInstanceName = null;

        // Update UI
        updateBreadcrumb();
        document.getElementById('instanceSelectionPanel')?.classList.add('d-none');
        renderCustomerList();

        // Reload org-level data
        loadAllData();
    }

    // Update breadcrumb navigation
    function updateBreadcrumb() {
        const customerItem = document.getElementById('breadcrumbCustomerItem');
        const customerLink = document.getElementById('breadcrumbCustomer');
        const instanceItem = document.getElementById('breadcrumbInstanceItem');
        const instanceSpan = document.getElementById('breadcrumbInstance');

        // Reset
        customerItem?.classList.add('d-none');
        instanceItem?.classList.add('d-none');

        if (state.selectedCustomerId) {
            customerItem?.classList.remove('d-none');
            if (customerLink) customerLink.textContent = state.selectedCustomerName || 'Customer';

            if (state.selectedInstanceId) {
                instanceItem?.classList.remove('d-none');
                if (instanceSpan) instanceSpan.textContent = state.selectedInstanceName || 'Instance';
            }
        }
    }

    // Load recent executions
    async function loadRecentExecutions() {
        try {
            const options = {
                first: 100,
                startedAtGte: state.dateFrom + 'T00:00:00Z',
                startedAtLte: state.dateTo + 'T23:59:59Z'
            };

            if (state.selectedInstanceId) {
                options.instanceId = state.selectedInstanceId;
            } else if (state.selectedCustomerId) {
                options.customerId = state.selectedCustomerId;
            }

            const result = await API.fetchRecentExecutionsAnalysis(options);
            state.data.recentExecutions = result?.nodes || [];

            renderRecentExecutions();
            updateTriggerChart();
            updateTopVolumeChart();
            updateTopErrorsChart();

            document.getElementById('recentExecutionsCount').textContent = state.data.recentExecutions.length;

        } catch (error) {
            console.error('Error loading recent executions:', error);
        }
    }

    // Render recent executions list
    function renderRecentExecutions() {
        const container = document.getElementById('recentExecutionsList');
        if (!container) return;

        const executions = state.data.recentExecutions.slice(0, 50); // Show last 50

        if (executions.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-clock-history display-6 mb-2 d-block"></i>
                    <small>No executions in this time range</small>
                </div>
            `;
            return;
        }

        container.innerHTML = executions.map(exec => {
            const startTime = new Date(exec.startedAt);
            const statusClass = exec.status === 'SUCCEEDED' || exec.status === 'SUCCESS' ? 'success' :
                               exec.status === 'FAILED' || exec.status === 'ERROR' ? 'danger' : 'secondary';
            const statusIcon = exec.status === 'SUCCEEDED' || exec.status === 'SUCCESS' ? 'check-circle' :
                              exec.status === 'FAILED' || exec.status === 'ERROR' ? 'x-circle' : 'hourglass-split';

            return `
                <div class="recent-execution-item p-2 border-bottom d-flex align-items-center">
                    <div class="me-2">
                        <i class="bi bi-${statusIcon}-fill text-${statusClass}"></i>
                    </div>
                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex align-items-center">
                            <span class="fw-medium text-truncate me-2" title="${escapeHtml(exec.flow?.name || '')}">${escapeHtml(exec.flow?.name || 'Unknown Flow')}</span>
                            <span class="badge bg-light text-dark" style="font-size: 0.65rem;">${formatTriggerType(exec.invokeType)}</span>
                        </div>
                        <small class="text-muted">
                            ${escapeHtml(exec.instance?.customer?.name || '')} / ${escapeHtml(exec.instance?.name || '')}
                        </small>
                    </div>
                    <div class="text-end ms-2">
                        <small class="text-muted d-block">${startTime.toLocaleTimeString()}</small>
                        <small class="text-muted">${startTime.toLocaleDateString()}</small>
                    </div>
                    <a href="#execution?executionId=${exec.id}" class="btn btn-sm btn-outline-primary ms-2" title="View details">
                        <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                </div>
            `;
        }).join('');
    }

    // Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    // Update last updated text
    function updateLastUpdated() {
        state.lastUpdated = new Date();
        const text = document.getElementById('lastUpdatedText');
        if (text) text.textContent = 'Updated just now';
    }

    // Start auto-refresh
    function startAutoRefresh() {
        stopAutoRefresh();
        state.refreshTimer = setInterval(() => {
            loadAllData();
            updateLastUpdatedTime();
        }, state.refreshInterval);
    }

    // Stop auto-refresh
    function stopAutoRefresh() {
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    // Update the "last updated" time display
    function updateLastUpdatedTime() {
        if (!state.lastUpdated) return;

        const seconds = Math.floor((Date.now() - state.lastUpdated.getTime()) / 1000);
        const text = document.getElementById('lastUpdatedText');

        if (text) {
            if (seconds < 60) {
                text.textContent = 'Updated just now';
            } else if (seconds < 3600) {
                const mins = Math.floor(seconds / 60);
                text.textContent = `Updated ${mins}m ago`;
            } else {
                text.textContent = `Updated ${state.lastUpdated.toLocaleTimeString()}`;
            }
        }
    }

    // Show error message
    function showError(message) {
        console.error(message);
        // Could add a toast notification here
    }

    // Route handler
    function onRoute(params) {
        init();

        // Parse URL params for deep linking
        if (params.customerId) {
            selectCustomer(params.customerId, params.customerName || null);
            if (params.instanceId) {
                selectInstance(params.instanceId, params.instanceName || null);
            }
        } else {
            loadAllData();
        }

        // Start auto-refresh if enabled
        if (state.autoRefresh) {
            startAutoRefresh();
        }
    }

    // Cleanup when leaving page
    function cleanup() {
        stopAutoRefresh();
    }

    // Public API
    return {
        init,
        onRoute,
        cleanup,
        loadAllData
    };
})();

window.AnalysisPage = AnalysisPage;
