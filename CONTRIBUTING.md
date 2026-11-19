# Contributing to anydav

Thanks for helping make WebDAV less painful. The most valuable contribution is usually **one new provider preset that is actually verified**, not a large refactor.

## Ways to contribute

- **Add or correct a provider** in `spec/providers.json`.
- **Report a bug** with the provider id, SDK version, runtime and `DavError.code` / HTTP status.
- **Improve tests** around protocol edge cases, paths, XML shapes or retries.
- **Port the SDK** to another language using the same registry and conformance fixtures.
- **Improve docs** — especially provider-specific notes and integration recipes.

## Adding a provider

1. Edit `spec/providers.json` and add one object to `providers`:
   - `id`: lowercase kebab-case, unique (`some-cloud`);
   - `name` / `nameZh`;
   - `category`: `consumer | nas | self-hosted | gateway | generic`;
   - `auth.scheme` and `auth.passwordKind`;
   - `capabilities`: use `null` when you are not sure — **do not guess**;
   - `verification`: `live | documented | unverified`.
2. Fill `baseUrl` when it is fixed, or `urlTemplate` with the supported placeholders:
   `{host}`, `{username}`, `{email}`, `{server}`, `{id}`, `{port}`, `{share}`.
3. Add known limits and quirks under `limits` / `quirks` (upload size, PROPFIND entry cap, request rate, special status codes).
4. Run:

```bash
node scripts/generate.mjs
```

This regenerates `src/providers.generated.ts`, `dart/lib/src/providers.generated.dart` and `docs/providers.md`. Commit all three.

5. Verify:

```bash
npm test
cd dart && dart analyze && dart test
```

6. If you have an account, run the real probe:

```bash
WEBDAV_URL=... WEBDAV_USER=... WEBDAV_PASSWORD=... \
node dist/src/cli.js test --provider <id> --write
```

Never paste real credentials into an issue or pull request. Redact URLs that contain personal hostnames.

## Verification levels

| Level | Meaning |
| --- | --- |
| `live` | Endpoint answered an unauthenticated `OPTIONS` with a WebDAV/Basic challenge, or a real account round-trip succeeded |
| `documented` | Endpoint/auth taken from official documentation |
| `unverified` | Community knowledge; the provider may have changed. Confirm in the provider app before relying on it |

Do not upgrade `unverified` to `documented` just to make the table look complete. A wrong preset is worse than a missing one.

## Code style

- TypeScript: strict mode, ES modules, no runtime dependencies. Keep `src/` portable across Node, browsers and React Native.
- Dart: `dart format`, `dart analyze` must be clean; prefer `final` locals and single quotes.
- Do not add a dependency without discussing it first. The SDK deliberately stays small.
- Public APIs need doc comments and a test.

## Pull request checklist

- [ ] `node scripts/generate.mjs` was run if `spec/providers.json` changed, and generated files are committed.
- [ ] `npm test` passes.
- [ ] `cd dart && dart analyze && dart test` passes.
- [ ] New protocol behavior has a test against the in-memory server or an XML/path fixture.
- [ ] Provider status reflects reality (`live` / `documented` / `unverified`).
- [ ] No credentials, tokens, personal hostnames or `.env` files are included.
- [ ] Docs updated when the public API or provider matrix changes.

## Commit messages

Use a short, imperative subject, optionally with a scope:

```
feat(providers): add InfiniCLOUD
fix(paths): keep literal %20 in file names
docs: explain AList permissions
test(client): cover stale parent retry
```

## Releases

Maintainers tag `vX.Y.Z`, update `CHANGELOG.md`, then publish:

```bash
npm publish --access public
cd dart && dart pub publish
```

The version in `package.json`, `dart/pubspec.yaml` and the changelog must match.
