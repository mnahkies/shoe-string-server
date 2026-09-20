# Agent guidance

This file applies throughout the repository. Read [README.md](README.md) for user-facing behavior and [CONTRIBUTING.md](CONTRIBUTING.md) for setup and verification details.
Keep changes scoped to the requested task and preserve unrelated local work.

## Contents

* [Repository map](#repository-map)
* [Working conventions](#working-conventions)
* [Behavioral invariants](#behavioral-invariants)
* [Verification and safety](#verification-and-safety)

## Repository map

| Path                                     | Responsibility                                                                                                   |
|------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `src/cli.ts`                             | Commander registration and global options; actual executable name is `shoe-string`.                              |
| `src/config.ts`                          | Strict cluster schema, path resolution, and subprocess environment construction.                                 |
| `src/cmd`                                | Individual cli command implementations                                                                           |
| `src/generated/types/docker-compose.ts`  | Generated upstream Compose definitions; do not hand-edit.                                                        |
| `src/lib/compose-files/`                 | Compose discovery/validation, target selection, volume preparation, dependency ordering, and generated overlays. |
| `src/lib/file-system/`                   | `FsAdaptor`, real filesystem implementation, and in-memory implementation.                                       |
| `src/lib/networks/`                      | External bridge-network provisioning.                                                                            |
| `src/lib/proxy/`                         | Proxy discovery, routing bindings, and HAProxy template rendering.                                               |
| `src/lib/self-update/`                   | Helpers to support self-update functionality.                                                                    |
| `src/lib/secrets.ts`                     | SOPS decryption, flattening, and filtering.                                                                      |
| `src/testing/`                           | Shared Compose fixture builders for unit tests.                                                                  |
| `src/types/docker-compose-extensions.ts` | Handwritten project-specific Compose types and schemas.                                                          |
| `src/utils`                              | General utility functions                                                                                        |
| `e2e/`                                   | Real container/SELinux tests and public test fixtures.                                                           |
| `scripts/`                               | Build scripts.                                                                                                   |

## Working conventions

* Use the pinned mise toolchain and pnpm from `package.json`; do not introduce another package-manager lockfile. See CONTRIBUTING for installation commands.
* Match surrounding TypeScript/ESM and Biome style: two spaces, double quotes, `.ts` local imports, minimal semicolons, no object bracket spacing. Avoid unrelated reformatting.
* Use `getFsAdaptor()` for application filesystem operations rather than importing `node:fs/promises` directly. Extend the adaptor and both implementations together if a new filesystem operation is needed.
* Use existing Zod schemas for runtime validation. Compose parsing intentionally validates consumed fields while preserving other Compose fields; do not strip unknown Compose properties when processing files.
* Keep subprocess arguments in `zx` tagged-template interpolation. Never log decrypted secrets or add real credentials to fixtures, examples, or tests.
* Do not hand-edit `dist/` or `node_modules/`; use the build and package manager for those outputs. Regenerate upstream types only for an intentional schema update; project extensions belong in the handwritten types file. Generated deployment overlays and `haproxy.cfg` must be changed through their source inputs.

## Behavioral invariants

* Data-directory precedence is CLI `--data-dir`, then `DATA_BASE_PATH`, then `cwd`. Configuration-relative paths resolve against that root, not against the source checkout.
* `buildProcessEnv` currently lets inherited process variables override decrypted secrets, which override cluster environment. Preserve this behavior unless the task explicitly changes it; its nearby comment is not a substitute for reading the implementation.
* Loaded Compose specifications are deeply frozen. Preserve source YAML/comments by writing separate generated overlays rather than rewriting user-authored files. Compose and HAProxy outputs use temporary-file-plus-rename writes; retain atomic replacement.
* Application discovery is recursive, sorted, and excludes `overlays` directories. Targets select discovered Compose files, are deduplicated, and fail when unmatched; they are not Compose service selectors.
* `up` starts targets in `x-requires` dependency order (independents in sorted order); `down` stops them in reverse. Dependencies outside the target selection are never started or stopped by these commands; `up` warns when such a dependency isn't already running, and circular dependencies abort with an error.
* `up` creates required external networks and generates all discovered proxy configurations before starting any selected container. After startup it reloads only proxies whose own Compose file was started; `reload-proxy` explicitly reloads all discovered proxies.
* Proxy names and proxy container names must be unique. The four HAProxy template placeholders must each occur exactly once. Preserve proxy-specific routing and hand-authored template block handling.
* Secret flattening rejects arrays, invalid environment-variable names, and collisions. Preserve shell escaping when formatting exports, and keep key-only listing separate from plaintext value output.
* Targeted `down` must not prune networks. Untargeted `down` currently performs engine-wide pruning; never broaden destructive behavior silently.

## Verification and safety

* For code changes, start with a focused test, for example `mise exec -- pnpm exec vitest run --project unit src/config.test.ts`. Use `pnpm test:unit`, `pnpm build`, and `pnpm lint:ci` for broader checks, with the same mise prefix if needed.
* Place unit tests beside their implementation. Reuse `InMemoryFsAdaptor` and `src/testing/compose-fixture.ts`; mock/inject external commands and decryption. Restore adaptors, mocks, environment, and cwd after tests.
* For bug fixes, demonstrate a failing regression test before changing behavior and rerun it afterward. Do not disable or weaken tests to hide failures. Report failures and verification limits honestly.
* Documentation-only changes do not require builds or tests. Check paths, examples, scripts, and behavior against their source definitions instead.
* `pnpm lint` applies fixes; prefer `pnpm lint:ci` for read-only checking. Do not regenerate upstream types or run broad auto-fixes as incidental cleanup.
* **Do not run `bin/shoe-string` as a harmless help/check command:** it pulls Git updates, installs tools/dependencies, and builds. Use `mise exec -- node dist/cli.mjs --help` after an intentional build instead.
* **Do not default to `pnpm test` or unrestricted watch mode.** They include e2e tests. E2E invokes the self-updating wrapper, uses fixed container names/network/ports, requires SELinux, mutates fixture files, and runs engine-wide network pruning during teardown. Read CONTRIBUTING and use an explicitly approved disposable environment before running it.
* Never run deployment commands against a real configuration directory just to validate a change. `up`, `down`, `reload-proxy`, and `reconcile` have real filesystem/container/Git effects; `--data-dir` is not a sandbox.
* Summarize the change, actual checks and outcomes, and anything left unverified. Keep README, CONTRIBUTING, and this file aligned when changing public behavior or development workflows.
