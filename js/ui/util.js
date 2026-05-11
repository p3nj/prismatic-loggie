// UI utilities: theme + loading indicators + small formatters.
// Mutates window.UI so call sites can keep using `UI.foo`.
(() => {
    // Initialize theme
    function initTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = document.querySelector('.theme-icon');
        const prismLightTheme = document.getElementById('prism-light');
        const prismDarkTheme = document.getElementById('prism-dark');

        // Check for saved theme preference or use preferred color scheme
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
            themeIcon.className = 'theme-icon bi bi-sun';
            prismLightTheme.disabled = true;
            prismDarkTheme.disabled = false;
        }

        // Add event listener for theme toggle
        themeToggle.addEventListener('change', function() {
            if (this.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeIcon.className = 'theme-icon bi bi-sun';
                prismLightTheme.disabled = true;
                prismDarkTheme.disabled = false;
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeIcon.className = 'theme-icon bi bi-moon';
                prismLightTheme.disabled = false;
                prismDarkTheme.disabled = true;
            }
        });
    }

    // Show error message
    function showError(message) {
        const errorDiv = document.getElementById('error');
        const resultsDiv = document.getElementById('results');
        if (errorDiv) {
            errorDiv.classList.remove('d-none');
            errorDiv.textContent = `Error: ${message}`;
        }
        if (resultsDiv) {
            resultsDiv.innerHTML = '';
        }
    }

    // Show loading indicator
    function showLoading() {
        const resultsDiv = document.getElementById('results');
        const errorDiv = document.getElementById('error');
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div class="col-12 text-center"><div class="spinner-border" role="status"></div><div class="mt-2">Loading execution logs...</div></div>';
        }
        if (errorDiv) {
            errorDiv.classList.add('d-none');
        }
    }

    // Show loading progress with counts
    function showLoadingProgress(loadedCount, totalCount, isComplete = false) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        // Find or create the progress indicator
        let progressDiv = document.getElementById('loading-progress');

        if (!progressDiv) {
            // Create the progress indicator at the top of results
            progressDiv = document.createElement('div');
            progressDiv.id = 'loading-progress';
            progressDiv.className = 'col-12 mb-3';

            // Insert at the beginning of results
            if (resultsDiv.firstChild) {
                resultsDiv.insertBefore(progressDiv, resultsDiv.firstChild);
            } else {
                resultsDiv.appendChild(progressDiv);
            }
        }

        if (isComplete) {
            // Show completion message briefly, then remove
            progressDiv.innerHTML = `
                <div class="alert alert-success d-flex align-items-center" role="alert">
                    <i class="bi bi-check-circle-fill me-2"></i>
                    <span>Loaded all ${loadedCount} logs</span>
                </div>
            `;
            // Remove after 2 seconds
            setTimeout(() => {
                progressDiv.remove();
            }, 2000);
        } else {
            // Calculate percentage
            const percentage = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0;

            progressDiv.innerHTML = `
                <div class="alert alert-info d-flex align-items-center" role="alert">
                    <div class="spinner-border spinner-border-sm me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between mb-1">
                            <span>Loading logs...</span>
                            <span>${loadedCount} / ${totalCount}</span>
                        </div>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated"
                                 role="progressbar"
                                 style="width: ${percentage}%"
                                 aria-valuenow="${percentage}"
                                 aria-valuemin="0"
                                 aria-valuemax="100">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Hide loading progress
    function hideLoadingProgress() {
        const progressDiv = document.getElementById('loading-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }

    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    Object.assign(window.UI, {
        initTheme,
        showError,
        showLoading,
        showLoadingProgress,
        hideLoadingProgress,
        escapeHtml
    });
})();
