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
        chartType: 'line',
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
            recentExecutions: [],
            allInstanceMetrics: [],  // All instances' daily metrics for top performers
            aggregatedByCustomer: [], // Customer-level aggregated metrics
            aggregatedByInstance: []  // Instance-level aggregated metrics
        },
        // Loading states for progressive fetch
        instanceMetricsLoading: false,
        instanceMetricsTotal: 0,
        instanceMetricsLoaded: 0,
        // Pagination
        pagination: {
            customers: { cursor: null, hasMore: true },
            instances: { cursor: null, hasMore: true },
            executions: { cursor: null, hasMore: true, totalCount: 0 }
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

        // Register cleanup on navigation away
        Router.beforeNavigate((path) => {
            if (path !== 'analysis') {
                cleanup();
            }
            return true; // Allow navigation
        });

        state.initialized = true;
    }

    // Set up event listeners
    function setupEventListeners() {
        // Time range buttons
        document.querySelectorAll('#timeRangeButtons button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                document.querySelectorAll('#timeRangeButtons button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                state.timeRange = button.dataset.range;
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
                state.chartType = button.dataset.chartType;
                updateExecutionsTimeChart();
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

            // Load core data in parallel
            await Promise.all([
                loadDailyMetrics(),
                loadCustomers(true),
                loadRecentExecutions()
            ]);

            // Load instance metrics separately (can be large, progressive loading)
            // This is non-blocking - charts will update when data arrives
            loadAllInstanceMetrics();

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
            } else if (state.level === 'instance' && state.selectedInstanceId) {
                // Fetch instance-level metrics for specific instance
                const result = await API.fetchInstanceDailyUsageMetrics({
                    first: 100,
                    instanceId: state.selectedInstanceId,
                    snapshotDateGte: state.dateFrom,
                    snapshotDateLte: state.dateTo
                });
                metricsData = result?.nodes || [];
            } else if (state.level === 'customer' && state.selectedCustomerId) {
                // Customer level: fetch metrics for each instance belonging to the customer
                // Use the already-loaded customer instances list
                const instances = state.data.customerInstances;
                if (instances.length > 0) {
                    // Fetch metrics for each instance in parallel (max 10 concurrent)
                    const allMetrics = [];
                    for (let i = 0; i < instances.length; i += 10) {
                        const batch = instances.slice(i, i + 10);
                        const results = await Promise.all(
                            batch.map(inst => API.fetchInstanceDailyUsageMetrics({
                                first: 100,
                                instanceId: inst.id,
                                snapshotDateGte: state.dateFrom,
                                snapshotDateLte: state.dateTo
                            }))
                        );
                        results.forEach(r => allMetrics.push(...(r?.nodes || [])));
                    }
                    metricsData = aggregateMetricsByDate(allMetrics);
                } else {
                    metricsData = [];
                }
            } else {
                metricsData = [];
            }

            state.data.dailyMetrics = metricsData;
            updateKPIs();
            updateExecutionsTimeChart();
            updateOutcomeChart();
            updateSpendChart();

        } catch (error) {
            console.error('Error loading daily metrics:', error);
            showError('Failed to load metrics: ' + error.message);
        }
    }

    // Calculate totals from daily metrics (shared helper)
    function calculateTotals(metrics) {
        let totalSuccess = 0, totalFailed = 0, totalSteps = 0, totalSpend = 0;
        metrics.forEach(m => {
            totalSuccess += Number(m.successfulExecutionCount) || 0;
            totalFailed += Number(m.failedExecutionCount) || 0;
            totalSteps += Number(m.stepCount) || 0;
            totalSpend += Number(m.spendMbSecs) || 0;
        });
        return { totalSuccess, totalFailed, totalSteps, totalSpend, total: totalSuccess + totalFailed };
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

    // Load all instances' daily metrics for top performers (with pagination)
    async function loadAllInstanceMetrics() {
        // Only load at org level - customer/instance levels use filtered data
        if (state.level !== 'org') {
            state.data.allInstanceMetrics = [];
            state.data.aggregatedByCustomer = [];
            state.data.aggregatedByInstance = [];
            return;
        }

        try {
            state.instanceMetricsLoading = true;
            state.instanceMetricsLoaded = 0;
            state.instanceMetricsTotal = 0;
            updateInstanceMetricsLoadingUI();

            let lastProgress = null;
            const generator = API.fetchAllInstancesDailyUsageMetricsFull({
                batchSize: 500,
                snapshotDateGte: state.dateFrom,
                snapshotDateLte: state.dateTo
            });

            for await (const progress of generator) {
                state.instanceMetricsLoaded = progress.loadedCount;
                state.instanceMetricsTotal = progress.totalCount;
                lastProgress = progress;
                updateInstanceMetricsLoadingUI();

                // Update aggregations progressively for better UX
                if (progress.metrics && progress.metrics.length > 0) {
                    state.data.allInstanceMetrics = progress.metrics;
                    state.data.aggregatedByCustomer = aggregateMetricsByCustomer(progress.metrics);
                    state.data.aggregatedByInstance = aggregateMetricsByInstance(progress.metrics);

                    // Update charts with partial data
                    updateTopVolumeChart();
                    updateTopErrorsChart();
                }
            }

            // Ensure final state is set
            if (lastProgress && lastProgress.metrics) {
                state.data.allInstanceMetrics = lastProgress.metrics;
                state.data.aggregatedByCustomer = aggregateMetricsByCustomer(lastProgress.metrics);
                state.data.aggregatedByInstance = aggregateMetricsByInstance(lastProgress.metrics);
            }

            state.instanceMetricsLoading = false;
            updateInstanceMetricsLoadingUI();

            // Final chart update
            updateTopVolumeChart();
            updateTopErrorsChart();

        } catch (error) {
            console.error('Error loading all instance metrics:', error);
            state.instanceMetricsLoading = false;
            updateInstanceMetricsLoadingUI();
        }
    }

    // Aggregate metrics by customer (sum all instances per customer)
    function aggregateMetricsByCustomer(metrics) {
        const byCustomer = {};

        metrics.forEach(m => {
            const customerId = m.instance?.customer?.id;
            const customerName = m.instance?.customer?.name || 'Unknown';
            if (!customerId) return;

            if (!byCustomer[customerId]) {
                byCustomer[customerId] = {
                    id: customerId,
                    name: customerName,
                    successfulExecutionCount: 0,
                    failedExecutionCount: 0,
                    totalExecutionCount: 0,
                    stepCount: 0,
                    spendMbSecs: 0
                };
            }
            byCustomer[customerId].successfulExecutionCount += Number(m.successfulExecutionCount) || 0;
            byCustomer[customerId].failedExecutionCount += Number(m.failedExecutionCount) || 0;
            byCustomer[customerId].totalExecutionCount += (Number(m.successfulExecutionCount) || 0) + (Number(m.failedExecutionCount) || 0);
            byCustomer[customerId].stepCount += Number(m.stepCount) || 0;
            byCustomer[customerId].spendMbSecs += Number(m.spendMbSecs) || 0;
        });

        return Object.values(byCustomer);
    }

    // Aggregate metrics by instance (sum all days per instance)
    function aggregateMetricsByInstance(metrics) {
        const byInstance = {};

        metrics.forEach(m => {
            const instanceId = m.instance?.id;
            const instanceName = m.instance?.name || 'Unknown';
            const customerName = m.instance?.customer?.name || 'Unknown';
            const integrationName = m.instance?.integration?.name || '';
            if (!instanceId) return;

            if (!byInstance[instanceId]) {
                byInstance[instanceId] = {
                    id: instanceId,
                    name: instanceName,
                    customerName: customerName,
                    integrationName: integrationName,
                    successfulExecutionCount: 0,
                    failedExecutionCount: 0,
                    totalExecutionCount: 0,
                    stepCount: 0,
                    spendMbSecs: 0
                };
            }
            byInstance[instanceId].successfulExecutionCount += Number(m.successfulExecutionCount) || 0;
            byInstance[instanceId].failedExecutionCount += Number(m.failedExecutionCount) || 0;
            byInstance[instanceId].totalExecutionCount += (Number(m.successfulExecutionCount) || 0) + (Number(m.failedExecutionCount) || 0);
            byInstance[instanceId].stepCount += Number(m.stepCount) || 0;
            byInstance[instanceId].spendMbSecs += Number(m.spendMbSecs) || 0;
        });

        return Object.values(byInstance);
    }

    // Update loading UI for instance metrics
    function updateInstanceMetricsLoadingUI() {
        const loadingIndicator = document.getElementById('instanceMetricsLoading');
        if (!loadingIndicator) return;

        if (state.instanceMetricsLoading) {
            loadingIndicator.classList.remove('d-none');
            loadingIndicator.innerHTML = `
                <small class="text-muted">
                    <span class="spinner-border spinner-border-sm me-1"></span>
                    Loading metrics: ${formatNumber(state.instanceMetricsLoaded)} / ${formatNumber(state.instanceMetricsTotal)}
                </small>
            `;
        } else {
            loadingIndicator.classList.add('d-none');
        }
    }

    // Update KPI cards
    function updateKPIs() {
        const { totalSuccess, totalFailed, totalSteps, total } = calculateTotals(state.data.dailyMetrics);
        const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : 0;

        document.getElementById('kpiTotalExecutions').textContent = formatLargeNumber(total);
        document.getElementById('kpiSuccessful').textContent = formatLargeNumber(totalSuccess);
        document.getElementById('kpiFailed').textContent = formatLargeNumber(totalFailed);
        document.getElementById('kpiSuccessRate').textContent = successRate + '%';
        document.getElementById('kpiSuccessRateBar').style.width = successRate + '%';
        document.getElementById('kpiTotalSteps').textContent = formatLargeNumber(totalSteps);
    }

    // Update executions over time chart
    function updateExecutionsTimeChart() {
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

        const isArea = state.chartType === 'area';
        const type = state.chartType === 'bar' ? 'bar' : 'line';

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

        const { totalSuccess, totalFailed } = calculateTotals(state.data.dailyMetrics);

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
                                const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : '0.0';
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
    function updateTopVolumeChart() {
        const ctx = document.getElementById('topVolumeChart');
        if (!ctx) return;

        const metric = document.getElementById('topVolumeMetric')?.value || 'customers';
        const data = getTopPerformersData(metric, 'volume');

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
    function updateTopErrorsChart() {
        const ctx = document.getElementById('topErrorsChart');
        if (!ctx) return;

        const metric = document.getElementById('topErrorsMetric')?.value || 'customers';
        const data = getTopPerformersData(metric, 'errors');

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

    // Get top performers data - uses aggregated metrics for accurate counts
    function getTopPerformersData(metric, type) {
        // For org level, use pre-aggregated data from instanceDailyUsageMetrics
        if (state.level === 'org' && (metric === 'customers' || metric === 'instances')) {
            return getTopPerformersFromAggregatedData(metric, type);
        }

        // For customer/instance level or flows, fall back to execution sampling
        return getTopPerformersFromExecutions(metric, type);
    }

    // Get top performers from pre-aggregated instance metrics (accurate, full data)
    function getTopPerformersFromAggregatedData(metric, type) {
        let data = [];

        if (metric === 'customers') {
            data = state.data.aggregatedByCustomer || [];
        } else if (metric === 'instances') {
            data = state.data.aggregatedByInstance || [];
        }

        if (data.length === 0) {
            return { labels: [], values: [], isComplete: false };
        }

        // Sort by volume or errors
        const sorted = [...data].sort((a, b) => {
            if (type === 'errors') {
                return b.failedExecutionCount - a.failedExecutionCount;
            }
            return b.totalExecutionCount - a.totalExecutionCount;
        }).slice(0, 10);

        return {
            labels: sorted.map(s => truncateString(s.name, 20)),
            values: sorted.map(s => type === 'errors' ? s.failedExecutionCount : s.totalExecutionCount),
            isComplete: true,
            totalRecords: data.length
        };
    }

    // Get top performers from execution samples (for flows or drill-down levels)
    function getTopPerformersFromExecutions(metric, type) {
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
            values: sorted.map(s => type === 'errors' ? s.errors : s.total),
            isComplete: false,
            sampleSize: executions.length
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
                searchTerm: searchTerm?.trim() || null
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
            showError('Failed to load customers: ' + error.message);
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
            showError('Failed to load instances: ' + error.message);
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

    // Load recent executions with lazy loading support
    async function loadRecentExecutions(reset = true, loadMore = false) {
        try {
            // Reset pagination state if requested
            if (reset) {
                state.pagination.executions = { cursor: null, hasMore: true, totalCount: 0 };
                state.data.recentExecutions = [];
            }

            // Don't load more if no more data
            if (loadMore && !state.pagination.executions?.hasMore) return;

            const options = {
                first: 500,  // Increased from 100 for better trigger distribution sampling
                startedAtGte: state.dateFrom + 'T00:00:00Z',
                startedAtLte: state.dateTo + 'T23:59:59Z'
            };

            // Add cursor for pagination
            if (loadMore && state.pagination.executions?.cursor) {
                options.after = state.pagination.executions.cursor;
            }

            if (state.selectedInstanceId) {
                options.instanceId = state.selectedInstanceId;
            } else if (state.selectedCustomerId) {
                // Filter by customer if at customer level (API supports instance_Customer filter)
                options.customerId = state.selectedCustomerId;
            }

            const result = await API.fetchRecentExecutionsAnalysis(options);
            const newExecutions = result?.nodes || [];

            // Append or replace executions
            if (loadMore) {
                state.data.recentExecutions = [...state.data.recentExecutions, ...newExecutions];
            } else {
                state.data.recentExecutions = newExecutions;
            }

            // Update pagination state
            state.pagination.executions = {
                cursor: result?.pageInfo?.endCursor || null,
                hasMore: result?.pageInfo?.hasNextPage || false,
                totalCount: result?.totalCount || state.data.recentExecutions.length
            };

            renderRecentExecutions();
            updateTriggerChart();

            // Only update top charts from executions if not at org level (org level uses aggregated data)
            if (state.level !== 'org') {
                updateTopVolumeChart();
                updateTopErrorsChart();
            }

            // Update count badge to show loaded vs total
            updateRecentExecutionsCount();

        } catch (error) {
            console.error('Error loading recent executions:', error);
            showError('Failed to load executions: ' + error.message);
        }
    }

    // Update recent executions count badge
    function updateRecentExecutionsCount() {
        const countEl = document.getElementById('recentExecutionsCount');
        const totalCount = state.pagination.executions?.totalCount || state.data.recentExecutions.length;
        const loadedCount = state.data.recentExecutions.length;

        if (countEl) {
            if (totalCount > loadedCount) {
                countEl.textContent = `${formatNumber(loadedCount)} / ${formatNumber(totalCount)}`;
            } else {
                countEl.textContent = formatNumber(loadedCount);
            }
        }
    }

    // Render recent executions list with lazy loading
    function renderRecentExecutions() {
        const container = document.getElementById('recentExecutionsList');
        if (!container) return;

        const displayLimit = 100; // Increased from 50
        const executions = state.data.recentExecutions.slice(0, displayLimit);
        const hasMoreToDisplay = state.data.recentExecutions.length > displayLimit;
        const hasMoreToLoad = state.pagination.executions?.hasMore || false;

        if (executions.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-clock-history display-6 mb-2 d-block"></i>
                    <small>No executions in this time range</small>
                </div>
            `;
            return;
        }

        let html = executions.map(exec => {
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

        // Add "Load More" button if there's more data
        if (hasMoreToLoad) {
            const totalCount = state.pagination.executions?.totalCount || 0;
            const loadedCount = state.data.recentExecutions.length;
            html += `
                <div class="text-center py-3 border-top">
                    <button id="loadMoreExecutionsBtn" class="btn btn-outline-secondary btn-sm">
                        <i class="bi bi-arrow-down-circle me-1"></i>
                        Load More (${formatNumber(loadedCount)} of ${formatNumber(totalCount)})
                    </button>
                </div>
            `;
        } else if (hasMoreToDisplay) {
            // All data loaded but showing limited - just informational
            html += `
                <div class="text-center py-2 text-muted">
                    <small>Showing ${displayLimit} of ${state.data.recentExecutions.length} loaded executions</small>
                </div>
            `;
        }

        container.innerHTML = html;

        // Attach event listener for Load More button
        const loadMoreBtn = document.getElementById('loadMoreExecutionsBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', async () => {
                loadMoreBtn.disabled = true;
                loadMoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading...';
                await loadRecentExecutions(false, true);
            });
        }
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
            loadAllData(); // This already calls updateLastUpdated()
        }, state.refreshInterval);
    }

    // Stop auto-refresh
    function stopAutoRefresh() {
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    // Show error message with toast
    function showError(message) {
        console.error(message);
        // Create toast container if not exists
        let container = document.getElementById('analysisToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'analysisToastContainer';
            container.className = 'position-fixed bottom-0 end-0 p-3';
            container.style.zIndex = '1050';
            document.body.appendChild(container);
        }
        // Create toast with escaped message to prevent XSS
        const toastId = 'toast-' + Date.now();
        container.innerHTML = `
            <div id="${toastId}" class="toast align-items-center text-bg-danger border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(message)}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        const toast = new bootstrap.Toast(document.getElementById(toastId), { delay: 5000 });
        toast.show();
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
