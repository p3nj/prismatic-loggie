# Prismatic Loggie

A browser-side, no-build dashboard for the [Prismatic](https://prismatic.io) integration platform. Loggie lets you analyse org-wide usage, browse instance executions, drill into step logs, inspect config variables, and replay executions — all from a single static HTML/JS bundle that talks directly to Prismatic's GraphQL API.

## Features

### Analysis (default landing page)
- **Org-wide KPIs** — total executions, successful, failed, success rate over a chosen date range
- **Time-series chart** — executions over time (line / bar / area) with date-range presets (Today, 7d, 30d, 90d)
- **Distribution charts** — executions by outcome and by trigger type
- **Top performers** — top instances by volume and by error count, aggregated client-side across every instance you can see
- **Recent executions** feed with click-through to the Execution page

### Instances & Executions
- **Browse instances** with customer and integration metadata
- **Real-time search** with debouncing and cursor-based pagination
- **Per-instance execution list** with date-range, status, and flow filters
- **Live polling** — in-flight execution lists auto-refresh every 5 seconds
- **Opaque shareable URLs** — every view collapses to a single base64 token (`#<base64>`), so links carry the exact view (instance + filters) without exposing query strings; old `#instances?...&f=...` URLs are auto-upgraded in place

### Execution Detail
- **Step-by-step navigation** with loop iteration tracking
- **Step outputs** decoded from MessagePack, auto-formatted as JSON
- **Linked executions** for following long-running flow chains
- **Live updates** — running executions auto-refresh logs every 3 seconds
- **Replay / refire** with confirmation
- **Direct lookup** by execution ID

### Config
- **Config variables view** grouped by section with headings and dividers
- **Click-to-expand previews** powered by Monaco for JSON / JSONFORM values
- **Connection status** indicators

### Integrations
- Browse integrations the token can see, with versions and metadata

### Cross-cutting
- **Multi-region support** — US, AP Southeast 2, CA Central 1, EU West 1/2, US Gov West 1
- **Dark / light theme** with preference persistence
- **No build step** — pure vanilla JS + Bootstrap; just serve and use
- **Built-in rate limiter** — 4 req/s (250 ms minimum gap) to stay well inside Prismatic's 20 req/s limit

## Tech stack

| Category | Technology |
|----------|------------|
| Frontend | Vanilla JavaScript (ES6+) |
| UI framework | Bootstrap 5.1.3 |
| Icons | Bootstrap Icons 1.8.1 |
| Charts | Chart.js 4.4.1 + chartjs-adapter-date-fns 3.0.0 |
| Syntax highlighting | Prism.js 1.28.0 |
| Code editor | Monaco Editor 0.36.1 (lazy-loaded for previews) |
| Binary decoding | MessagePack (@msgpack/msgpack 2.8.0) |
| API | GraphQL (Prismatic) |

## Getting started

### Prerequisites

- A modern browser (Chrome / Firefox / Safari / Edge — latest 2 versions)
- A Prismatic API token ([docs](https://prismatic.io/docs/api-tokens/))
- Any static file server

### Run locally

```bash
git clone https://github.com/p3nj/prismatic-loggie.git
cd prismatic-loggie

# pick one
python3 -m http.server 8000
npx http-server -p 8000
npx serve -p 8000
```

Open <http://localhost:8000>.

### First-time setup

1. Click the **Setup Token** dropdown in the navbar (top-right).
2. Pick your **Prismatic region**.
3. Paste your **API token** and click **Connect** — the token is validated against `/get_auth_token` and cached for the session (5-minute TTL on the validation result).
4. You land on the **Analysis** page with org-wide metrics.

## Routing & shareable URLs

Loggie is a single-page app routed entirely off the URL hash. Every page state — route plus all params — is encoded into a single URL-safe base64 token:

```
https://<host>/#eyJyIjoiaW5zdGFuY2VzIiwicCI6eyJpbnN0YW5jZUlkIjoiLi4uIn19
```

This means a shareable link never leaks instance IDs, filter names, or page structure in plain text — the recipient gets the exact view that was copied, nothing more readable, nothing less complete.

Legacy URLs of the form `#instances?instanceId=…&f=…` are still accepted: on first load they're decoded by the legacy parser and immediately rewritten in place to the base64 form, so old shared links keep working.

The codec lives in [js/urlstate.js](js/urlstate.js); the router is [js/router.js](js/router.js).

## Data storage

Everything is stored locally in `localStorage` — no server-side state, no telemetry. Your API token never leaves your browser; all GraphQL calls go directly from the browser to Prismatic.

| Key | Description |
|-----|-------------|
| `selectedEndpoint` | Selected Prismatic region URL (validated against `^https?://`) |
| `apiToken_<endpoint>` | API token for each region |
| `theme` | `light` or `dark` |
| `lastExecutionId` | Last viewed execution ID (for convenience prefill) |

## Project structure

```
prismatic-loggie/
├── index.html                # SPA shell + Bootstrap markup + script tags
├── README.md
├── schema.json               # Prismatic GraphQL schema (introspection cache)
├── fetch-schema.js           # Script for refreshing schema.json (not in app)
├── fetch-schema-interactive.html
├── css/
│   └── styles.css            # Dark/light theme, layout, components
└── js/
    ├── app.js                # Entry point: theme init, auth init, route registration
    ├── urlstate.js           # base64 JSON codec for the URL hash
    ├── router.js             # Hash router (#<base64> + legacy upgrade)
    ├── api.js                # Prismatic GraphQL client + rate limiter
    ├── ui.js                 # Shared DOM rendering helpers
    └── pages/
        ├── analysis.js       # Org-wide analysis + charts (default route)
        ├── instances.js      # Instance browser + execution list + filters
        ├── execution.js      # Single execution viewer + live polling
        ├── integrations.js   # Integrations browser
        ├── config.js         # Per-instance config variables view
        └── auth.js           # Token setup + validation cache
```

## API rate limiting

Built into [js/api.js](js/api.js): a 250 ms minimum gap between requests (≈ 4 req/s sustained) keeps the app well under Prismatic's 20 req/s ceiling even when fanning out per-instance for org-wide aggregations.

## Browser support

| Browser | Support |
|---------|---------|
| Chrome  | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari  | Latest 2 versions |
| Edge    | Latest 2 versions |

Requires `TextEncoder` / `TextDecoder` and `URLSearchParams` — available in every browser of the supported window.

## Troubleshooting

**Token not working** — verify the token in the Prismatic dashboard, confirm the region matches, and check that the token has at least `org_view_instances`-equivalent permissions for the Analysis page.

**Analysis page shows no data** — the platform requires per-instance permission for `instanceDailyUsageMetrics`. Loggie fans out per-instance to work around this, but if your token can't see any instances, you'll see empty charts.

**Logs not loading** — open devtools and look at the network tab; the GraphQL endpoint is `<region>/api`. If you see `Missing required argument` errors, your token likely lacks the relevant permission on that resource.

**Theme not persisting** — confirm `localStorage` is enabled for this origin; some private-browsing modes block it.

## Contributing

PRs welcome. Standard flow:

1. Fork
2. `git checkout -b feature/your-thing`
3. Commit and push to your fork
4. Open a PR against `master`

## License

Open source — see the repository for license details.

## Acknowledgments

- [Prismatic](https://prismatic.io) — the integration platform this tool targets
- [Bootstrap](https://getbootstrap.com) — UI framework
- [Chart.js](https://www.chartjs.org/) — analysis charts
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — code-editor component for config previews
- [Prism.js](https://prismjs.com) — syntax highlighting
- [MessagePack](https://msgpack.org/) — binary step-output decoding
