// Execution Page Handler
const ExecutionPage = (() => {
    let initialized = false;
    let currentExecutionId = null;
    let stepResultsCache = new Map(); // Cache for step results
    let linkedExecutionsCache = null;
    let fetchGeneration = 0; // Generation counter to cancel stale fetches

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

        // Increment generation to invalidate any in-flight fetches
        const generation = ++fetchGeneration;

        // Clear caches when loading new execution
        if (currentExecutionId !== executionId) {
            stepResultsCache.clear();
            linkedExecutionsCache = null;
            currentExecutionId = executionId;
        }

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

            // Bail out if a newer fetch has started
            if (generation !== fetchGeneration) return;

            if (!executionMetadata) {
                UI.showError('Execution not found');
                return;
            }

            // Initialize the results container with metadata
            UI.initResultsContainer(executionMetadata);

            // Fetch linked executions and step results in parallel with logs
            const stepResultsPromise = fetchAllStepResultsWithProgress(executionId, executionMetadata.startedAt, generation);
            const linkedExecutionsPromise = fetchLinkedExecutionsIfNeeded(executionId, executionMetadata.startedAt);

            // Start fetching logs
            let previousLogCount = 0;
            let allLogEdges = [];
            const logGenerator = API.fetchAllExecutionLogs(executionId, 100);

            // Process logs as they come in
            for await (const progress of logGenerator) {
                // Bail out if a newer fetch has started
                if (generation !== fetchGeneration) return;

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
                }
            }

            // Bail out if a newer fetch has started
            if (generation !== fetchGeneration) return;

            // Wait for step results and linked executions to complete
            const [stepResults, linkedExecutions] = await Promise.all([
                stepResultsPromise,
                linkedExecutionsPromise
            ]);

            // Bail out if a newer fetch has started
            if (generation !== fetchGeneration) return;

            // Final update with step results for eye icons (output viewing)
            if (allLogEdges.length > 0 && stepResults && stepResults.length > 0) {
                UI.updateStepNavigationCombined(allLogEdges, stepResults, executionId);
            }

            // Show linked executions if any
            if (linkedExecutions && linkedExecutions.length > 0) {
                UI.renderLinkedExecutions(linkedExecutions, executionId, executionMetadata);
            }

            // Detect and combine consecutive log entries that are fragments of the
            // same JSON object (e.g., HTTP response bodies split across entries)
            if (allLogEdges.length > 1) {
                UI.detectAndSetupCombinedJsonViewers();
            }

        } catch (error) {
            // Only show error if this fetch is still current
            if (generation === fetchGeneration) {
                UI.showError(error.message);
            }
        }
    }

    // Fetch all step results with progress updates
    async function fetchAllStepResultsWithProgress(executionId, startedAt, generation) {
        const allSteps = [];

        try {
            const stepGenerator = API.fetchAllStepResults(executionId, {
                batchSize: 100,
                startedAt: startedAt
            });

            for await (const progress of stepGenerator) {
                // Bail out if a newer fetch has started
                if (generation !== fetchGeneration) return [];

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

        // Check for execution ID in params (from instances page navigation or URL query)
        if (params.executionId) {
            setExecutionId(params.executionId);
            Router.clearParams();

            // Clear stale DOM content immediately so old results aren't visible
            const resultsDiv = document.getElementById('results');
            if (resultsDiv) {
                resultsDiv.innerHTML = '';
            }

            // Reset state if switching to a different execution
            if (currentExecutionId !== params.executionId) {
                currentExecutionId = params.executionId;
                stepResultsCache.clear();
                linkedExecutionsCache = null;
            }

            // Auto-load immediately (no delay to avoid showing stale content)
            fetchResults();
        } else {
            // Load last used execution ID as a convenience hint (pre-fills input)
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
        setExecutionId
    };
})();

window.ExecutionPage = ExecutionPage;
