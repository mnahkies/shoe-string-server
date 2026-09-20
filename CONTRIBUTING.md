# Contributing

Read [README.md](README.md) for the CLI's configuration and operational model. This guide covers working on the source; [AGENTS.md](AGENTS.md) adds implementation guardrails for coding agents.

## Contents

* [Development setup](#development-setup)
* [Checks and tests](#checks-and-tests)
  * [Unit-test conventions](#unit-test-conventions)
  * [E2E prerequisites and side effects](#e2e-prerequisites-and-side-effects)
  * [Security scanning](#security-scanning)
* [Code style and generated files](#code-style-and-generated-files)
* [Opening a pull request](#opening-a-pull-request)

## Development setup

Install [mise](https://mise.jdx.dev/), clone the repository, and run these commands from the checkout root:

```sh
mise install
mise exec -- pnpm ci
```

`mise.toml` and `mise.lock` define the toolchain; `package.json` pins `pnpm`. Always `pnpm` rather than `npx`. If mise is activated in your shell, you can omit `mise exec --` from the commands below.

Build and run the CLI:

```sh
mise exec -- pnpm build
mise exec -- node dist/cli.mjs --help
```

The build runs TypeScript typechecking (`noEmit`) and then bundles `src/cli.ts` to `dist/cli.mjs` with `tsdown`.

## Checks and tests

| Command (prefix with `mise exec --` as needed) | Purpose                                                                      |
|------------------------------------------------|------------------------------------------------------------------------------|
| `pnpm run build`                               | Type-check and bundle the CLI.                                               |
| `pnpm run test:unit`                           | Run unit tests only.                                                         |
| `pnpm run test:e2e`                            | Run real container/SELinux integration tests; read the warnings below first. |
| `pnpm run test`                                | Run all tests, including e2e.                                                |
| `pnpm lint`                                    | Apply Biome fixes across the repository; review the resulting diff.          |
| `pnpm lint:ci`                                 | Check with Biome, treating warnings as errors; does not apply fixes.         |
| `pnpm lint:duplication`                        | Run the configured jscpd duplication report.                                 |
| `pnpm generate:types`                          | Fetch the upstream Compose schema and regenerate its TypeScript definitions. |
| `pnpm generate:toc`                            | Generate table of contents in markdown files.                                |

For ordinary code changes, start with the relevant unit tests, then run `pnpm build`, `pnpm run lint`, `pnpm test:unit`

### Unit-test conventions

* Place tests beside their implementation as `*.test.ts`; use Vitest's `describe`, `it`, `expect`, and `vi` helpers.
* Use `InMemoryFsAdaptor` with `setFsAdaptor` / `resetFsAdaptor` for filesystem-dependent behavior. Reuse the factories in `src/testing/compose-fixture.ts` rather than duplicating large fixtures.
* Mock `zx` subprocess execution or inject the existing command/decryption callbacks. Unit tests must not start containers, decrypt deployment secrets, or mutate a real configuration repository.
* Restore mocks, environment changes, working directories, and filesystem adaptors after each test.
* For bug fixes, add a focused regression test and show that it fails before the fix and passes afterward. Cover failure cases as well as success paths when changing validation, secret handling, target selection, or orchestration.

### E2E prerequisites and side effects

**Use a disposable Linux host/VM and a disposable checkout, not a production container engine.** The suite in `e2e/test.e2e.ts` is not isolated merely because it passes `--data-dir=e2e`:

* SELinux must support the fixture policy. Tests unconditionally assert filesystem labels and process context, including the hello service's `s0:c100,c203,c204` category and UID/GID `2000:2000`.
* Fixtures use fixed container names, the external network `main`, and loopback ports `8080` and `8081`. Keep those resources free; do not run fixture suites concurrently against the same engine. Images may need to be pulled or built.
* The hooks supply their own public test-only `SOPS_AGE_KEY`. You do not need production secrets or a personal decryption key for these fixtures.
* Tests write and remove `e2e/data/hello/write.txt`, regenerate overlays/proxy configuration, and exercise bind-mount relabeling. Review fixture changes afterward; do not blindly discard existing work.
* Teardown calls untargeted `down`, teardown errors are only logged as warnings, so passing tests do not guarantee containers were cleaned up. Inspect remaining resources in the disposable environment and clean up only those you own.

After preparing that environment:

```sh
mise exec -- pnpm test:e2e
```

### Security scanning

We use several security tools to help prevent vulnerabilities from being introduced, particularly from a supply-chain pespective:

* [zizmor](https://docs.zizmor.sh/) scans our github actions for misconfigurations
  * run locally with `mise run zizmor`
* [trivy](https://trivy.dev/) scans our `pnpm-lock.yaml` for known vulnerabilities in dependencies
  * run locally with `mise run trivy`

These block installing dependencies and running the build in CI.

We have two additional mise security tasks that aren't yet integrated into CI:

* `mise run trufflehog`
* `mise run gitleaks`

## Code style and generated files

Follow surrounding TypeScript/ESM code and `biome.jsonc`: two-space indentation, double quotes, semicolons only as needed, and no object bracket spacing. Local imports use `.ts` extensions.
Use `pnpm run lint` to reformat and auto-fix lint errors where possible.

Keep application filesystem access behind `FsAdaptor`, configuration parsing in the existing Zod schemas, and subprocess calls in the established `zx` style.
Use tagged-template interpolation for arguments rather than constructing executable shell strings. See [AGENTS.md](AGENTS.md) for invariants to preserve.

`src/generated/types/docker-compose.ts` is generated by `scripts/generate-compose-types.ts`. When intentionally updating it, run:

```sh
mise exec -- pnpm generate:types
```

The generator fetches a moving upstream Compose schema from the `compose-spec/compose-go` main branch, so it needs network access and can produce unrelated schema changes.
Review the full diff, then type-check and run relevant tests. Put project-specific extensions in `src/types/docker-compose-extensions.ts`, not the generated definitions.
Do not regenerate types for unrelated changes, and do not hand-edit generated overlays or `haproxy.cfg`; change their inputs instead.

## Opening a pull request

* Describe the problem, intended behavior, and any compatibility or operational impact. Keep unrelated refactors and dependency upgrades separate.
* Include focused tests for behavior changes and list actual verification results, including environmental blockers.
* Update README examples when CLI options, configuration fields, or runtime requirements change; update contributor/agent guidance when workflows change.
* Review the diff for unexpected generated output, lockfile changes, fixture data, private keys, tokens, and decrypted values. Public e2e credentials must never become deployment credentials.
* For bug reports, include tool/runtime versions and a minimal redacted configuration plus reproduction steps. Never paste the output of `secrets` without `--list`.
