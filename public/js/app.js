// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    UI.initTheme();
    
    // Initialize event listeners
    document.getElementById('loadButton').addEventListener('click', fetchResults);

    // Handle Enter key on input field
    document.getElementById('executionId').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchResults();
        }
    });
    
    // Main fetch function
    async function fetchResults() {
        const executionId = UI.getExecutionId();
        
        if (!executionId) {
            UI.showError('Please enter an Execution ID');
            return;
        }

        UI.showLoading();

        try {
            const result = await API.fetchExecutionResults(executionId);
            UI.displayResults(result);
        } catch (error) {
            UI.showError(error.message);
        }
    }

    // Auto-load if we have a default execution ID
    if (UI.getExecutionId()) {
        fetchResults();
    }
});