// Execution Page Handler
const ExecutionPage = (() => {
    let initialized = false;

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

    // Fetch and display execution results with continuous log loading
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

        UI.showLoading();

        try {
            // First fetch execution metadata (without logs)
            const executionMetadata = await API.fetchExecutionResults(executionId);

            if (!executionMetadata) {
                UI.showError('Execution not found');
                return;
            }

            // Initialize the results container with metadata
            UI.initResultsContainer(executionMetadata);

            // Now fetch logs continuously in batches
            let previousLogCount = 0;
            const logGenerator = API.fetchAllExecutionLogs(executionId, 100);

            for await (const progress of logGenerator) {
                // Show progress indicator
                UI.showLoadingProgress(progress.loadedCount, progress.totalCount, progress.isComplete);

                // Render only the new logs (incremental)
                if (progress.logs.length > previousLogCount) {
                    const newLogs = progress.logs.slice(previousLogCount);
                    UI.renderLogsIncremental(newLogs, previousLogCount);
                    previousLogCount = progress.logs.length;

                    // Update step navigation with all logs so far
                    UI.updateStepNavigationFromLogs(progress.logs);
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
        } catch (error) {
            UI.showError(error.message);
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
                        <li>Step-by-step navigation with the TOC sidebar</li>
                        <li>JSON data auto-detection and formatted viewing</li>
                        <li>Loop iterations organized in a tree structure</li>
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
        setExecutionId
    };
})();

window.ExecutionPage = ExecutionPage;
