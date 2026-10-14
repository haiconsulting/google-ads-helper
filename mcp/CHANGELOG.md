# Changelog

## [0.1.0] - 2026-10-14

### Added
- Initial Google Ads Helper connector for connector spec 0.3.0 (`specVersion` 1).
- Read-only tools: `gads.clients.list`, `gads.clients.get`, and the required `gads.hosting.*` tools.
- Hosting tools return `UNSUPPORTED` (or `ACCOUNT_REVOKED` / `ACCOUNT_MISSING` when the harness says so) and do not fabricate metrics.
