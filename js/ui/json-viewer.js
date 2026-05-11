// JSON viewer cluster: detection + modal rendering with Monaco.
// Mutates window.UI so call sites can keep using `UI.foo`.
(() => {
    // Detect and setup JSON viewers for a specific range of log indices.
    // Selector scopes to nodes not already processed (the data-json-processed
    // attribute is set by setupJsonViewerForContainer) so live polling that
    // re-invokes this for the new tail doesn't re-walk older logs.
    function detectAndSetupJsonViewersForRange(startIndex, endIndex) {
        const logContainers = document.querySelectorAll('.log-message:not([data-json-processed])');

        for (let i = startIndex; i < endIndex && i < logContainers.length; i++) {
            const container = logContainers[i];
            setupJsonViewerForContainer(container);
        }
    }

    // Setup JSON viewer for a single container
    function setupJsonViewerForContainer(container) {
        // Skip if already processed
        if (container.dataset.jsonProcessed) return;
        container.dataset.jsonProcessed = 'true';

        const text = container.textContent;

        // First try to parse the entire message as JSON
        try {
            const jsonObj = JSON.parse(text);

            // If we get here, the whole text is valid JSON
            const viewButton = document.createElement('button');
            viewButton.className = 'btn btn-sm btn-primary view-json-btn';
            viewButton.textContent = 'View JSON';
            viewButton.dataset.json = text;

            container.appendChild(document.createElement('br'));
            container.appendChild(viewButton);

            viewButton.addEventListener('click', showJsonModal);
            return;
        } catch (e) {
            // Not a valid complete JSON, continue to check for JSON patterns
        }

        // Look for patterns like "OBZ-Validation: {" or any text followed by JSON
        const jsonMatch = text.match(/([\w\-]+)\s*:\s*(\{[\s\S]*\})/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[2];
                JSON.parse(jsonStr);

                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                viewButton.textContent = 'View JSON';
                viewButton.dataset.json = jsonStr;

                container.appendChild(document.createElement('br'));
                container.appendChild(viewButton);

                viewButton.addEventListener('click', showJsonModal);
            } catch (e) {
                // Not valid JSON, try nested patterns
                tryNestedJsonPatterns(container, text);
            }
        } else {
            // Try to find any JSON-like content in the text
            const possibleJsonPattern = /(\{[\s\S]*\})/;
            const possibleMatch = text.match(possibleJsonPattern);

            if (possibleMatch) {
                try {
                    const jsonCandidate = possibleMatch[1];
                    JSON.parse(jsonCandidate);

                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-secondary view-json-btn';
                    viewButton.textContent = 'View Possible JSON';
                    viewButton.dataset.json = jsonCandidate;

                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);

                    viewButton.addEventListener('click', showJsonModal);
                } catch (e) {
                    tryNestedJsonPatterns(container, text);
                }
            }
        }
    }

    // Helper function for nested JSON patterns
    function tryNestedJsonPatterns(container, text) {
        const escapedJsonPattern = /"(?:message|error|response|result|data)"\s*:\s*"((?:\\.|[^"\\])*\\n\s*\{(?:\\.|[^"\\])*\}(?:\\.|[^"\\])*)/;
        const escapedMatch = text.match(escapedJsonPattern);

        if (escapedMatch) {
            try {
                let escapedJsonStr = escapedMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');

                const jsonObjectPattern = /\{[\s\S]*\}/;
                const jsonObjectMatch = escapedJsonStr.match(jsonObjectPattern);

                if (jsonObjectMatch) {
                    const nestedJsonStr = jsonObjectMatch[0];
                    JSON.parse(nestedJsonStr);

                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-warning view-json-btn';
                    viewButton.textContent = 'View Nested JSON';
                    viewButton.dataset.json = nestedJsonStr;

                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);

                    viewButton.addEventListener('click', showJsonModal);
                }
            } catch (nestedError) {
                // Failed to parse nested JSON
            }
        }
    }

    // Detect and setup JSON viewers
    function detectAndSetupJsonViewers(results) {
        // Find log messages that might contain JSON
        const logContainers = document.querySelectorAll('.log-message');

        logContainers.forEach(container => {
            const text = container.textContent;

            // First try to parse the entire message as JSON
            try {
                // Check if the whole text is valid JSON
                const jsonObj = JSON.parse(text);

                // If we get here, the whole text is valid JSON
                // Create a "View JSON" button
                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                viewButton.textContent = 'View JSON';
                viewButton.dataset.json = text;

                // Add button after the log message
                container.appendChild(document.createElement('br'));
                container.appendChild(viewButton);

                // Add click event
                viewButton.addEventListener('click', showJsonModal);
                return; // Skip to next container
            } catch (e) {
                // Not a valid complete JSON, continue to check for JSON patterns
            }

            // Look for patterns like "OBZ-Validation: {" or any text followed by JSON
            const jsonMatch = text.match(/([\w\-]+)\s*:\s*(\{[\s\S]*\})/);

            if (jsonMatch) {
                try {
                    // Try to parse the JSON part
                    const jsonStr = jsonMatch[2];
                    JSON.parse(jsonStr); // Just to validate it's valid JSON

                    // Create a "View JSON" button
                    const viewButton = document.createElement('button');
                    viewButton.className = 'btn btn-sm btn-primary view-json-btn';
                    viewButton.textContent = 'View JSON';
                    viewButton.dataset.json = jsonStr;

                    // Add button after the log message
                    container.appendChild(document.createElement('br'));
                    container.appendChild(viewButton);

                    // Add click event
                    viewButton.addEventListener('click', showJsonModal);
                } catch (e) {
                    // Not valid JSON, do nothing
                    console.log('Invalid JSON format detected, trying for nested JSON strings');

                    // Check for escaped JSON strings within the text
                    // This pattern looks for: something like "message": "...\n{...}\n"
                    const escapedJsonPattern = /"(?:message|error|response|result|data)"\s*:\s*"((?:\\.|[^"\\])*\\n\s*\{(?:\\.|[^"\\])*\}(?:\\.|[^"\\])*)/;
                    const escapedMatch = text.match(escapedJsonPattern);

                    if (escapedMatch) {
                        try {
                            // Extract the escaped JSON string and attempt to unescape it
                            let escapedJsonStr = escapedMatch[1];

                            // Replace escape sequences with their actual characters
                            escapedJsonStr = escapedJsonStr
                                .replace(/\\n/g, '\n')
                                .replace(/\\"/g, '"')
                                .replace(/\\\\/g, '\\');

                            // Try to find JSON objects within the unescaped string
                            const jsonObjectPattern = /\{[\s\S]*\}/;
                            const jsonObjectMatch = escapedJsonStr.match(jsonObjectPattern);

                            if (jsonObjectMatch) {
                                const nestedJsonStr = jsonObjectMatch[0];
                                // Validate that it's actual JSON
                                JSON.parse(nestedJsonStr);

                                // Create a "View Nested JSON" button
                                const viewButton = document.createElement('button');
                                viewButton.className = 'btn btn-sm btn-warning view-json-btn';
                                viewButton.textContent = 'View Nested JSON';
                                viewButton.dataset.json = nestedJsonStr;

                                // Add button after the log message
                                container.appendChild(document.createElement('br'));
                                container.appendChild(viewButton);

                                // Add click event
                                viewButton.addEventListener('click', showJsonModal);
                            }
                        } catch (nestedError) {
                            console.log('Failed to parse nested JSON:', nestedError);
                        }
                    }
                }
            } else {
                // Try to find any JSON-like content in the text
                const possibleJsonPattern = /(\{[\s\S]*\})/;
                const possibleMatch = text.match(possibleJsonPattern);

                if (possibleMatch) {
                    try {
                        const jsonCandidate = possibleMatch[1];
                        JSON.parse(jsonCandidate); // Just to validate

                        // Create a "View Possible JSON" button
                        const viewButton = document.createElement('button');
                        viewButton.className = 'btn btn-sm btn-secondary view-json-btn';
                        viewButton.textContent = 'View Possible JSON';
                        viewButton.dataset.json = jsonCandidate;

                        // Add button after the log message
                        container.appendChild(document.createElement('br'));
                        container.appendChild(viewButton);

                        // Add click event
                        viewButton.addEventListener('click', showJsonModal);
                    } catch (e) {
                        // Check for escaped JSON within nested strings
                        try {
                            // Look for escaped JSON within the message
                            const escapedNestedPattern = /\\n\s*(\{(?:\\.|[^\\])*\})/;
                            const escapedNestedMatch = text.match(escapedNestedPattern);

                            if (escapedNestedMatch) {
                                let escapedJson = escapedNestedMatch[1]
                                    .replace(/\\n/g, '\n')
                                    .replace(/\\"/g, '"')
                                    .replace(/\\\\/g, '\\');

                                // Validate that it's actual JSON
                                JSON.parse(escapedJson);

                                // Create a "View Nested JSON" button
                                const viewButton = document.createElement('button');
                                viewButton.className = 'btn btn-sm btn-info view-json-btn';
                                viewButton.textContent = 'View Nested JSON';
                                viewButton.dataset.json = escapedJson;

                                // Add button after the log message
                                container.appendChild(document.createElement('br'));
                                container.appendChild(viewButton);

                                // Add click event
                                viewButton.addEventListener('click', showJsonModal);
                            }
                        } catch (nestedError) {
                            console.log('No valid JSON found in message');
                        }
                    }
                }
            }
        });
    }

    // Show JSON modal with improved formatting
    function showJsonModal(event) {
        const jsonStr = event.target.dataset.json;
        let jsonObj;
        let nestedJson = null;
        let nestedJsonObjects = [];

        // Get step details from the closest log card
        const logCard = event.target.closest('.log-card');
        const stepName = logCard ? logCard.querySelector('h5').textContent : 'Unknown Step';
        const timestamp = logCard ? logCard.querySelector('.timestamp').textContent : '';

        // Check for loop information
        let loopInfo = '';
        const loopBadge = logCard ? logCard.querySelector('.badge') : null;
        if (loopBadge) {
            loopInfo = loopBadge.textContent;
        }

        // Look for loop path if it exists
        const loopPathElement = logCard ? logCard.querySelector('.loop-info') : null;
        const loopPath = loopPathElement ? loopPathElement.textContent : '';

        try {
            // First attempt - parse the direct JSON string
            jsonObj = JSON.parse(jsonStr);

            // Recursively scan for nested JSON in all string properties
            if (typeof jsonObj === 'object' && jsonObj !== null) {
                // Function to recursively scan object for JSON strings
                function scanForNestedJson(obj, path = []) {
                    if (typeof obj !== 'object' || obj === null) return;

                    // Scan all properties
                    Object.keys(obj).forEach(key => {
                        const value = obj[key];
                        const currentPath = [...path, key];

                        // If it's a string, try to parse as JSON
                        if (typeof value === 'string') {
                            try {
                                const parsedValue = JSON.parse(value);
                                if (typeof parsedValue === 'object' && parsedValue !== null) {
                                    // Found valid JSON - add to nested objects
                                    nestedJsonObjects.push({
                                        property: key,
                                        path: currentPath,
                                        pathString: currentPath.join('.'),
                                        json: parsedValue
                                    });

                                    // Continue scanning the parsed JSON object
                                    scanForNestedJson(parsedValue, [...currentPath, '(parsed)']);
                                }
                            } catch (e) {
                                // Not valid JSON, ignore
                            }
                        } else if (typeof value === 'object' && value !== null) {
                            // If it's an object, scan its properties
                            scanForNestedJson(value, currentPath);
                        }
                    });
                }

                // Start recursive scan
                scanForNestedJson(jsonObj);

                // If we found any nested JSON objects
                if (nestedJsonObjects.length > 0) {
                    nestedJson = true;
                }
            }
        } catch (e) {
            // Direct parsing failed, try to handle as escaped JSON string
            try {
                // Look for escaped JSON patterns like \n{...}\n
                const escapedPattern = /\\n\s*(\{[\s\S]*\})/;
                const match = jsonStr.match(escapedPattern);

                if (match) {
                    // Unescape the JSON string
                    let unescapedJson = match[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');

                    // Parse and format
                    jsonObj = JSON.parse(unescapedJson);
                } else {
                    // For non-JSON content, just display as text
                    jsonObj = { rawContent: jsonStr };
                }
            } catch (nestedError) {
                jsonObj = { rawContent: jsonStr };
            }
        }

        // Track editor instances to properly dispose them
        let mainEditor = null;
        let nestedEditor = null;

        // Store global references to the editors
        window.currentMainEditor = mainEditor;
        window.currentNestedEditor = nestedEditor;

        // Create modal if it doesn't exist
        let modal = document.getElementById('jsonModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'jsonModal';
            modal.className = 'json-modal';
            modal.innerHTML = `
                <div class="modal-content modal-lg">
                    <span class="close-modal">&times;</span>
                    <div class="step-details mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">JSON Data - <span id="modalStepName" class="text-secondary"></span></h5>
                            <span id="modalTimestamp" class="text-muted small"></span>
                        </div>
                        <div id="modalLoopInfo" class="mt-1 badge-container d-inline-block"></div>
                        <div id="modalLoopPath" class="small text-secondary fst-italic d-inline-block ms-2"></div>
                    </div>
                    <div class="resizable-container">
                        <div id="jsonContainer" class="editor-container main-editor"></div>
                        <div id="resizeHandle" class="resize-handle d-none"></div>
                        <div id="nestedJsonWrapper" class="nested-json-wrapper">
                            <div class="nested-json-tabs-container">
                                <div id="nestedJsonTabs" class="nested-json-tabs"></div>
                            </div>
                            <div id="nestedJsonContent" class="editor-container nested-editor"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add close functionality with proper editor cleanup
            modal.querySelector('.close-modal').addEventListener('click', () => {
                if (mainEditor) {
                    mainEditor.dispose();
                    mainEditor = null;
                }
                if (nestedEditor) {
                    nestedEditor.dispose();
                    nestedEditor = null;
                }
                modal.style.display = 'none';
            });

            // Close when clicking outside the modal
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    if (mainEditor) {
                        mainEditor.dispose();
                        mainEditor = null;
                    }
                    if (nestedEditor) {
                        nestedEditor.dispose();
                        nestedEditor = null;
                    }
                    modal.style.display = 'none';
                }
            });

            // Setup the resize handle functionality
            setupResizeHandle(modal);
        } else {
            // Clear the editors if modal exists
            document.getElementById('jsonContainer').innerHTML = '';
            document.getElementById('nestedJsonContent').innerHTML = '';
        }

        // Update step details in the modal
        document.getElementById('modalStepName').textContent = stepName;
        document.getElementById('modalTimestamp').textContent = timestamp;

        // Add loop information if available
        const modalLoopInfo = document.getElementById('modalLoopInfo');
        modalLoopInfo.innerHTML = '';
        if (loopInfo) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary';
            badge.textContent = loopInfo;
            modalLoopInfo.appendChild(badge);
        }

        // Add loop path if available
        const modalLoopPath = document.getElementById('modalLoopPath');
        modalLoopPath.textContent = loopPath;
        modalLoopPath.style.display = loopPath ? 'block' : 'none';

        // Get container references
        const jsonContainer = document.getElementById('jsonContainer');
        const nestedWrapper = document.getElementById('nestedJsonWrapper');
        const nestedContent = document.getElementById('nestedJsonContent');
        const nestedJsonTabs = document.getElementById('nestedJsonTabs');
        const resizeHandle = document.getElementById('resizeHandle');

        // Adjust container heights based on whether nested JSON is present
        if (nestedJson && nestedJsonObjects.length > 0) {
            nestedWrapper.style.display = 'flex';
            resizeHandle.classList.remove('d-none');

            // Set initial sizing - main takes 60%, nested 40%
            jsonContainer.style.height = '100%';
            nestedWrapper.style.height = '100%';
        } else {
            nestedWrapper.style.display = 'none';
            resizeHandle.classList.add('d-none');
            jsonContainer.style.height = '100%';
        }

        // Initialize Monaco Editor for main content
        mainEditor = monaco.editor.create(jsonContainer, {
            value: JSON.stringify(jsonObj, null, 2),
            language: 'json',
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            minimap: { enabled: true },
            folding: true,
            lineNumbers: 'on',
            scrollBeyondLastLine: false
        });

        // Store the reference globally
        window.currentMainEditor = mainEditor;

        // Handle nested JSON if available
        if (nestedJson && nestedJsonObjects.length > 0) {
            // Create tabs for each nested JSON property
            nestedJsonTabs.innerHTML = '';

            // Group nested items by first level path for better organization
            const groupedNestedJson = {};
            nestedJsonObjects.forEach(item => {
                const topLevel = item.path[0];
                if (!groupedNestedJson[topLevel]) {
                    groupedNestedJson[topLevel] = [];
                }
                groupedNestedJson[topLevel].push(item);
            });

            // Create dropdown structure for nested tabs
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'nested-tabs-container d-flex flex-wrap gap-2';

            let firstTabButton = null;

            // Process each group
            Object.keys(groupedNestedJson).forEach((group, groupIndex) => {
                const groupItems = groupedNestedJson[group];

                if (groupItems.length === 1 && groupItems[0].path.length === 1) {
                    // Simple case - just one item at this level
                    const item = groupItems[0];
                    const tabButton = document.createElement('button');
                    tabButton.className = `btn btn-sm ${groupIndex === 0 ? 'btn-info' : 'btn-outline-info'}`;
                    tabButton.textContent = item.property;
                    tabButton.dataset.index = nestedJsonObjects.indexOf(item);
                    tabButton.title = item.pathString;

                    if (groupIndex === 0) firstTabButton = tabButton;

                    tabButton.addEventListener('click', handleNestedJsonTabClick);
                    tabsContainer.appendChild(tabButton);
                } else {
                    // Create dropdown for multiple items
                    const dropdownContainer = document.createElement('div');
                    dropdownContainer.className = 'dropdown d-inline-block';

                    const dropdownButton = document.createElement('button');
                    dropdownButton.className = 'btn btn-sm btn-outline-info dropdown-toggle';
                    dropdownButton.textContent = group;
                    dropdownButton.setAttribute('data-bs-toggle', 'dropdown');
                    dropdownButton.setAttribute('aria-expanded', 'false');

                    const dropdownMenu = document.createElement('div');
                    dropdownMenu.className = 'dropdown-menu py-0';

                    // Add dropdown items
                    groupItems.forEach((item, itemIndex) => {
                        const dropdownItem = document.createElement('button');
                        dropdownItem.className = 'dropdown-item py-2';

                        // Create display path that shows the hierarchy
                        let displayPath = item.path.slice(1).join(' → ');
                        if (displayPath) {
                            dropdownItem.innerHTML = `<small class="text-muted me-1">${displayPath}</small>`;
                        }

                        // Add badge with property name
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-info ms-1';
                        badge.textContent = item.property;
                        dropdownItem.appendChild(badge);

                        dropdownItem.dataset.index = nestedJsonObjects.indexOf(item);
                        dropdownItem.title = item.pathString;

                        dropdownItem.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();

                            // Update active state on the dropdown button
                            const allButtons = tabsContainer.querySelectorAll('button.btn-info:not(.dropdown-toggle)');
                            allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));

                            // Set dropdown button as active
                            dropdownButton.classList.replace('btn-outline-info', 'btn-info');

                            // Show this nested JSON content
                            const idx = parseInt(this.dataset.index);
                            updateNestedJsonViewer(idx);
                        });

                        // Make the first item in first group the default
                        if (groupIndex === 0 && itemIndex === 0) {
                            firstTabButton = dropdownItem;
                        }

                        dropdownMenu.appendChild(dropdownItem);
                    });

                    dropdownContainer.appendChild(dropdownButton);
                    dropdownContainer.appendChild(dropdownMenu);
                    tabsContainer.appendChild(dropdownContainer);

                    // Create manual dropdown toggle functionality
                    dropdownButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();

                        // Toggle the dropdown menu visibility
                        const isOpen = dropdownMenu.classList.contains('show');

                        // Close all other dropdowns first
                        const allOpenDropdowns = modal.querySelectorAll('.dropdown-menu.show');
                        allOpenDropdowns.forEach(menu => {
                            menu.classList.remove('show');
                            menu.previousElementSibling.setAttribute('aria-expanded', 'false');
                        });

                        if (!isOpen) {
                            // Position and show the dropdown
                            dropdownMenu.classList.add('show');
                            dropdownButton.setAttribute('aria-expanded', 'true');

                            // Position the dropdown below the button
                            const buttonRect = dropdownButton.getBoundingClientRect();
                            dropdownMenu.style.top = `${buttonRect.bottom}px`;
                            dropdownMenu.style.left = `${buttonRect.left}px`;
                            dropdownMenu.style.minWidth = `${buttonRect.width}px`;

                            // Add click handler to close dropdown when clicking outside
                            setTimeout(() => {
                                document.addEventListener('click', closeDropdown);
                            }, 0);
                        }
                    });

                    function closeDropdown(e) {
                        if (!dropdownMenu.contains(e.target) && e.target !== dropdownButton) {
                            dropdownMenu.classList.remove('show');
                            dropdownButton.setAttribute('aria-expanded', 'false');
                            document.removeEventListener('click', closeDropdown);
                        }
                    }
                }
            });

            // Add the tabs container to the DOM
            nestedJsonTabs.appendChild(tabsContainer);

            // First, let's fix the dropdown UI and behavior
            const fixDropdownDisplay = () => {
                // Find all dropdowns in the modal
                const dropdowns = modal.querySelectorAll('.dropdown');

                // Add a container for popups that's above everything else
                let popupContainer = document.getElementById('modal-popup-container');
                if (!popupContainer) {
                    popupContainer = document.createElement('div');
                    popupContainer.id = 'modal-popup-container';
                    popupContainer.style.position = 'fixed';
                    popupContainer.style.top = '0';
                    popupContainer.style.left = '0';
                    popupContainer.style.width = '100%';
                    popupContainer.style.height = '100%';
                    popupContainer.style.pointerEvents = 'none'; // Let clicks pass through
                    popupContainer.style.zIndex = '10000'; // Very high z-index, increased for better stacking
                    document.body.appendChild(popupContainer);
                }

                // Track open menus to help with proper cleanup
                const openMenus = new Set();

                dropdowns.forEach(dropdown => {
                    const button = dropdown.querySelector('.dropdown-toggle');
                    const originalMenu = dropdown.querySelector('.dropdown-menu');

                    if (button && originalMenu) {
                        // Create a copy of the menu that we'll place in the popup container
                        const menu = originalMenu.cloneNode(true);
                        originalMenu.style.display = 'none'; // Hide the original

                        // Generate a unique ID for this menu for tracking
                        const menuId = `dropdown-menu-${Math.random().toString(36).substring(2, 9)}`;
                        menu.dataset.menuId = menuId;

                        // Style the detached menu
                        menu.style.position = 'absolute';
                        menu.style.display = 'none';
                        menu.style.backgroundColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#343a40' : '#fff';
                        menu.style.border = '1px solid rgba(0,0,0,0.15)';
                        menu.style.borderRadius = '0.25rem';
                        menu.style.padding = '0.5rem 0';
                        menu.style.minWidth = '10rem';
                        menu.style.boxShadow = '0 0.5rem 1rem rgba(0,0,0,0.175)';
                        menu.style.pointerEvents = 'auto'; // Enable interaction

                        // Add the detached menu to the popup container
                        popupContainer.appendChild(menu);

                        // Clear any existing listeners to prevent duplicates
                        const newButton = button.cloneNode(true);
                        button.parentNode.replaceChild(newButton, button);

                        // Store relation between button and menu
                        newButton.dataset.controls = menuId;

                        // Add proper toggle behavior
                        newButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();

                            // Close all other open menus first
                            const allOpenMenus = popupContainer.querySelectorAll('.dropdown-menu[style*="display: block"]');
                            allOpenMenus.forEach(openMenu => {
                                if (openMenu !== menu) {
                                    openMenu.style.display = 'none';
                                    openMenus.delete(openMenu.dataset.menuId);

                                    // Find and update the button state
                                    const relatedButton = modal.querySelector(`[data-controls="${openMenu.dataset.menuId}"]`);
                                    if (relatedButton) {
                                        relatedButton.setAttribute('aria-expanded', 'false');
                                    }
                                }
                            });

                            // Toggle this dropdown
                            if (menu.style.display === 'none' || menu.style.display === '') {
                                // Get button position relative to viewport
                                const buttonRect = newButton.getBoundingClientRect();
                                const modalRect = modal.querySelector('.modal-content').getBoundingClientRect();

                                // Position menu below the button
                                menu.style.top = `${buttonRect.bottom + 5}px`;
                                menu.style.left = `${buttonRect.left}px`;
                                menu.style.display = 'block';
                                newButton.setAttribute('aria-expanded', 'true');
                                openMenus.add(menuId);

                                // Ensure the menu is visible by checking if it goes off screen
                                setTimeout(() => {
                                    const menuRect = menu.getBoundingClientRect();
                                    const viewportWidth = window.innerWidth;

                                    // If menu extends beyond right edge of viewport
                                    if (menuRect.right > viewportWidth) {
                                        // Adjust position to be within viewport
                                        const newLeft = Math.max(10, viewportWidth - menuRect.width - 10);
                                        menu.style.left = `${newLeft}px`;
                                    }

                                    // If menu extends beyond the bottom of viewport
                                    if (menuRect.bottom > window.innerHeight) {
                                        // Position above the button if there's space
                                        if (buttonRect.top > menuRect.height + 10) {
                                            menu.style.top = `${buttonRect.top - menuRect.height - 5}px`;
                                        }
                                    }
                                }, 0);
                            } else {
                                menu.style.display = 'none';
                                newButton.setAttribute('aria-expanded', 'false');
                                openMenus.delete(menuId);
                            }
                        });

                        // Style and add click handlers to menu items
                        const menuItems = menu.querySelectorAll('.dropdown-item');
                        menuItems.forEach((item, index) => {
                            // Apply styles to dropdown items
                            item.style.display = 'block';
                            item.style.width = '100%';
                            item.style.padding = '0.25rem 1rem';
                            item.style.clear = 'both';
                            item.style.textAlign = 'inherit';
                            item.style.whiteSpace = 'nowrap';
                            item.style.backgroundColor = 'transparent';
                            item.style.border = '0';
                            item.style.cursor = 'pointer';

                            // Get the corresponding item from the original menu to get the index
                            const originalItem = originalMenu.querySelectorAll('.dropdown-item')[index];
                            const dataIndex = originalItem ? originalItem.dataset.index : null;

                            if (dataIndex !== null) {
                                item.dataset.index = dataIndex;
                            }

                            // Add hover effect
                            item.addEventListener('mouseover', function() {
                                this.style.backgroundColor = document.documentElement.getAttribute('data-theme') === 'dark'
                                    ? 'rgba(255,255,255,0.1)'
                                    : 'rgba(0,0,0,0.05)';
                            });

                            item.addEventListener('mouseout', function() {
                                this.style.backgroundColor = 'transparent';
                            });

                            item.addEventListener('click', function(e) {
                                e.preventDefault();
                                e.stopPropagation();

                                // Close the dropdown menu
                                menu.style.display = 'none';
                                newButton.setAttribute('aria-expanded', 'false');
                                openMenus.delete(menuId);

                                // Update active state on buttons
                                const allButtons = tabsContainer.querySelectorAll('button.btn-info:not(.dropdown-toggle)');
                                allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));

                                // Set dropdown button as active
                                newButton.classList.replace('btn-outline-info', 'btn-info');

                                // Show selected nested JSON content
                                const idx = parseInt(this.dataset.index);
                                updateNestedJsonViewer(idx);
                            });
                        });
                    }
                });

                // Global click handler to close dropdowns when clicking outside
                const outsideClickHandler = function(e) {
                    // Only process if modal is visible
                    if (modal.style.display !== 'block') return;

                    // Get all open menus
                    const dropdownMenus = popupContainer.querySelectorAll('.dropdown-menu[style*="display: block"]');
                    if (!dropdownMenus.length) return;

                    // Find if the click was on a dropdown toggle button
                    let clickedOnToggle = false;
                    const toggleButtons = modal.querySelectorAll('.dropdown-toggle');
                    toggleButtons.forEach(button => {
                        if (button.contains(e.target)) {
                            clickedOnToggle = true;
                        }
                    });

                    // If not clicking on a menu or a toggle button, close all menus
                    if (!clickedOnToggle) {
                        let clickedInsideMenu = false;
                        dropdownMenus.forEach(menu => {
                            if (menu.contains(e.target)) {
                                clickedInsideMenu = true;
                            }
                        });

                        if (!clickedInsideMenu) {
                            dropdownMenus.forEach(menu => {
                                menu.style.display = 'none';

                                // Find and update the button state
                                const toggleButtons = modal.querySelectorAll('.dropdown-toggle[aria-expanded="true"]');
                                toggleButtons.forEach(button => {
                                    button.setAttribute('aria-expanded', 'false');
                                });
                            });
                        }
                    }
                };

                // Add the global click handler
                document.addEventListener('mousedown', outsideClickHandler);

                // Clean up when modal closes
                modal.querySelector('.close-modal').addEventListener('click', function() {
                    // Remove all menus from popup container
                    while (popupContainer.firstChild) {
                        popupContainer.removeChild(popupContainer.firstChild);
                    }

                    // Remove the global click handler
                    document.removeEventListener('mousedown', outsideClickHandler);
                });
            };

            // Apply the dropdown fixes
            fixDropdownDisplay();

            // Function to handle regular tab button clicks
            function handleNestedJsonTabClick(e) {
                // Update active tab styling
                const allButtons = tabsContainer.querySelectorAll('.btn-info');
                allButtons.forEach(btn => {
                    if (btn.classList.contains('dropdown-toggle') || !btn.classList.contains('dropdown-item')) {
                        btn.classList.replace('btn-info', 'btn-outline-info');
                    }
                });

                // Set this button as active
                e.target.classList.replace('btn-outline-info', 'btn-info');

                // Show selected nested JSON
                const idx = parseInt(e.target.dataset.index);
                updateNestedJsonViewer(idx);
            }

            // Function to update the nested JSON viewer
            function updateNestedJsonViewer(index) {
                if (nestedEditor) {
                    nestedEditor.dispose();
                }

                // Get path info for display
                const item = nestedJsonObjects[index];
                const pathDisplay = document.createElement('div');
                pathDisplay.className = 'path-display small text-muted mb-2 border-bottom pb-1';

                // Show breadcrumb-style path
                if (item.path.length > 1) {
                    const pathHTML = item.path.map((segment, i) => {
                        if (i === item.path.length - 1) {
                            return `<strong>${segment}</strong>`;
                        }
                        return `<span>${segment}</span>`;
                    }).join(' → ');
                    pathDisplay.innerHTML = `<i class="bi bi-diagram-3 me-1"></i> ${pathHTML}`;
                } else {
                    pathDisplay.innerHTML = `<i class="bi bi-braces me-1"></i> ${item.property}`;
                }

                // Create wrapper to hold path display and editor
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'd-flex flex-column h-100';
                contentWrapper.appendChild(pathDisplay);

                const editorContainer = document.createElement('div');
                editorContainer.className = 'flex-grow-1';
                contentWrapper.appendChild(editorContainer);

                // Clear and add the new content
                nestedContent.innerHTML = '';
                nestedContent.appendChild(contentWrapper);

                // Create editor in the container
                nestedEditor = monaco.editor.create(editorContainer, {
                    value: JSON.stringify(item.json, null, 2),
                    language: 'json',
                    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
                    automaticLayout: true,
                    minimap: { enabled: true },
                    folding: true,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false
                });

                // Store the reference globally
                window.currentNestedEditor = nestedEditor;
            }

            // Initialize with the first tab
            if (firstTabButton) {
                // If it's a dropdown item, we need to handle it specially
                if (firstTabButton.classList.contains('dropdown-item')) {
                    // Get the index and trigger the nested viewer directly
                    const idx = parseInt(firstTabButton.dataset.index);
                    updateNestedJsonViewer(idx);

                    // Set the parent dropdown button as active
                    const parentDropdown = firstTabButton.closest('.dropdown');
                    if (parentDropdown) {
                        const dropdownToggle = parentDropdown.querySelector('.dropdown-toggle');
                        if (dropdownToggle) {
                            // Make this dropdown button active
                            const allButtons = tabsContainer.querySelectorAll('button.btn-info');
                            allButtons.forEach(btn => btn.classList.replace('btn-info', 'btn-outline-info'));
                            dropdownToggle.classList.replace('btn-outline-info', 'btn-info');
                        }
                    }
                } else {
                    // Regular button, just click it
                    firstTabButton.click();
                }
            }
        }

        modal.style.display = 'block';

        // Notify Monaco editor of layout change
        setTimeout(() => {
            if (mainEditor) mainEditor.layout();
            if (nestedEditor) mainEditor.layout();
        }, 100);
    }

    function setupResizeHandle(modal) {
        const resizeHandle = modal.querySelector('#resizeHandle');
        const mainEditorContainer = modal.querySelector('#jsonContainer');
        const nestedWrapper = modal.querySelector('#nestedJsonWrapper');
        const container = modal.querySelector('.resizable-container');

        let isDragging = false;
        let startY, startHeightMain, startHeightNested;
        let rafId = null;
        let containerHeight;

        // Add resize handle event listeners
        resizeHandle.addEventListener('mousedown', startResize);

        function startResize(e) {
            isDragging = true;

            // Get current editor references (these are set in showJsonModal)
            const mainEditor = window.currentMainEditor;
            const nestedEditor = window.currentNestedEditor;

            // Cache initial measurements
            containerHeight = container.getBoundingClientRect().height;
            startY = e.clientY;
            startHeightMain = mainEditorContainer.offsetHeight;
            startHeightNested = nestedWrapper.offsetHeight;

            // Add visual feedback
            document.body.style.cursor = 'ns-resize';
            document.body.classList.add('resizing');

            // Add event listeners for dragging
            document.addEventListener('mousemove', onMouseMove, { passive: false });
            document.addEventListener('mouseup', stopResize);

            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();

            // Use requestAnimationFrame for better performance
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    // Calculate delta and new heights
                    const deltaY = e.clientY - startY;
                    let newMainHeight = startHeightMain + deltaY;
                    let newNestedHeight = startHeightNested - deltaY;

                    // Calculate minimum height (10% of container)
                    const minHeight = Math.max(60, containerHeight * 0.1);

                    // Apply minimum height constraints
                    if (newMainHeight < minHeight) {
                        newMainHeight = minHeight;
                        newNestedHeight = containerHeight - minHeight - 6;
                    }
                    if (newNestedHeight < minHeight) {
                        newNestedHeight = minHeight;
                        newMainHeight = containerHeight - minHeight - 6;
                    }

                    // Apply new heights directly (using pixels for better performance)
                    mainEditorContainer.style.height = `${newMainHeight}px`;
                    nestedWrapper.style.height = `${newNestedHeight}px`;

                    // Update editor layouts
                    if (window.currentMainEditor) window.currentMainEditor.layout();
                    if (window.currentNestedEditor) window.currentNestedEditor.layout();

                    rafId = null;
                });
            }
        }

        function stopResize() {
            if (!isDragging) return;

            // Reset state
            isDragging = false;
            document.body.style.cursor = '';
            document.body.classList.remove('resizing');

            // Remove event listeners with proper arguments
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', stopResize);

            // Final layout update
            if (window.currentMainEditor) window.currentMainEditor.layout();
            if (window.currentNestedEditor) window.currentNestedEditor.layout();

            // Cancel any pending animation frame
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }
    }

    Object.assign(window.UI, {
        detectAndSetupJsonViewers,
        detectAndSetupJsonViewersForRange,
        setupJsonViewerForContainer,
        showJsonModal
    });
})();
