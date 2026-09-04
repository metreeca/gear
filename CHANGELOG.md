# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/metreeca/gear/commits/main)

### Added

- `bind` accepts an asynchronous implementation, so that a facility whose construction depends on a value only another
  service can supply, such as a client keyed from a secret vault, is still resolved by a synchronous lookup

### Changed

- `executor` constructs bound implementations as the execution opens, in binding order, rather than on first lookup,
  awaiting the asynchronous ones before handing the job control
- service factories must now construct all or nothing, rolling back whatever they had already done when they let an
  error through: a construction reaching a bound service the preparation pass has yet to prepare is unwound where it
  stands and run again from the start once that one is ready
- `crawl` takes its feeder as a task over the URLs of a level rather than as a function over a single URL, leaving how
  many URLs are retrieved at a time to the tasks already at hand: a forked feeder retrieves several at once, an unforked
  one retrieves them in turn
- `untag` tells a paragraph `div` from the wrappers a page is laid out with, keeps a comment as a word boundary, and
  renders a run of `br` as the blank line a paragraph is often split with, so that the markdown a page renders to reads
  as its text does

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
