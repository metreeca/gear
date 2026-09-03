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
  classes**. Nothing is converted between formats: HTML output is normalised into a plain XML tree, so that a single
  set of expressions serves both.

- `xpathway` evaluates XPath 1.0 against that structure through an injected adapter, never importing a node type.

> [!CAUTION]
> **No DOM implementation belongs in this package.** Reaching for `@xmldom/xmldom`, `jsdom` or `linkedom` to satisfy an
> interface reintroduces the dependency the design exists to avoid; supply the missing information through the adapter
> instead.

XPath here serves **scraping**: expressions are tuned against the page they target, so the tree the parser actually
produces is the contract, not the one the HTML5 specification prescribes.

# Adapter Conventions

- **The adapter is format agnostic.** It carries no notion of the format a tree was parsed from: names are reported as
  the tree holds them, with no case folding and no per-format branch, and a namespace is read off the prefix a name
  carries rather than off a declaration. Reintroducing a mode flag pushes back onto every consumer knowledge the tree
  doesn't carry.

- **Normalisation belongs to the `html` task, not to the adapter.** HTML trees are handed over already shaped as XML
  ones: the camelCase SVG and MathML names the HTML5 adjustment tables define are restored, and the base URL a
  document states is recorded as `xml:base`, as for XML.

- **Attribute handles are cached per element.** `domhandler` keeps attributes as a plain record rather than as nodes.
  Projecting fresh handles on every call breaks node identity, and with it document order and node-set deduplication.

# Constraints

- **Namespaces are not resolved, in either format.** No `xmlns` declaration is read: a name reaches the tree as a raw
  qualified string and its **prefix stands in for its namespace**, compared as written. So `//d:b` selects `<d:b>`
  whatever URI the document binds `d` to, `//b` leaves it out, `name()='d:b'` and `local-name()='b'` both reach it, and
  a default `xmlns` is invisible: `//item` matches elements a namespace-aware processor would require a prefix binding
  for. `namespace-uri()` consequently reports a prefix rather than a URI. The `xml` prefix is the one exception, bound
  to its standard URI by definition rather than by declaration, so `@xml:base` and `lang()` read what they are meant to.

- **`namespace::` and `processing-instruction()` yield empty node-sets.** No namespace node is held, and the adapter
  leaves `domhandler` directives — the XML declaration, the document type declaration and processing instructions
  alike — out of the tree, as the XPath data model does for the first two. The syntax evaluates and fails silently.

- **No document is parsed incrementally.** XPath needs the finished tree, so `xml` and `html` hold each document in
  memory while parsing it and must document themselves as **materialising**. Do not claim a document is turned into
  results before it has been read whole.

  This bans a claim, not a word: **streaming** and **materialising** are the memory axis `@metreeca/flow` defines, so a
  task drawing trees already parsed (`xpath`, `focus`, `untag`) is graded on what it retains across the feed, not on
  whether XPath needs a whole tree.

# Vendoring the XPath Engine

`xpathway` has a single author and no adoption, but XPath 1.0 is frozen and the library is roughly 2500 lines of MIT
ESM, so vendoring it is a supported option. It ships no types, so the declarations are hand-written either way.
