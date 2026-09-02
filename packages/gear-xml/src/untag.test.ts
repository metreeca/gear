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

		it("separates block containers with a blank line", async () => {

			expect(process(tree(`<div>alpha</div><p>beta</p><section>gamma</section><article>delta</article>`)))
				.toBe("alpha\n\nbeta\n\ngamma\n\ndelta");

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

	});

	describe("text", () => {

		it("collapses runs of whitespace", async () => {

			expect(process(tree(`<p>alpha   \n\t beta</p>`)))
				.toBe("alpha beta");

		});

		it("keeps whitespace bordering text, so that misplaced emphasis doesn't run words together", async () => {

			expect(process(tree(`<p>alpha <em>beta</em> gamma</p>`)))
				.toBe("alpha *beta* gamma");

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

			expect(process(tree(`<head><title>Title</title></head><style>p { color: red }</style><p>alpha</p>`)))
				.toBe("alpha");

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
