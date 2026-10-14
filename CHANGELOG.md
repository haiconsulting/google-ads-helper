# Changelog

## [0.2.0] - 2026-10-14

### Added
- Read-only MCP connector at `POST /api/mcp` (Streamable HTTP) with harness JWT verification, plus `GET /api/mcp/healthz`.
- Site footer shows the app version from `NEXT_PUBLIC_APP_VERSION`, taken from `package.json` at build time.
- Local `npm run dev` binds `127.0.0.1:7424` for connector id `google-ads-helper`.

The connector package `@hai/mcp-google-ads-helper` is version 0.1.0 (tag `mcp-google-ads-helper-v0.1.0`). See `mcp/CHANGELOG.md`.
