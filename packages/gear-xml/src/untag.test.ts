/*
 * Copyright © 2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import type { AnyNode, Document } from "domhandler";
import { isTag } from "domhandler";
import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { process } from "./untag.core.js";
import { untag } from "./untag.js";


/**
 * Parses a document as HTML.
 */
function tree(markup: string): Document {
	return parseDocument(markup);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("process", () => {

	describe("blocks", () => {

		it("renders headings", async () => {

			expect(process(tree(`<h1>Alpha</h1><h2>Beta</h2><h3>Gamma</h3>`)))
				.toBe("# Alpha\n\n## Beta\n\n### Gamma");

		});

		it("drops a heading carrying no text", async () => {

			expect(process(tree(`<h1></h1><p>alpha</p>`)))
				.toBe("alpha");

		});

		it("separates block containers with a blank line", async () => {

			expect(process(tree(`<p>alpha</p><section>beta</section><article>gamma</article>`)))
				.toBe("alpha\n\nbeta\n\ngamma");

		});

		it("sets off a div stating text of its own, mixed with elements or not", async () => {

			expect(process(tree(`<div>alpha</div><div>beta <a href="/gamma">gamma</a></div>`)))
				.toBe("alpha\n\nbeta [gamma](/gamma)");

		});

		it("sets off a div wrapping a lone element", async () => {

			expect(process(tree(`<div><span>alpha</span></div><div><span>beta</span></div>`)))
				.toBe("alpha\n\nbeta");

		});

		it("closes a div laying several elements out with a line break", async () => {

			expect(process(tree(
				`<div><span>alpha</span> <span>beta</span></div><div><span>gamma</span> <span>delta</span></div>`
			)))
				.toBe("alpha beta\ngamma delta");

		});

		it("leaves whitespace out of what tells a wrapper from a paragraph", async () => {

			expect(process(tree(
				`<div>\n<div> <span>alpha</span> <span>beta</span> </div>\n<div> <span>gamma</span> </div>\n</div>`
			)))
				.toBe("alpha beta\n\ngamma");

		});

		it("keeps the content a page lays out in nested wrappers within a single block", async () => {

			expect(process(tree(
				`<div><div><span>alpha</span><!----><span>a</span></div><!----><div><span>beta</span><!----></div></div>`
			)))
				.toBe("alpha a\nbeta");

		});

		it("separates adjacent articles carrying no block content", async () => {

			expect(process(tree(`<article>alpha</article><article>beta</article>`)))
				.toBe("alpha\n\nbeta");

		});

		it("renders a thematic break", async () => {

			expect(process(tree(`<p>alpha</p><hr><p>beta</p>`)))
				.toBe("alpha\n\n---\n\nbeta");

		});

		it("renders a line break", async () => {

			expect(process(tree(`<p>alpha<br>beta</p>`)))
				.toBe("alpha\nbeta");

		});

		it("lays down a blank line for the two line breaks a paragraph is often split with", async () => {

			expect(process(tree(`<p>alpha<br><br>beta</p>`)))
				.toBe("alpha\n\nbeta");

		});

		it("saturates a run of line breaks at a single blank line", async () => {

			expect(process(tree(`<p>alpha<br><br><br><br>beta</p>`)))
				.toBe("alpha\n\nbeta");

		});

		it("opens no block with a line break", async () => {

			expect(process(tree(`<p><br><br>alpha</p>`)))
				.toBe("alpha");

		});

		it("sets a block off from the content preceding it", async () => {

			expect(process(tree(`<div>alpha</div><p>beta</p><div>gamma</div><h1>Delta</h1>`)))
				.toBe("alpha\n\nbeta\n\ngamma\n\n# Delta");

		});

	});

	describe("lists", () => {

		it("marks the items of an unordered list", async () => {

			expect(process(tree(`<ul><li>alpha</li><li>beta</li></ul>`)))
				.toBe("- alpha\n- beta");

		});

		it("marks the items of an ordered list as unordered ones", async () => {

			expect(process(tree(`<ol><li>alpha</li><li>beta</li></ol>`)))
				.toBe("- alpha\n- beta");

		});

		it("indents nested lists", async () => {

			expect(process(tree(`<ul><li>alpha<ul><li>beta<ul><li>gamma</li></ul></li></ul></li></ul>`)))
				.toBe("- alpha\n  - beta\n    - gamma");

		});

		it("opens an item on the line of its marker, whatever blocks it holds", async () => {

			expect(process(tree(`<ul><li><p>alpha</p></li><li><p>beta</p></li></ul>`)))
				.toBe("- alpha\n\n- beta");

		});

		it("drops an item carrying no content", async () => {

			expect(process(tree(`<ul><li>alpha</li><li></li></ul>`)))
				.toBe("- alpha");

		});

		it("marks an item wrapping nothing but an image", async () => {

			expect(process(tree(`<ul><li><img src="cat.png" alt="a cat"></li></ul>`)))
				.toBe("- ![a cat](cat.png)");

		});

		it("separates a list from the surrounding content", async () => {

			expect(process(tree(`<p>alpha</p><ul><li>beta</li></ul><p>gamma</p>`)))
				.toBe("alpha\n\n- beta\n\ngamma");

		});

	});

	describe("inline content", () => {

		it("renders links", async () => {

			expect(process(tree(`<p>see <a href="https://example.com/">the <b>docs</b></a></p>`)))
				.toBe("see [the **docs**](https://example.com/)");

		});

		it("closes a link with no space, whatever whitespace its content trails", async () => {

			expect(process(tree(`<p><a href="/alpha">beta <!----></a></p>`)))
				.toBe("[beta](/alpha)");

		});

		it("drops a link carrying no content", async () => {

			expect(process(tree(`<p>alpha<a href="/beta"></a>gamma</p>`)))
				.toBe("alphagamma");

		});

		it("drops a link whose content is itself rendered as nothing", async () => {

			expect(process(tree(`<p><a href="/beta"><svg><title>Beta</title></svg></a>gamma</p>`)))
				.toBe("gamma");

		});

		it("labels a link with the image it wraps", async () => {

			expect(process(tree(`<p><a href="/beta"><img src="cat.png" alt="a cat"></a></p>`)))
				.toBe("[![a cat](cat.png)](/beta)");

		});

		it("renders images labelled by their alt text", async () => {

			expect(process(tree(`<p><img src="cat.png" alt="a cat"></p>`)))
				.toBe("![a cat](cat.png)");

		});

		it("renders images stating no alt text", async () => {

			expect(process(tree(`<p><img src="cat.png"></p>`)))
				.toBe("![](cat.png)");

		});

		it("renders emphasis", async () => {

			expect(process(tree(`<p><strong>alpha</strong> <b>beta</b> <em>gamma</em> <i>delta</i></p>`)))
				.toBe("**alpha** **beta** *gamma* *delta*");

		});

		it("writes the whitespace bordering emphasis outside its markers", async () => {

			expect(process(tree(`<p>alpha<strong> beta </strong>gamma</p>`)))
				.toBe("alpha **beta** gamma");

		});

		it("drops emphasis carrying no text", async () => {

			expect(process(tree(`<p>alpha<strong></strong>beta</p>`)))
				.toBe("alphabeta");

		});

		it("keeps the space emphasis carrying nothing but whitespace stands for", async () => {

			expect(process(tree(`<p>alpha<em> </em>beta</p>`)))
				.toBe("alpha beta");

		});

	});

	describe("text", () => {

		it("collapses runs of whitespace", async () => {

			expect(process(tree(`<p>alpha   \n\t beta</p>`)))
				.toBe("alpha beta");

		});

		it("collapses the no-break spaces and separators a page is laid out with", async () => {

			expect(process(tree(`<p>alpha&nbsp;&nbsp;beta gamma﻿delta</p>`)))
				.toBe("alpha beta gamma delta");

		});

		it("keeps whitespace bordering text, so that misplaced emphasis doesn't run words together", async () => {

			expect(process(tree(`<p>alpha <em>beta</em> gamma</p>`)))
				.toBe("alpha *beta* gamma");

		});

		it("keeps a comment as a space, so that framework markers don't run words together", async () => {

			expect(process(tree(`<p><span>alpha</span><!----><span>beta</span></p>`)))
				.toBe("alpha beta");

		});

		it("keeps a boundary between elements as a space, so that fields laid out side by side don't run together",
			async () => {

				expect(process(tree(`<p><span>26 Mar 2026</span><span>10:00</span><span>a</span></p>`)))
					.toBe("26 Mar 2026 10:00 a");

			}
		);

		it("keeps emphasis apart from the emphasis beside it", async () => {

			expect(process(tree(`<p><em>alpha</em><strong>beta</strong></p>`)))
				.toBe("*alpha* **beta**");

		});

		it("runs an element into the text bordering it", async () => {

			expect(process(tree(`<p><a href="/alpha">alpha</a>beta</p>`)))
				.toBe("[alpha](/alpha)beta");

		});

		it("opens no line with the space an element boundary stands for", async () => {

			expect(process(tree(`<div><p>alpha</p><p>beta</p></div>`)))
				.toBe("alpha\n\nbeta");

		});

		it("opens no line with the space a comment between blocks stands for", async () => {

			expect(process(tree(`<p>alpha</p><!----><p>beta</p>`)))
				.toBe("alpha\n\nbeta");

		});

		it("opens no line with the whitespace a page lays blocks out with", async () => {

			expect(process(tree(`<p>alpha</p>\n<p>beta</p>`)))
				.toBe("alpha\n\nbeta");

		});

		it("opens no item with the whitespace a page lays its content out with", async () => {

			expect(process(tree(`<ul><li> alpha</li></ul>`)))
				.toBe("- alpha");

		});

		it("strips leading and trailing whitespace", async () => {

			expect(process(tree(`  <p>  alpha  </p>  `)))
				.toBe("alpha");

		});

	});

	describe("dropped content", () => {

		it("keeps JSON-LD metadata as a fenced block", async () => {

			expect(process(tree(`<script type="application/ld+json">{ "a": 1 }</script>`)))
				.toBe("```json\n{ \"a\": 1 }\n```");

		});

		it("drops scripts carrying no JSON-LD metadata", async () => {

			expect(process(tree(`<p>alpha</p><script>const x = 1;</script>`)))
				.toBe("alpha");

		});

		it("drops document metadata and styles", async () => {

			expect(process(tree(`<head><meta charset="utf-8"></head><style>p { color: red }</style><p>alpha</p>`)))
				.toBe("alpha");

		});

	});

	describe("frontmatter", () => {

		it("opens the rendering with the title stated by the tree", async () => {

			expect(process(tree(`<html><head><title>Alpha</title></head><body><p>beta</p></body></html>`)))
				.toBe(`---\ntitle: "Alpha"\n---\n\nbeta`);

		});

		it("renders the content on its own where the tree states no title", async () => {

			expect(process(tree(`<html><body><p>alpha</p></body></html>`)))
				.toBe("alpha");

		});

		it("renders the content on its own where the title carries no text", async () => {

			expect(process(tree(`<html><head><title>  </title></head><body><p>alpha</p></body></html>`)))
				.toBe("alpha");

		});

		it("collapses the whitespace a title is laid out with", async () => {

			expect(process(tree(`<head><title>  Alpha \n\t beta  </title></head><p>gamma</p>`)))
				.toBe(`---\ntitle: "Alpha beta"\n---\n\ngamma`);

		});

		it("escapes the quotes and backslashes a title carries", async () => {

			expect(process(tree(`<head><title>Alpha "beta" \\ gamma</title></head><p>delta</p>`)))
				.toBe(`---\ntitle: "Alpha \\"beta\\" \\\\ gamma"\n---\n\ndelta`);

		});

		it("leaves out a title held by an embedded object", async () => {

			expect(process(tree(`<svg><title>Alpha</title></svg><p>beta</p>`)))
				.toBe("beta");

		});

		it("leaves out a title held by framing", async () => {

			expect(process(tree(`<nav><title>Alpha</title></nav><p>beta</p>`)))
				.toBe("beta");

		});

		it("renders a page wrapping its content in an html body", async () => {

			expect(process(tree(
				`<html><head><title>Alpha</title></head>`
				+`<body><article><p>beta</p></article><article><p>gamma</p></article></body></html>`
			)))
				.toBe(`---\ntitle: "Alpha"\n---\n\nbeta\n\ngamma`);

		});

		it("renders a tree stating a title but holding no content as the frontmatter alone", async () => {

			expect(process(tree(`<html><head><title>Alpha</title></head><body></body></html>`)))
				.toBe(`---\ntitle: "Alpha"\n---`);

		});

	});

	describe("unknown elements", () => {

		it("renders the content of elements carrying no rendering of their own", async () => {

			expect(process(tree(`<figure><span>alpha</span></figure>`)))
				.toBe("alpha");

		});

	});

	describe("trees", () => {

		it("converts the subtree rooted at an element", async () => {

			const [ element ] = tree(`<div><p>alpha</p></div><p>beta</p>`).children.filter(isTag);

			expect(process(element)).toBe("alpha");

		});

		it("matches element names case insensitively", async () => {

			expect(process(parseDocument(`<UL><LI>alpha</LI><LI>beta</LI></UL>`, { xmlMode: true })))
				.toBe("- alpha\n- beta");

		});

		it("converts a tree holding no content to an empty string", async () => {

			expect(process(tree(`   `))).toBe("");

		});

	});

});

describe("untag", () => {

	it("emits the rendering of each tree in turn", async () => {

		const trees: readonly AnyNode[] = [ tree(`<p>alpha</p>`), tree(`<p>beta</p>`) ];

		expect(await items(trees)(untag())(toArray())).toEqual([ "alpha", "beta" ]);

	});

	it("emits an empty rendering for a tree holding no content", async () => {

		const trees: readonly AnyNode[] = [ tree(``), tree(`<p>alpha</p>`) ];

		expect(await items(trees)(untag())(toArray())).toEqual([ "", "alpha" ]);

	});

});
