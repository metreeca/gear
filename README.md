# @metreeca/gear

Job executor and shared services for data pipelines.

**@metreeca/gear** runs [@metreeca/flow](https://github.com/metreeca/flow) pipelines as jobs and supplies the shared
services their tasks draw on. A job names the services it needs, and the executor provides them for the duration of the
run. Ready-made tasks come from the libraries built on top of it.

- **Job Executor**: a pipeline run as a job, with every service it uses scoped to that run
- **Shared Services**: the working space, secrets and caches a run needs, built for the run and released as it ends
- **Custom Bindings**: a stubbed, throttled or cached implementation swapped in for a run, leaving the job untouched
- **Platform Bindings**: service implementations for cloud platforms, one package per platform, bound in place of the
	local defaults

> [!IMPORTANT]
>
> Pipelines are server-side workloads targeting [Node.js](https://nodejs.org/) 22 or later, relying on facilities such
> as the filesystem, the process environment and `fetch`. The packages are not intended for the browser.

# Ecosystem

**@metreeca/gear** focuses on job execution and shared services. Data access, content handling and model work belong to
dedicated task libraries. Together they form a complete, modular toolkit for building data pipelines: every library
runs under the same executor and draws on the same services.

| Package                | Description                                                               |
|------------------------|---------------------------------------------------------------------------|
| **@metreeca/gear**     | Job executor and shared services for data pipelines                       |
| [**@metreeca/pipe**][] | Ready-made tasks for retrieving and persisting data from external sources |
| [**@metreeca/mime**][] | Ready-made tasks for parsing and serialising content by media type        |
| [**@metreeca/muse**][] | Ready-made tasks and shared services for AI jobs                          |

[**@metreeca/pipe**]: https://github.com/metreeca/pipe

[**@metreeca/mime**]: https://github.com/metreeca/mime

[**@metreeca/muse**]: https://github.com/metreeca/muse

# Installation

```shell
npm install @metreeca/gear              # job executor and shared services
npm install @metreeca/gear-<platform>   # service package, one per platform
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

Install the core package, then add a service package for each platform the job runs on. Service packages are
self-contained leaves, each pulling in only the client libraries its own platform needs.

| Package              | Description                          |
|----------------------|--------------------------------------|
| [@metreeca/gear]     | Job executor and shared services     |
| [@metreeca/gear-gcp] | Google Cloud service implementations |

[@metreeca/gear]: https://metreeca.github.io/gear/modules/_metreeca_gear.html

[@metreeca/gear-gcp]: https://metreeca.github.io/gear/modules/_metreeca_gear-gcp.html

# Usage

> [!NOTE]
>
> Each package documents its own API in its README and API reference; for complete coverage, see the
> [API reference](https://metreeca.github.io/gear/).

A job binds the services it relies on, then drives a [@metreeca/flow](https://github.com/metreeca/flow) feed through the
tasks provided by the ecosystem libraries:

```ts
import { bind, executor, service } from "@metreeca/gear";
import { createDotVault, createVault } from "@metreeca/gear/vault";
import { csv } from "@metreeca/mime-csv";
import { fetch } from "@metreeca/pipe-url";
import { pipe } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { each } from "@metreeca/flow/sinks";

await executor(
	bind(createVault, createDotVault)
)(async () => pipe(items([await service(createVault)("data-url")])
	(fetch())
	(csv())
	(each(record => console.log(record)))
));
```

# Support

- open an [issue](https://github.com/metreeca/gear/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/gear/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/gear?tab=Apache-2.0-1-ov-file) file for details.
