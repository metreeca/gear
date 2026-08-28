# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/metreeca/gear/commits/main)

## [0.1.1](https://github.com/metreeca/gear/compare/v0.1.0...v0.1.1) - 2026-08-28

### Fixed

- `executor` no longer fails on the declared Node.js 22 baseline when a job error meets a disposal error: the failures
  are now collected into an `AggregateError`, in the order they were raised, rather than into `SuppressedError`s, which
  that runtime does not provide

## [0.1.0](https://github.com/metreeca/gear/releases/tag/v0.1.0) - 2026-08-28

Initial release of the ETL job framework: ready-made tasks for retrieving remote or local sources and parsing the usual
interchange formats, plus the job executor those tasks draw their shared services from. Task packages are self-contained
leaves, each pulling in the core package transitively and only the libraries its own input type needs.

- `@metreeca/gear` — job execution runtime and shared services, exposing the executor and the `space`, `vault` and
  `cache` service modules
- `@metreeca/gear-csv` — CSV processing tasks
- `@metreeca/gear-url` — URL processing tasks
