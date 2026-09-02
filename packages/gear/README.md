# @metreeca/gear

[![npm](https://img.shields.io/npm/v/@metreeca/gear)](https://www.npmjs.com/package/@metreeca/gear)

Job execution runtime and shared services for [@metreeca/gear](https://github.com/metreeca/gear).

A consumer sets up an executor, binding the services a job relies on to the implementations chosen for the run. The
executor runs the job, whose tasks resolve each service through a locator, naming it by its default factory rather than
importing a concrete implementation.

Binding a different implementation leaves the job unchanged: the same job runs against the live process surroundings,
against stubs, or against any custom service honouring the same contracts.

Service instances are constructed on first use, shared across the job, and, where they implement a disposal protocol,
disposed as it ends, so concurrent or repeated runs share nothing.

# Installation

```shell
npm install @metreeca/gear
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
| [@metreeca/gear][gear]        | Job executor and service locator |
| [@metreeca/gear/space][space] | Working space access             |
| [@metreeca/gear/vault][vault] | Sensitive parameter lookup       |
| [@metreeca/gear/cache][cache] | Bulk content caching             |

[gear]: https://metreeca.github.io/gear/modules/_metreeca_gear.index.html

[space]: https://metreeca.github.io/gear/modules/_metreeca_gear.space.html

[vault]: https://metreeca.github.io/gear/modules/_metreeca_gear.vault.html

[cache]: https://metreeca.github.io/gear/modules/_metreeca_gear.cache.html

# Support

- open an [issue](https://github.com/metreeca/gear/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/gear/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/gear?tab=Apache-2.0-1-ov-file) file for details.
