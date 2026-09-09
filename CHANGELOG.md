# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/metreeca/gear/compare/v0.2.0...HEAD)

## [0.2.0](https://github.com/metreeca/gear/compare/v0.1.1...v0.2.0) - 2026-09-09

### Added

- `@metreeca/gear-json` — JSON retrieval and selection tasks, exposing the `jpath` accessor for addressing a document
  by path, and the selection combinators narrowing what is read to the values a consumer expects; the package was
  first published as `0.1.0` without a release entry and is recorded here
- `@metreeca/gear-xml` — XML and HTML retrieval and extraction tasks, exposing the document parsers, XPath addressing
  over parsed trees, the main content extractor and the markup to markdown converter; the package was first published
  as `0.1.0` without a release entry and is recorded here
- `bind` accepts an asynchronous implementation, so that a facility whose construction depends on a value only another
  service can supply, such as a client keyed from a secret vault, is still resolved by a synchronous lookup
- `crawl` takes a three-step overload, separating the seed, the retrieval and the extraction so that each step is
  supplied as a task of its own
- `@metreeca/gear-json` selects values already at hand rather than only those it retrieves, narrows what it selects to
  the types a consumer expects, and admits only the values a JSON document may state
- `@metreeca/gear-json` retains only the values meeting the constraints a consumer states, reporting the rest
- `@metreeca/gear-xml` records the retrieval URL as an `xml:base` attribute, resolves references against a base the
  consumer states, and carries that base into the markdown frontmatter and the page its regions are handed over on
- `@metreeca/gear-xml` carries the page title alongside the extracted content, and weighs a page by its prose so that
  the region a reader would take as the content is the one extracted

### Changed

- tasks align with the `@metreeca/flow` feed API, so that a task composes with the feed combinators as any other does
- `crawl` is specialised to URLs, and `@metreeca/gear-url` names the seed and link type `URLLike`
- every task surfaces the processing engine it runs on, so that a consumer can reach it rather than rebuild it
- `@metreeca/gear-json` names the IRI narrowing `link`
- fetch and parser tasks exchange responses, so that a parsed document carries what its retrieval reported
- `@metreeca/gear-xml` renders items and emphasis as a reader sees them in the markdown it produces
- requires `@metreeca/core` `^0.10.0`, `@metreeca/flow` `^0.10.0`, `@metreeca/http` `^0.2.0` and `@metreeca/tape`
  `^0.10.1`

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

### Fixed

- `LICENSE` is included in every published workspace package, so that the licence travels with the code
- `@metreeca/gear-url` sources `Fetch` from `@metreeca/http` rather than from `@metreeca/core`
- `@metreeca/gear-xml` keeps the XPath namespace declarations in the compiled expression, so that a prefixed
  expression addresses the tree it was written against

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
