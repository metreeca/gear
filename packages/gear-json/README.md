# @metreeca/gear-json

[![npm](https://img.shields.io/npm/v/@metreeca/gear-json)](https://www.npmjs.com/package/@metreeca/gear-json)

JSON processing tasks for [@metreeca/gear](https://github.com/metreeca/gear).

# Installation

```shell
npm install @metreeca/gear       # the job execution API
npm install @metreeca/gear-json  # this package
```

> [!IMPORTANT]
>
> Node.js 22 or later is required.

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

# Usage

| Task               | Description        |
|--------------------|--------------------|
| [`json()`][json]   | JSON parser        |
| [`jpath()`][jpath] | JSON path selector |

[json]: https://metreeca.github.io/gear/functions/_metreeca_gear-json.json.html

[jpath]: https://metreeca.github.io/gear/functions/_metreeca_gear-json.jpath.html

# Support

- open an [issue](https://github.com/metreeca/gear/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/gear/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/gear?tab=Apache-2.0-1-ov-file) file for details.
