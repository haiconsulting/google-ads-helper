# Google Ads Helper MCP connector

Streamable HTTP MCP for connector id `google-ads-helper`, at `POST /api/mcp`. The harness is the only client. Spec: connector interface 0.3.1.

## Local development

`npm run dev` binds **127.0.0.1:7424** only (Harness Architect port for this connector). It does not listen on `0.0.0.0`.

- MCP: `http://127.0.0.1:7424/api/mcp`
- Health: `http://127.0.0.1:7424/api/mcp/healthz`

The same command is `npm run dev` inside `mcp/`. The manifest `port` is `7424` and `endpoint` is `http://127.0.0.1:7424/api/mcp`.

## Auth

Every `/api/mcp` request needs `Authorization: Bearer <harness JWT>`. Verification uses `jose` `createRemoteJWKSet` against `HARNESS_JWKS_URL` and allows only EdDSA. The token must have `iss` = `HARNESS_ISSUER` (default `hai-harness`), `aud` = `HARNESS_CONNECTOR_ID` (default `google-ads-helper`), a future `exp`, a new `jti`, `tid` = `hai`, and `scp` covering the tool. Failures use the spec error codes and do not echo the token.

When `HARNESS_LOCAL_TOKEN` is set, the request must also send `X-HAI-Local-Token`. Leave it unset on Vercel; remote connectors use the JWT only.

## Tools

All tools are `access: "read"`. `gads.clients.list` and `gads.clients.get` return the brand profiles already in the app. They do not return agency notes.

Hosting tools call the harness accounts API for the shared `vercel` account, then return `UNSUPPORTED`. They do not invent deployments, analytics, speed, logs, or errors. A revoked account returns `ACCOUNT_REVOKED`. Log and error text in the output schema is wrapped as `{ "_untrusted": true, "text": "..." }` so a future adapter cannot return raw log lines unmarked. Recorded examples live in `fixtures/hosting.json` and are schema checks only.

There are no write tools.

## Toggle

`POST /api/mcp/admin/toggle` accepts a harness-signed toggle event. `sig` is a compact JWS (EdDSA) whose payload is the canonical JSON of the event without `sig` (sorted keys, no extra whitespace). The connector starts disabled. A restart keeps the last valid event in `mcp/state/toggles.json` when that directory is writable. On Vercel the disk is not shared, so a cold instance stays disabled until the harness sends the toggle again.

## Health

`GET /api/mcp/healthz` returns `{ status, version, checks }`. `version` is the connector package version. The site footer shows the app version separately.
