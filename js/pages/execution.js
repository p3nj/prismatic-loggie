// Execution Page Handler
const ExecutionPage = (() => {
    let initialized = false;
    let currentExecutionId = null;
    let stepResultsCache = new Map(); // Cache for step results
    let linkedExecutionsCache = null;

    // Live polling state
    // Prismatic API limit: 20 req/s. Built-in rate limiter: 4 req/s (250ms).
    // Polling at 3s intervals uses ~0.7 req/s average - well within limits.
    const POLL_INTERVAL = 3000; // 3 seconds - sweet spot for live feel without API spam
    const ACTIVE_STATUSES = ['RUNNING', 'IN_PROGRESS', 'PENDING', 'QUEUED'];
    let pollTimer = null;
    let isPollInFlight = false;
    let loadedLogTotalCount = 0;
    let allLoadedLogEdges = [];
    let lastExecutionStatus = null;
    let liveLogInsertCount = 0;
    let lastStepResults = null;

    function isActiveStatus(status) {
        return ACTIVE_STATUSES.includes(status?.toUpperCase());
    }

    // Initialize the execution page
    function init() {
        if (initialized) return;

        setupEventListeners();
        initialized = true;
    }

    // Setup event listeners
    function setupEventListeners() {
        // Load button
        const loadBtn = document.getElementById('loadButton');
        if (loadBtn) {
            loadBtn.addEventListener('click', fetchResults);
        }

        // Enter key on execution ID input
        const executionIdInput = document.getElementById('executionId');
        if (executionIdInput) {
            executionIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    fetchResults();
                }
            });
        }
    }

    // ==========================================
    // Live Polling
    // ==========================================

    function startPolling(executionId) {
        stopPolling();
        isPollInFlight = false;
        showLiveIndicator();
        pollTimer = setInterval(() => pollExecution(executionId), POLL_INTERVAL);
        console.log(`Live polling started for execution ${executionId} (${POLL_INTERVAL}ms interval)`);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
            console.log('Live polling stopped');
        }
        isPollInFlight = false;
        hideLiveIndicator();
    }

    function showLiveIndicator() {
        let liveEl = document.getElementById('execution-live-indicator');
        if (!liveEl) {
            liveEl = document.createElement('div');
            liveEl.id = 'execution-live-indicator';
            liveEl.className = 'live-indicator mb-2';
            liveEl.innerHTML = '<span class="live-dot"></span> <span class="live-text">LIVE</span> <small class="text-muted ms-1">Auto-updating every 3s</small>';
            const details = document.getElementById('execution-details');
            if (details) {
                details.parentNode.insertBefore(liveEl, details);
            }
        }
    }

    function hideLiveIndicator() {
        const liveEl = document.getElementById('execution-live-indicator');
        if (liveEl) liveEl.remove();
    }

    async function pollExecution(executionId) {
        // Guard: skip if another poll is in flight or execution changed
        if (isPollInFlight || executionId !== currentExecutionId) return;
        isPollInFlight = true;

        try {
            // 1. Fetch metadata to check status (1 API call)
            const metadata = await API.fetchExecutionResults(executionId);
            if (!metadata) { isPollInFlight = false; return; }

            // 2. Update status badge if changed
            if (metadata.status !== lastExecutionStatus) {
                UI.updateExecutionStatusBadge(metadata.status);
                lastExecutionStatus = metadata.status;
            }

            // 3. Check for new logs (1 API call - small payload with first:1)
            const logCheck = await API.fetchExecutionLogs(executionId, { first: 1 });
            if (logCheck && logCheck.totalCount > loadedLogTotalCount) {
                const newCount = logCheck.totalCount - loadedLogTotalCount;
                // Fetch only the new logs (1 API call)
                // DESC order means the first N results are the newest N logs
                const newLogsData = await API.fetchExecutionLogs(executionId, { first: newCount });
                if (newLogsData && newLogsData.edges && newLogsData.edges.length > 0) {
                    // Prepend new logs to UI (newest at top)
                    UI.prependNewLogs(newLogsData.edges, liveLogInsertCount);
                    liveLogInsertCount += newLogsData.edges.length;

                    // Update tracking arrays
                    allLoadedLogEdges = [...newLogsData.edges, ...allLoadedLogEdges];
                    loadedLogTotalCount = logCheck.totalCount;

                    // Update step navigation with all logs
                    UI.updateStepNavigationFromLogs(allLoadedLogEdges);
                }
            }

            // 4. If execution completed, stop polling and do final refresh
            if (!isActiveStatus(metadata.status)) {
                console.log(`Execution ${executionId} completed with status: ${metadata.status}`);
                stopPolling();

                // Re-fetch step results for the now-completed execution
                try {
                    const stepResults = await fetchAllStepResultsWithProgress(executionId, metadata.startedAt);
                    lastStepResults = stepResults;
                    if (allLoadedLogEdges.length > 0 && stepResults && stepResults.length > 0) {
                        UI.updateStepNavigationCombined(allLoadedLogEdges, stepResults, executionId);
                    }
                } catch (e) {
                    console.error('Error refreshing step results after completion:', e);
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
            // Don't stop polling on transient errors - will retry next interval
        } finally {
            isPollInFlight = false;
        }
    }

    // ==========================================
    // Core Execution Loading
    // ==========================================

    // Fetch and display execution results with step outputs and logs
    async function fetchResults() {
        const executionId = getExecutionId();

        if (!executionId) {
            UI.showError('Please enter an Execution ID');
            return;
        }

        if (!API.isAuthenticated()) {
            UI.showError('Please set up your API token first');
            setTimeout(() => Router.navigate('auth'), 2000);
            return;
        }

        // Stop any existing polling before loading new execution
        stopPolling();

        // Clear caches when loading new execution
        if (currentExecutionId !== executionId) {
            stepResultsCache.clear();
            linkedExecutionsCache = null;
            currentExecutionId = executionId;
        }

        // Reset live polling state
        loadedLogTotalCount = 0;
        allLoadedLogEdges = [];
        lastExecutionStatus = null;
        liveLogInsertCount = 0;
        lastStepResults = null;

        // Update URL to include execution ID for sharing/navigation
        const currentHash = window.location.hash;
        const baseHash = currentHash.split('?')[0] || '#execution';
        const newUrl = `${baseHash}?executionId=${executionId}`;
        if (window.location.hash + window.location.search !== newUrl) {
            window.history.replaceState({ executionId }, '', newUrl);
        }

        UI.showLoading();

        try {
            // First fetch execution metadata
            const executionMetadata = await API.fetchExecutionResults(executionId);

            if (!executionMetadata) {
                UI.showError('Execution not found');
                return;
            }

            lastExecutionStatus = executionMetadata.status;

            // Initialize the results container with metadata
            UI.initResultsContainer(executionMetadata);

            // Fetch linked executions and step results in parallel with logs
            const stepResultsPromise = fetchAllStepResultsWithProgress(executionId, executionMetadata.startedAt);
            const linkedExecutionsPromise = fetchLinkedExecutionsIfNeeded(executionId, executionMetadata.startedAt);

            // Start fetching logs
            let previousLogCount = 0;
            let allLogEdges = [];
            const logGenerator = API.fetchAllExecutionLogs(executionId, 100);

            // Process logs as they come in
            for await (const progress of logGenerator) {
                // Show progress indicator
                UI.showLoadingProgress(progress.loadedCount, progress.totalCount, progress.isComplete);

                // Render only the new logs (incremental)
                if (progress.logs.length > previousLogCount) {
                    const newLogs = progress.logs.slice(previousLogCount);
                    UI.renderLogsIncremental(newLogs, previousLogCount);
                    previousLogCount = progress.logs.length;
                }

                // Keep track of all log edges for step navigation
                allLogEdges = progress.logs;

                // Update step navigation incrementally (for smooth UX)
                if (allLogEdges.length > 0) {
                    UI.updateStepNavigationFromLogs(allLogEdges);
                }

                // Handle completion
                if (progress.isComplete) {
                    if (progress.loadedCount === 0) {
                        const resultsDiv = document.getElementById('results');
                        if (resultsDiv) {
                            resultsDiv.innerHTML = '<div class="col-12">No logs found for this execution</div>';
                        }
                        UI.hideLoadingProgress();
                    }
                    // Track loaded log count for live polling
                    loadedLogTotalCount = progress.totalCount;
                }
            }

            // Store all loaded logs for live polling reference
            allLoadedLogEdges = allLogEdges;

            // Wait for step results and linked executions to complete
            const [stepResults, linkedExecutions] = await Promise.all([
                stepResultsPromise,
                linkedExecutionsPromise
            ]);

            lastStepResults = stepResults;

            // Final update with step results for eye icons (output viewing)
            if (allLogEdges.length > 0 && stepResults && stepResults.length > 0) {
                UI.updateStepNavigationCombined(allLogEdges, stepResults, executionId);
            }

            // Show linked executions if any
            if (linkedExecutions && linkedExecutions.length > 0) {
                UI.renderLinkedExecutions(linkedExecutions, executionId, executionMetadata);
            }

            // Start live polling if execution is still active
            if (isActiveStatus(executionMetadata.status)) {
                startPolling(executionId);
            }

        } catch (error) {
            UI.showError(error.message);
        }
    }

    // Fetch all step results with progress updates
    async function fetchAllStepResultsWithProgress(executionId, startedAt) {
        const allSteps = [];

        try {
            const stepGenerator = API.fetchAllStepResults(executionId, {
                batchSize: 100,
                startedAt: startedAt
            });

            for await (const progress of stepGenerator) {
                // Could show step loading progress here if needed
                if (progress.isComplete) {
                    return progress.steps;
                }
            }

            return allSteps;
        } catch (error) {
            console.error('Error fetching step results:', error);
            return [];
        }
    }

    // Fetch linked executions if needed
    async function fetchLinkedExecutionsIfNeeded(executionId, startedAt) {
        if (linkedExecutionsCache) {
            return linkedExecutionsCache;
        }

        try {
            const linkedExecutions = await API.fetchLinkedExecutions(executionId, startedAt);
            linkedExecutionsCache = linkedExecutions;
            return linkedExecutions;
        } catch (error) {
            console.error('Error fetching linked executions:', error);
            return [];
        }
    }

    // Get execution ID from input
    function getExecutionId() {
        const input = document.getElementById('executionId');
        const id = input ? input.value.trim() : '';
        if (id) {
            localStorage.setItem('lastExecutionId', id);
        }
        return id;
    }

    // Set execution ID in input
    function setExecutionId(id) {
        const input = document.getElementById('executionId');
        if (input && id) {
            input.value = id;
        }
    }

    // Show welcome message
    function showWelcome() {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        resultsDiv.innerHTML = `
            <div class="col-12 text-left p-5">
                <div class="log-card">
                    <h2>Execution Log Viewer</h2>
                    <p class="lead">Enter an Execution ID and click "Load" to view execution logs.</p>
                    <hr>
                    <p>This tool helps you analyze and navigate through Prismatic execution logs with features like:</p>
                    <ul>
                        <li>Step-by-step navigation with actual step outputs</li>
                        <li>Loop iterations with expandable step details</li>
                        <li>JSON data auto-detection and formatted viewing</li>
                        <li>Linked execution chain view for long-running flows</li>
                        <li>Live updates for in-progress executions</li>
                        <li>Dark/light theme support</li>
                    </ul>
                    <p class="text-muted">
                        <i class="bi bi-lightbulb me-1"></i>
                        Tip: You can also browse executions by instance from the
                        <a href="#instances" class="text-decoration-none">Instances</a> page.
                    </p>
                </div>
            </div>
        `;
    }

    // Route handler
    function onRoute(params) {
        init();

        // Check for execution ID in params (from instances page navigation)
        if (params.executionId) {
            setExecutionId(params.executionId);
            Router.clearParams();
            // Auto-load the execution
            setTimeout(fetchResults, 100);
        } else {
            // Load last used execution ID
            const lastExecutionId = localStorage.getItem('lastExecutionId');
            if (lastExecutionId) {
                setExecutionId(lastExecutionId);
            }
            showWelcome();
        }
    }

    return {
        init,
        onRoute,
        fetchResults,
        setExecutionId,
        stopPolling
    };
})();

window.ExecutionPage = ExecutionPage;
