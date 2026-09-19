# Open Alba MCP

Open Alba MCP is a local-first MCP server for searching part-time job postings collected by the user.

It is not a job marketplace. It does not submit applications, contact employers, escrow payments, or settle disputes. It helps Claude, Codex, and other MCP clients search local job data and point the user back to the original platform.

## Why

Short-term part-time jobs are scattered across many platforms, and whether a posting is usable depends on small details: how far it is, when it starts and ends, and what it pays. Open Alba MCP lets an AI client filter and rank a local job file against a personal profile, while the data stays on the user's machine and applications stay on the original platform. The product background and roadmap are in [`docs/PRD_Open_Alba_MCP.md`](docs/PRD_Open_Alba_MCP.md) (Korean).

## Scope

- Load user-owned job data from JSON or CSV.
- Search jobs by keyword, category, pay, distance, and time.
- Rank jobs against a local preference profile.
- Explain why a job matches.
- Keep applications on the original job platform via `applyUrl`.

## Requirements

Node.js 20.11 or later. There are no dependencies, so no `npm install` is needed.

## Quick Start

```bash
git clone https://github.com/madebysmg/open-alba-mcp.git
cd open-alba-mcp
npm test
npm run search -- --jobs examples/jobs.sample.json --profile examples/profile.sample.json
```

The `search` command also accepts `--query <text>` and `--limit <n>`.

Run as an MCP server (JSON-RPC 2.0 over stdio):

```bash
npm run mcp
```

Claude Desktop style config:

```json
{
  "mcpServers": {
    "open-alba": {
      "command": "node",
      "args": ["/absolute/path/to/open-alba-mcp/src/index.js", "mcp"],
      "env": {
        "OPEN_ALBA_JOBS_PATH": "/absolute/path/to/open-alba-mcp/examples/jobs.sample.json",
        "OPEN_ALBA_PROFILE_PATH": "/absolute/path/to/open-alba-mcp/examples/profile.sample.json"
      }
    }
  }
}
```

Without these environment variables the server falls back to `examples/*.sample.json` relative to the current working directory, which an MCP client usually does not set to this repository. Use absolute paths.

The server only reads the two files set here (or the sample defaults). Tool arguments cannot point it at another file.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `list_sources` | Summarize loaded job sources and platforms. |
| `search_jobs` | Search local jobs with explicit filters. |
| `find_jobs_for_profile` | Rank jobs using the local profile file. |
| `get_job_detail` | Return one job by ID. |
| `explain_match` | Explain why one job does or does not match a profile. |
| `draft_application_note` | Draft a short application note. Does not submit it. |

How matching works (`src/match.js`):

- A job is excluded if it fails any active filter: keyword, category, minimum hourly pay, maximum distance, or availability window.
- Remaining jobs are ranked by a simple additive score. Distance uses the Haversine formula on `lat`/`lng`.
- The keyword filter is a case-insensitive substring match over title, company name, description, and tags.
- Results default to 10 and are capped at 50.

The jobs file is re-read on every tool call, so an external collector can update it without restarting the server.

## Data Boundary

This package intentionally does not bundle platform-specific scrapers. Users or adapter developers can collect jobs from sources they are allowed to access and write them to the Open Alba Job format.

Applications must happen on the original platform through `applyUrl`.

The files in `examples/` contain synthetic data only.

## Adapter Contract

Adapters should write either:

- `{ "jobs": [OpenAlbaJob, ...] }` (a bare JSON array also works)
- CSV with headers matching `schemas/open-alba-job.schema.json`

A file is read as CSV when its name ends in `.csv`. In CSV, `categories` and `tags` are separated with `|` or `;`.

Reference schemas:

- `schemas/open-alba-job.schema.json`
- `schemas/open-alba-profile.schema.json`

## Status and Limitations

Version 0.1.0. It covers the first phase of the PRD (local search MVP) plus profile-based ranking (`find_jobs_for_profile`) from the second phase.

- Input files are normalized with defaults but not validated against the JSON Schemas.
- Duplicate detection, new-posting detection, and scheduled refresh described in the PRD are not implemented.
- No source adapters are included.
- The server implements `initialize`, `tools/list`, and `tools/call` (protocol version `2024-11-05`). Messages without an `id` (or with a `null` id) are treated as notifications and get no response.
- `npm test` is a smoke test that starts the server and calls `initialize`, `tools/list`, `find_jobs_for_profile`, and `list_sources` against the sample data. It also checks that request id `0` gets a response and that a per-call `jobsPath` argument is ignored.
