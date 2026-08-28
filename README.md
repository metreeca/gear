# @metreeca/flow

A lightweight TypeScript framework for data extraction and processing pipelines.

**@metreeca/flow** is a collection of ready-made [@metreeca/pipe](https://github.com/metreeca/pipe) tasks for
retrieving remote or local sources and parsing the usual interchange formats, plus the job executor those tasks draw
their shared services from. Key features include:

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
npm install @metreeca/flow           # job execution runtime and shared services
npm install @metreeca/flow-<type>    # task packages, among those listed above
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

Install the core package, then add a task package for each input type the pipeline handles. These are self-contained
leaf packages: each pulls in the core package transitively and only the libraries its own input type needs.

| Package                            | Description                               |
|------------------------------------|-------------------------------------------|
| [@metreeca/flow]                   | Job execution runtime and shared services |
| [@metreeca/flow-url]               | URL processing tasks                      |
| [@metreeca/flow-json] (*upcoming*) | JSON processing tasks                     |
| [@metreeca/flow-xml]  (*upcoming*) | XML and HTML processing tasks             |
| [@metreeca/flow-csv]               | CSV processing tasks                      |
| [@metreeca/flow-rdf]  (*upcoming*) | RDF processing tasks                      |
| [@metreeca/flow-ical] (*upcoming*) | iCalendar processing tasks                |

[@metreeca/flow]: https://metreeca.github.io/flow/modules/_metreeca_flow.html

[@metreeca/flow-csv]: https://metreeca.github.io/flow/modules/_metreeca_flow-csv.html

[@metreeca/flow-ical]: https://metreeca.github.io/flow/modules/_metreeca_flow-ical.html

[@metreeca/flow-json]: https://metreeca.github.io/flow/modules/_metreeca_flow-json.html

[@metreeca/flow-rdf]: https://metreeca.github.io/flow/modules/_metreeca_flow-rdf.html

[@metreeca/flow-url]: https://metreeca.github.io/flow/modules/_metreeca_flow-url.html

[@metreeca/flow-xml]: https://metreeca.github.io/flow/modules/_metreeca_flow-xml.html

# Usage

> [!NOTE]
>
> Each package documents its own API in its README and API reference; for complete coverage, see the
> [API reference](https://metreeca.github.io/flow/).

A job binds the services it relies on, then drives a [@metreeca/pipe](https://github.com/metreeca/pipe) feed through
the tasks provided by the input packages:

```ts
import { bind, executor, service } from "@metreeca/flow";
import { createDotVault, createVault } from "@metreeca/flow/vault";
import { csv } from "@metreeca/flow-csv";
import { fetch } from "@metreeca/flow-url";
import { pipe } from "@metreeca/pipe";
import { feed } from "@metreeca/pipe/feeds";
import { forEach } from "@metreeca/pipe/sinks";

await executor(

    bind(createVault, createDotVault)

)(async () => pipe(feed([await service(createVault)("data-url")])

    (fetch())
    (csv())

    (forEach(record => console.log(record)))

));
```

# Support

- open an [issue](https://github.com/metreeca/flow/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/flow/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/flow?tab=Apache-2.0-1-ov-file) file for details.
