# Prismatic Loggie

A web-based execution result viewer and debugger for the [Prismatic](https://prismatic.io) integration platform. Prismatic Loggie provides a user-friendly interface to browse, search, filter, and analyze execution logs and step results from your Prismatic instances.

## Features

### Instance Management
- **Browse Instances** - View all your Prismatic instances with customer and integration details
- **Search** - Find instances quickly with real-time search (with debounce)
- **Pagination** - Navigate through large instance lists efficiently

### Execution Viewing & Filtering
- **Execution History** - Browse all executions per instance with detailed metadata
- **Advanced Filtering** - Filter by date range, execution status, and flow name
- **Status Filters** - View SUCCESS, ERROR, PENDING, or QUEUED executions
- **Shareable URLs** - Share filtered views with colleagues via URL parameters

### Step-by-Step Analysis
- **Detailed Logs** - View all execution logs with precise timestamps
- **Step Navigation** - Navigate through steps with loop iteration support
- **Step Outputs** - View and download step results with automatic JSON formatting
- **Loop Tracking** - Track nested loop iterations through complex flows

### Advanced Capabilities
- **Linked Executions** - Follow execution chains for long-running flows
- **Execution Replay** - Replay/refire executions with confirmation dialog
- **Incremental Loading** - Stream logs progressively for better performance
- **Multi-Region Support** - Connect to any Prismatic region worldwide

### User Experience
- **Dark/Light Theme** - Toggle themes with preference persistence
- **Responsive Design** - Works on desktop and mobile devices
- **No Build Required** - Pure vanilla JavaScript, just serve and use

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | Vanilla JavaScript (ES6+) |
| UI Framework | Bootstrap 5.1.3 |
| Icons | Bootstrap Icons 1.8.1 |
| Syntax Highlighting | Prism.js 1.28.0 |
| Code Editor | Monaco Editor 0.36.1 |
| JSON Viewer | JSON Editor 9.10.0 |
| Data Format | MessagePack (@msgpack/msgpack 2.8.0) |
| API | GraphQL (Prismatic API) |

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- A valid Prismatic API token ([how to get one](https://prismatic.io/docs/api-tokens/))
- Any static file server (Python, Node.js, or web server)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/prismatic-loggie.git
   cd prismatic-loggie
   ```

2. **Serve the files** using one of these methods:

   **Python 3:**
   ```bash
   python -m http.server 8000
   ```

   **Python 2:**
   ```bash
   python -m SimpleHTTPServer 8000
   ```

   **Node.js (npx):**
   ```bash
   npx http-server -p 8000
   ```

   **Node.js (serve):**
   ```bash
   npx serve -p 8000
   ```

3. **Open your browser** and navigate to:
   ```
   http://localhost:8000
   ```

## Configuration

### First-Time Setup

1. Click **"Setup Token"** in the navigation bar (or navigate to `#auth`)
2. Select your **Prismatic region** from the dropdown:
   - US (app.prismatic.io)
   - AP Southeast 2 (app.ap-southeast-2.prismatic.io)
   - CA Central 1 (app.ca-central-1.prismatic.io)
   - EU West 1 (app.eu-west-1.prismatic.io)
   - EU West 2 (app.eu-west-2.prismatic.io)
   - US Gov West 1 (app.us-gov-west-1.prismatic.io)
3. Enter your **Prismatic API token**
4. Click **"Connect"** to validate and save

### Data Storage

All configuration is stored locally in your browser's `localStorage`:

| Key | Description |
|-----|-------------|
| `selectedEndpoint` | Selected Prismatic region URL |
| `apiToken_[endpoint]` | API token for each region |
| `theme` | Theme preference (light/dark) |
| `lastExecutionId` | Last viewed execution ID |

> **Note:** Your API token never leaves your browser - all API calls are made directly from your browser to Prismatic's servers.

## Usage

### Browsing Instances

1. Navigate to the **Instances** tab
2. Use the search box to filter instances by name
3. Click on an instance to view its execution history
4. Use pagination controls for large lists

### Viewing Executions

1. Select an instance to see its executions
2. Apply filters:
   - **Date Range** - Default is last 7 days
   - **Status** - Filter by SUCCESS, ERROR, PENDING, QUEUED
   - **Flow** - Filter by specific flow name
3. Click an execution to view detailed logs

### Analyzing Execution Details

1. View the **execution timeline** with all steps
2. Click on steps in the **navigation panel** to jump to specific logs
3. Expand steps to see **outputs and results**
4. Download step outputs as JSON files
5. Follow **linked executions** for execution chains

### Direct Execution Lookup

1. Navigate to the **Execution** tab
2. Enter an execution ID directly
3. Click **"Fetch Execution"** to load logs

### Replaying Executions

1. View an execution's details
2. Click the **"Replay"** button
3. Confirm the action in the dialog
4. A new execution will be triggered

## Project Structure

```
prismatic-loggie/
├── index.html              # Main HTML file (SPA shell)
├── README.md               # This file
├── css/
│   └── styles.css          # Styles with dark/light theme support
└── js/
    ├── app.js              # Application entry point
    ├── router.js           # Hash-based SPA router
    ├── api.js              # Prismatic GraphQL API client
    ├── ui.js               # UI rendering and DOM manipulation
    └── pages/
        ├── auth.js         # Authentication page handler
        ├── instances.js    # Instances & executions page
        └── execution.js    # Execution details page
```

## API Rate Limiting

Prismatic Loggie includes built-in rate limiting (4 requests/second) to prevent hitting Prismatic's API limits. This is handled automatically - no configuration needed.

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |

## Troubleshooting

### Token Not Working

1. Verify your token is valid in the Prismatic dashboard
2. Ensure you've selected the correct region
3. Check that the token has appropriate permissions

### Logs Not Loading

1. Check browser console for errors
2. Verify the execution ID exists
3. Ensure your token has access to the instance

### Theme Not Persisting

1. Check if localStorage is enabled in your browser
2. Clear localStorage and reconfigure if corrupted

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source. See the repository for license details.

## Acknowledgments

- [Prismatic](https://prismatic.io) - The integration platform this tool is built for
- [Bootstrap](https://getbootstrap.com) - UI framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor component
- [Prism.js](https://prismjs.com) - Syntax highlighting
