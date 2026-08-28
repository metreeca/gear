# @metreeca/flow

[![npm](https://img.shields.io/npm/v/@metreeca/flow)](https://www.npmjs.com/package/@metreeca/flow)

Job execution runtime and shared services for [@metreeca/flow](https://github.com/metreeca/flow).

Provides the runtime for executing data extraction and processing jobs, together with the shared services they rely on.

A consumer sets up an executor, binding the services a job relies on to the implementations chosen for the run. The
executor runs the job, whose tasks resolve each service through a locator, naming it by its default factory rather
than importing a concrete implementation.

Binding a different implementation leaves the job unchanged. The same job runs against the live process surroundings,
against stubs, or against any custom service honouring the same contracts.

Service instances are constructed on first use, shared across the job, and, where they implement a disposal protocol,
disposed as it ends, so concurrent or repeated runs share nothing.

# Installation

```shell
npm install @metreeca/flow
```

> [!IMPORTANT]
>
> Node.js 22 or later is required.

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

# Usage

| Module                        | Description                      |
|-------------------------------|----------------------------------|
| [@metreeca/flow][flow]        | Job executor and service locator |
| [@metreeca/flow/space][space] | Working space access             |
| [@metreeca/flow/vault][vault] | Sensitive parameter lookup       |
| [@metreeca/flow/cache][cache] | Bulk content caching             |

[flow]: https://metreeca.github.io/flow/modules/_metreeca_flow.index.html

[space]: https://metreeca.github.io/flow/modules/_metreeca_flow.space.html

[vault]: https://metreeca.github.io/flow/modules/_metreeca_flow.vault.html

[cache]: https://metreeca.github.io/flow/modules/_metreeca_flow.cache.html

# Support

- open an [issue](https://github.com/metreeca/flow/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/flow/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/flow?tab=Apache-2.0-1-ov-file) file for details.
