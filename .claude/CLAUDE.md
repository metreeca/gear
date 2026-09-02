> [!CAUTION]
>
> - **ONLY** modify code when explicitly requested or clearly required.
> - **NEVER** make unsolicited changes or revert **unrelated** user edits.
> - **ALWAYS** monitor IDE diagnostics when working on a file

> [!CAUTION]
> Activating and following skill guidance is **MANDATORY** for every task. Before starting any work, identify and
> activate all relevant skills. Skill instructions are binding and override default behaviours. When in doubt about
> whether skill guidance is current, relevant skills MUST be reloaded.

# Overview

`@metreeca/gear` is a standalone, general-purpose monorepo collecting the data extraction and processing pipeline
framework core and its extension packages, each sitting directly under `packages/` (for example `packages/gear/`).

# References

- [@metreeca/core](https://github.com/metreeca/core) - Core utilities and shared types
- [@metreeca/flow](https://github.com/metreeca/flow) - Composable async iterable processing
- [@metreeca/tape](https://github.com/metreeca/tape) - Simplified facade for the LogTape logging framework

# NPM Scripts

- **`npm run clean`** - Remove build artifacts and dependencies (dist, docs, node_modules)
- **`npm run setup`** - Install dependencies
- **`npm run build`** - Build TypeScript and generate TypeDoc documentation
- **`npm run check`** - Run Vitest test suite
- **`npm run proof`** - Build documentation and start static server

# Package Layout

The root `package.json` `workspaces` glob (`packages/*`) covers the framework packages, each in its own directory
immediately under `packages/` (for example `packages/gear`).

# Shared Utilities

Reach for `@metreeca/core` before writing a helper: its `strings`, `numbers`, `arrays` and `structures` entry points
already cover text tidying, escaping, splitting and templating alongside the common collection and value operations. A
hand-rolled equivalent duplicates tested code and drifts from it, missing the edge cases the shared one handles.

Keep a local helper only where the shared one genuinely doesn't fit, and record in its doc comment what the difference
is, so the next reader doesn't take it for an oversight.

# Service Resolution

Calls to `service()` are **NEVER** inlined into a larger expression: always bind the resolved instance to a `const` on a
line of its own, then use it. This keeps the resolution point visible, since it depends on the enclosing execution
rather than on the surrounding expression.

```typescript
const path = service(getPath); // ✅
const parameters = lazy(async () => parseEnv(await readFile(resolve(path, file), "utf-8")));

const parameters = lazy(async () => parseEnv(await readFile(resolve(service(getPath), file), "utf-8"))); // ❌
```

# Testing

The root `vitest.config.ts` aliases all workspace `@metreeca/gear*` packages to their TypeScript source via regex, so
vitest transpiles directly from `src/` without requiring a prior build step. The resolver maps each `@metreeca/gear*`
specifier to `packages/<package>/src`; the aliases are convention-based and require no manual updates when adding
packages or subpath exports.

# Version Management

All workspace packages share the root `package.json` version. Beyond the `version` fields the release flow already
cascades, update the internal `@metreeca/gear*` dependency ranges in every `packages/**/package.json` to match.

When adding, removing, or renaming packages, update the package table in the root `README.md` Usage section to match.
