---
title: XML Guidelines
description: Development guidelines and conventions for the XML and HTML processing tasks.
---

# References

- [XML 1.0](https://www.w3.org/TR/xml/) - W3C markup language definition
- [XPath 1.0](https://www.w3.org/TR/1999/REC-xpath-19991116/) - W3C path expression language, frozen since 1999
- [htmlparser2](https://github.com/fb55/htmlparser2) - Forgiving HTML and XML parser producing `domhandler` trees
- [domhandler](https://github.com/fb55/domhandler) - Node structure shared by both parser modes
- [xpathway](https://github.com/ursm/xpathway) - XPath 1.0 evaluator over a caller-supplied node structure

# Stack

Parse XML, parse HTML into the **same** node structure, evaluate XPath 1.0 against it. DOM compatibility is explicitly
**not** a requirement, and that exclusion is what makes the rest possible.

- `htmlparser2` parses HTML in its default mode and XML under `xmlMode`, and **both modes build the same `domhandler`
  classes**. Nothing is converted between formats.

- `xpathway` evaluates XPath 1.0 against that structure through an injected adapter, never importing a node type.

> [!CAUTION]
> **No DOM implementation belongs in this package.** Reaching for `@xmldom/xmldom`, `jsdom` or `linkedom` to satisfy an
> interface reintroduces the dependency the design exists to avoid; supply the missing information through the adapter
> instead.

XPath here serves **scraping**: expressions are tuned against the page they target, so the tree the parser actually
produces is the contract, not the one the HTML5 specification prescribes.

# Adapter Conventions

- **The `html` flag drives name matching and attribute lookup together.** With it set, the adapter reports the XHTML
  namespace for elements and lowercases attribute lookups, which is what makes unprefixed tests match case
  insensitively. Changing one of the three without the others breaks name tests, and the failure looks like an empty
  node-set rather than an error.

- **Attribute handles are cached per element.** `domhandler` keeps attributes as a plain record rather than as nodes.
  Projecting fresh handles on every call breaks node identity, and with it document order and node-set deduplication.

# Constraints

- **XML namespaces are not resolved.** `htmlparser2` keeps the raw qualified name under `xmlMode`, so prefixed name
  tests do not match. Select with `name()='d:b'` or `local-name()='b'`.

- **`namespace::` and `processing-instruction()` yield empty node-sets.** `domhandler` materialises neither node kind,
  so the syntax evaluates and fails silently.

- **Nothing streams.** XPath needs the finished tree. Tasks here must not advertise streaming semantics.

# Vendoring the XPath Engine

`xpathway` has a single author and no adoption, but XPath 1.0 is frozen and the library is roughly 2500 lines of MIT
ESM, so vendoring it is a supported option. It ships no types, so the declarations are hand-written either way.
