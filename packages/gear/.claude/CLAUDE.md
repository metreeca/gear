# Service Modules

Each subpath module exposes a single facility resolved through the service locator. Its module doc definition line names
the capability the facility offers a consumer, as a noun phrase in the tone `@metreeca/core` uses for its own modules (
`Working space access.`, `Sensitive parameter lookup.`, `Bulk content caching.`), rather than the bare name of the
facility. It never restates what holds of every service, such as bindability, nor narrows the facility to one of the
implementations that may be bound to it. The `README.md` module table repeats that line verbatim, so the two must be
revised together.
