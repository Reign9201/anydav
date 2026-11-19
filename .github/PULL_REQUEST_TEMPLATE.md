## What changed

<!-- A short description, the motivation, and the affected provider(s). -->

## Checklist

- [ ] `node scripts/generate.mjs` was run if `spec/providers.json` changed, and generated files are committed.
- [ ] `npm test` passes.
- [ ] `cd dart && dart analyze && dart test` passes.
- [ ] New protocol behavior has a test (in-memory server, XML fixture or path fixture).
- [ ] Provider verification status is honest (`live` / `documented` / `unverified`).
- [ ] No credentials, tokens, personal hostnames or `.env` files are included.
- [ ] Docs/changelog updated when the public API or provider matrix changes.

## Provider changes

<!-- Fill this in only if the PR adds or corrects a provider. -->

- Provider id:
- Endpoint verified:
- Auth / password kind:
- Official docs:
