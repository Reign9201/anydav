# Security policy

## Supported versions

`anydav` is pre-1.0. Security fixes land on the latest `0.x` release; older versions are not maintained.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Use GitHub's private vulnerability reporting:

https://github.com/Reign9201/anydav/security/advisories/new

Include the affected version, runtime, a minimal reproduction, and the impact. Do not include real credentials; use a local test server or redacted values.

## Scope

Reports are especially welcome for:

- credential leakage (URLs, logs, errors, crash reports);
- path traversal or URL confusion in path/href handling;
- `Destination` rewriting or SSRF issues in the browser proxy example;
- TLS verification bypasses;
- provider detection that sends credentials to the wrong host;
- XML parsing issues (entity expansion, malformed input).

## Design notes

- Basic auth is sent as an `Authorization` header. HTTPS is required for any real account.
- Credentials embedded in `baseUrl` are rejected.
- The SDK does **not** encrypt payloads. Sensitive data must be encrypted by the application before upload.
- The browser proxy in `examples/node-proxy.mjs` is a development example. Before deployment, add caller authentication, pin the upstream account, restrict methods and paths, and cap request bodies.
- Provider presets contain public endpoint facts, not secrets. Verification status is documented in `docs/verification.md`.
