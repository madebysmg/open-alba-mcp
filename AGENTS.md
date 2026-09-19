# AGENTS.md - Open Alba MCP

This project is a local-first MCP server for searching user-provided part-time job data.

## Product Boundary

- Do not build a central job marketplace in this repository.
- Do not add escrow, payments, settlement, dispute resolution, or automatic application submission.
- Do not bundle unofficial scrapers for specific job platforms by default.
- Keep source collection as user-owned adapters that output the Open Alba Job format.
- Always preserve the "apply at source" principle: applications happen on the original job platform.

## Engineering Rules

- Keep the server dependency-light. Prefer Node.js standard library unless a dependency is explicitly justified.
- Default to read-only MCP tools. Any future write tools must be local-file-only and clearly named.
- Never store secrets, login cookies, user credentials, or platform tokens in examples.
- Use plain JSON/CSV examples with synthetic data only.
- Run `npm test` before reporting completion.
