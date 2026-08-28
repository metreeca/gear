# @metreeca/gear

A lightweight TypeScript framework for data extraction and processing pipelines.

**@metreeca/gear** is a collection of ready-made [@metreeca/flow](https://github.com/metreeca/flow) tasks for retrieving
remote or local sources and parsing the usual interchange formats, plus the job executor those tasks draw their shared
services from. Key features include:

- **Ready-Made Tasks**: retrieval and parsing tasks chaining into a pipe alongside any other task
- **Shared Services**: facilities covering the surroundings a run works against, such as its working space
- **Custom Bindings**: any service replaced for the duration of a run, without altering the code drawing on it
- **Scoped Lifecycle**: service instances constructed on first use, shared across a run, and, where they implement a
  disposal protocol, disposed as it ends
- **Minimal Footprint**: install one package per input type, each pulling in only the libraries that type needs

> [!IMPORTANT]
>
> Pipelines are server-side workloads targeting [Node.js](https://nodejs.org/) 22 or later, relying on facilities such
> as the filesystem, the process environment and `fetch`. The packages are not intended for the browser.

# Installation

```shell
npm install @metreeca/gear           # job execution runtime and shared services
npm install @metreeca/gear-<type>    # task packages, among those listed above
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

Install the core package, then add a task package for each input type the pipeline handles. These are self-contained
leaf packages: each pulls in the core package transitively and only the libraries its own input type needs.

| Package                            | Description                               |
|------------------------------------|-------------------------------------------|
| [@metreeca/gear]                   | Job execution runtime and shared services |
| [@metreeca/gear-url]               | URL processing tasks                      |
| [@metreeca/gear-json] (*upcoming*) | JSON processing tasks                     |
| [@metreeca/gear-xml]  (*upcoming*) | XML and HTML processing tasks             |
| [@metreeca/gear-csv]               | CSV processing tasks                      |
| [@metreeca/gear-rdf]  (*upcoming*) | RDF processing tasks                      |
| [@metreeca/gear-ical] (*upcoming*) | iCalendar processing tasks                |

[@metreeca/gear]: https://metreeca.github.io/gear/modules/_metreeca_gear.html

[@metreeca/gear-csv]: https://metreeca.github.io/gear/modules/_metreeca_gear-csv.html

[@metreeca/gear-ical]: https://metreeca.github.io/gear/modules/_metreeca_gear-ical.html

[@metreeca/gear-json]: https://metreeca.github.io/gear/modules/_metreeca_gear-json.html

[@metreeca/gear-rdf]: https://metreeca.github.io/gear/modules/_metreeca_gear-rdf.html

[@metreeca/gear-url]: https://metreeca.github.io/gear/modules/_metreeca_gear-url.html

[@metreeca/gear-xml]: https://metreeca.github.io/gear/modules/_metreeca_gear-xml.html

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
import { feed } from "@metreeca/flow/feeds";
import { forEach } from "@metreeca/flow/sinks";

await executor(

    bind(createVault, createDotVault)

)(async () => pipe(feed([await service(createVault)("data-url")])

    (fetch())
    (csv())

    (forEach(record => console.log(record)))

));
```

# Support

- open an [issue](https://github.com/metreeca/gear/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/gear/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/gear?tab=Apache-2.0-1-ov-file) file for details.
