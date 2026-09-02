# @metreeca/gear

Ready-made tasks and shared services for ETL jobs.

**@metreeca/gear** brings ready-made [@metreeca/flow](https://github.com/metreeca/flow) tasks for acquiring data from
external sources and converting it into the values a pipeline works on. The tasks run under a pluggable job executor,
which supplies the shared services they draw on.

- **Ready-Made Tasks**: retrieval and parsing for the usual interchange formats, chaining alongside any other task
- **Shared Services**: the working space, secrets and caches a run needs, built on demand and released as it ends
- **Custom Bindings**: a stubbed, throttled or cached implementation swapped in for a run, leaving the job untouched
- **Minimal Footprint**: one package per input type, each pulling in only the libraries that type needs

> [!IMPORTANT]
>
> Pipelines are server-side workloads targeting [Node.js](https://nodejs.org/) 22 or later, relying on facilities such
> as the filesystem, the process environment and `fetch`. The packages are not intended for the browser.

# Installation

```shell
npm install @metreeca/gear           # job execution runtime and shared services
npm install @metreeca/gear-<type>    # task package, one per input type
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

Install the core package, then add a task package for each input type the pipeline handles. Task packages are
self-contained leaves, each pulling in only the libraries its own input type needs.

| Package               | Description                               |
|-----------------------|-------------------------------------------|
| [@metreeca/gear]      | Job execution runtime and shared services |
| [@metreeca/gear-url]  | URL processing tasks                      |
| [@metreeca/gear-json] | JSON processing tasks                     |
| [@metreeca/gear-xml]  | XML and HTML processing tasks             |
| [@metreeca/gear-csv]  | CSV processing tasks                      |

[@metreeca/gear]: https://metreeca.github.io/gear/modules/_metreeca_gear.html

[@metreeca/gear-url]: https://metreeca.github.io/gear/modules/_metreeca_gear-url.html

[@metreeca/gear-json]: https://metreeca.github.io/gear/modules/_metreeca_gear-json.html

[@metreeca/gear-xml]: https://metreeca.github.io/gear/modules/_metreeca_gear-xml.html

[@metreeca/gear-csv]: https://metreeca.github.io/gear/modules/_metreeca_gear-csv.html

# Usage

> [!NOTE]
>
> Each package documents its own API in its README and API reference; for complete coverage, see the
> [API reference](https://metreeca.github.io/gear/).

A job binds the services it relies on, then drives a [@metreeca/flow](https://github.com/metreeca/flow) feed through the
tasks provided by the input packages:

```ts
import { bind, executor, service } from "@metreeca/gear";
import { createDotVault, createVault } from "@metreeca/gear/vault";
import { csv } from "@metreeca/gear-csv";
import { fetch } from "@metreeca/gear-url";
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
