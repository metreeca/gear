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

`@metreeca/flow` is a standalone, general-purpose monorepo collecting the data extraction and processing pipeline
framework core and its extension packages, each sitting directly under `packages/` (for example `packages/flow/`).

# References

- [@metreeca/core](https://github.com/metreeca/core) - Core utilities and shared types
- [@metreeca/pipe](https://github.com/metreeca/pipe) - Composable async iterable processing
- [@metreeca/tape](https://github.com/metreeca/tape) - Simplified facade for the LogTape logging framework

# NPM Scripts

- **`npm run clean`** - Remove build artifacts and dependencies (dist, docs, node_modules)
- **`npm run setup`** - Install dependencies
- **`npm run build`** - Build TypeScript and generate TypeDoc documentation
- **`npm run check`** - Run Vitest test suite
- **`npm run proof`** - Build documentation and start static server

# Package Layout

The root `package.json` `workspaces` glob (`packages/*`) covers the framework packages, each in its own directory
immediately under `packages/` (for example `packages/flow`).

# Service Resolution

Calls to `service()` are **NEVER** inlined into a larger expression: always bind the resolved instance to a `const` on
a line of its own, then use it. This keeps the resolution point visible, since it depends on the enclosing execution
rather than on the surrounding expression.

```typescript
const path = service(getPath); // ✅
const parameters = lazy(async () => parseEnv(await readFile(resolve(path, file), "utf-8")));

const parameters = lazy(async () => parseEnv(await readFile(resolve(service(getPath), file), "utf-8"))); // ❌
```

# Testing

The root `vitest.config.ts` aliases all workspace `@metreeca/flow*` packages to their TypeScript source via regex, so
vitest transpiles directly from `src/` without requiring a prior build step. The resolver maps each `@metreeca/flow*`
specifier to `packages/<package>/src`; the aliases are convention-based and require no manual updates when adding
packages or subpath exports.

# Git

This is a single monorepo: every package lives under `packages/` within one repository. Contrary to the general "avoid
`git -C`" guidance in the global tool rules and the `version-manager` skill's Git Command Rules, `git -C <package-path>`
is **perfectly acceptable** here and preferred for scoping a command to a package subtree, since it lets commands be
pre-authorised in bulk. This override applies to `git -C` only; the other Git Command Rules (no command chaining, stage
files by name) still hold.

# Version Management

All workspace packages share the same version, defined in the root `package.json` `version` field. When bumping the
version, cascade the change to all `packages/**/package.json` — both the package `version` field and any internal
`@metreeca/flow*` dependency ranges.

When adding, removing, or renaming packages, update the package table in the root `README.md` Usage section to match.

# Documentation Synchronization

For each package, the following descriptions must be kept in sync:

- `package.json`: `description` field
- `README.md`: first paragraph after badges
- module doc definition line
- GitHub repository "About" section (when publishing)
