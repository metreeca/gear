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
import type { AnyNode, Document, Element } from "domhandler";
import { isCDATA, isComment, isDocument, isTag, isText } from "domhandler";
import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { process } from "./html.core.js";
import { base, content, isAttribute, isElement, isNode, select, type Target } from "./xpath.core.js";
import { xpath } from "./xpath.js";


/**
 * Parses an XML document as the {@link xml} task does.
 */
function tree(text: string): Document {
	return parseDocument(text, { xmlMode: true });
}

/**
 * Reduces a selection to a readable outline, so that a test states what it expects rather than how a node is built.
 */
function outline(nodes: readonly Target[]): readonly string[] {
	return nodes.map(node => !isNode(node) ? JSON.stringify(node)
		: isAttribute(node) ? `@${node.name}=${node.value}`
			: isDocument(node) ? "#document"
				: isTag(node) ? `<${node.name}>`
					: isText(node) || isCDATA(node) ? JSON.stringify(content(node))
						: isComment(node) ? `<!--${node.data}-->`
							: "?"
	);
}

/**
 * Draws the sole node a selection reports.
 */
function sole(nodes: readonly Target[]): Target {

	expect(nodes).toHaveLength(1);

	const [ node ] = nodes;

	if ( node === undefined ) {
		throw new Error("no node selected");
	}

	return node;

}

/**
 * Draws the sole element a selection reports.
 */
function only(nodes: readonly Target[]): Element {

	const node = sole(nodes);

	if ( !isElement(node) ) {
		throw new Error("no element selected");
	}

	return node;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("xpath", () => {

	describe("without a mapper", () => {

		it("emits a selector targeting each tree in turn", async () => {

			const trees: readonly AnyNode[] = [ tree(`<item id="1"/>`), tree(`<item id="2"/>`) ];

			const paths = await items<AnyNode>(trees)(xpath())(toArray());

			expect(paths.map(path => outline(path("//item/@id")))).toEqual([ [ "@id=1" ], [ "@id=2" ] ]);

		});

		it("selects nothing if the expression addresses no node", async () => {

			const trees: readonly AnyNode[] = [ tree(`<item id="1"/>`) ];

			const paths = await items<AnyNode>(trees)(xpath())(toArray());

			expect(paths.map(path => path("//tag"))).toEqual([ [] ]);

		});

	});

	describe("with a mapper", () => {

		it("emits the result mapped for each tree", async () => {

			const trees: readonly AnyNode[] = [
				tree(`<item id="1"><tag>a</tag><tag>b</tag></item>`),
				tree(`<item id="2"/>`)
			];

			const results = await items<AnyNode>(trees)(xpath(path => ({

				id: outline(path("//item/@id")),
				tags: outline(path("//tag"))

			})))(toArray());

			expect(results).toEqual([
				{ id: [ "@id=1" ], tags: [ "<tag>", "<tag>" ] },
				{ id: [ "@id=2" ], tags: [] }
			]);

		});

		it("reports a malformed expression while the feed is consumed", async () => {

			const results = items<AnyNode>([ tree(`<item/>`) ])(xpath(path => path("item[")))(toArray());

			await expect(results).rejects.toThrow(SyntaxError);

		});

	});

	describe("with nodes", () => {

		it("selects from every given node in turn", () => {

			const first = tree(`<item id="1"/>`);
			const second = tree(`<item id="2"/>`);

			expect(outline(xpath(first, second)("//item/@id"))).toEqual([ "@id=1", "@id=2" ]);

		});

		it("selects nothing if the expression addresses no node", () => {

			expect(xpath(tree(`<item id="1"/>`))("//tag")).toEqual([]);

		});

		it("targets a node reported by a previous selection", () => {

			const path = xpath(tree(`<catalog><item><tag>a</tag></item></catalog>`));

			expect(outline(xpath(...path("//item"))("tag"))).toEqual([ "<tag>" ]);

		});

		it("reports the values an expression computes", () => {

			expect(xpath(tree(`<catalog><item/><item/></catalog>`))("count(//item)")).toEqual([ 2 ]);

		});

		it("reports a malformed expression", () => {

			expect(() => xpath(tree(`<item/>`))("item[")).toThrow(SyntaxError);

		});

	});


	it("emits no value if the feed runs dry", async () => {

		expect(await items<AnyNode>([])(xpath())(toArray())).toEqual([]);

	});

});

describe("select", () => {

	describe("context", () => {

		it("selects the context node itself", async () => {

			const document = tree(`<item/>`);

			expect(outline(select(document, "."))).toEqual([ "#document" ]);

		});

		it("selects relative to the context node", async () => {

			const item = only(select(tree(`<catalog><item><tag/></item></catalog>`), "//item"));

			expect(outline(select(item, "tag"))).toEqual([ "<tag>" ]);

		});

		it("reaches the document from an inner node", async () => {

			const item = only(select(tree(`<catalog><item/></catalog>`), "//item"));

			expect(outline(select(item, "/*"))).toEqual([ "<catalog>" ]);

		});

	});

	describe("element steps", () => {

		it("selects children by name", async () => {

			const document = tree(`<catalog><item/><item/><other/></catalog>`);

			expect(outline(select(document, "catalog/item"))).toEqual([ "<item>", "<item>" ]);

		});

		it("selects descendants by name", async () => {

			const document = tree(`<catalog><group><item/></group><item/></catalog>`);

			expect(outline(select(document, "//item"))).toEqual([ "<item>", "<item>" ]);

		});

		it("selects every child on a wildcard", async () => {

			const document = tree(`<catalog><item/><other/></catalog>`);

			expect(outline(select(document, "catalog/*"))).toEqual([ "<item>", "<other>" ]);

		});

		it("selects nothing for an unstated name", async () => {

			const document = tree(`<catalog><item/></catalog>`);

			expect(select(document, "//tag")).toEqual([]);

		});

	});

	describe("attribute steps", () => {

		it("selects an attribute by name", async () => {

			const document = tree(`<item id="1" href="a"/>`);

			expect(outline(select(document, "//item/@id"))).toEqual([ "@id=1" ]);

		});

		it("selects every attribute on a wildcard", async () => {

			const document = tree(`<item id="1" href="a"/>`);

			expect(outline(select(document, "//item/@*"))).toEqual([ "@id=1", "@href=a" ]);

		});

		it("selects nothing for an unstated attribute", async () => {

			const document = tree(`<item id="1"/>`);

			expect(select(document, "//item/@href")).toEqual([]);

		});

		it("reports the stating element as the parent of an attribute", async () => {

			const document = tree(`<catalog><item id="1"/></catalog>`);

			expect(outline(select(document, "//@id/.."))).toEqual([ "<item>" ]);

		});

		it("hands over the same attribute as the same node", async () => {

			const document = tree(`<item id="1"/>`);

			expect(select(document, "//@id")[0]).toBe(select(document, "//item/@id")[0]);

		});

		it("reports an attribute reached twice once", async () => {

			const document = tree(`<item id="1"/>`);

			expect(outline(select(document, "//@id | //item/@id"))).toEqual([ "@id=1" ]);

		});

	});

	describe("character data", () => {

		it("selects text nodes", async () => {

			const document = tree(`<item>alpha<tag/>beta</item>`);

			expect(outline(select(document, "//item/text()"))).toEqual([ `"alpha"`, `"beta"` ]);

		});

		it("reads a CDATA section as text", async () => {

			const document = tree(`<item><![CDATA[a<b]]></item>`);

			expect(outline(select(document, "//item/text()"))).toEqual([ `"a<b"` ]);

		});

		it("reads the text of an element as the text it holds", async () => {

			const document = tree(`<item>alpha<tag>beta</tag></item>`);

			expect(outline(select(document, "//item[.='alphabeta']"))).toEqual([ "<item>" ]);

		});

		it("leaves the text of a comment out of the text of an element", async () => {

			const document = tree(`<item>alpha<!-- note --></item>`);

			expect(outline(select(document, "//item[.='alpha']"))).toEqual([ "<item>" ]);

		});

		it("selects comments", async () => {

			const document = tree(`<item><!-- note --></item>`);

			expect(outline(select(document, "//comment()"))).toEqual([ "<!-- note -->" ]);

		});

		it("selects no processing instruction", async () => {

			const document = tree(`<item><?go now?></item>`);

			expect(select(document, "//processing-instruction()")).toEqual([]);

		});

		it("leaves processing instructions out of the nodes a tree holds", async () => {

			const document = tree(`<item><?go now?><tag/></item>`);

			expect(outline(select(document, "//item/node()"))).toEqual([ "<tag>" ]);

		});

	});

	describe("names", () => {

		it("matches names as the tree holds them", async () => {

			const document = tree(`<Item/>`);

			expect(outline(select(document, "//Item"))).toEqual([ "<Item>" ]);
			expect(select(document, "//item")).toEqual([]);

		});

		it("matches the prefix a name test carries as written", async () => {

			const document = tree(`<d:b xmlns:d="https://example.net/"/>`);

			expect(outline(select(document, "//d:b"))).toEqual([ "<d:b>" ]);
			expect(select(document, "//e:b")).toEqual([]);

		});

		it("leaves a prefixed name out of an unprefixed name test", async () => {

			const document = tree(`<d:b xmlns:d="https://example.net/"/>`);

			expect(select(document, "//b")).toEqual([]);

		});

		it("reports a qualified name as the tree holds it", async () => {

			const document = tree(`<d:b xmlns:d="https://example.net/"/>`);

			expect(outline(select(document, "//*[name()='d:b']"))).toEqual([ "<d:b>" ]);

		});

		it("drops the prefix a name carries from its local name", async () => {

			const document = tree(`<d:b xmlns:d="https://example.net/"/>`);

			expect(outline(select(document, "//*[local-name()='b']"))).toEqual([ "<d:b>" ]);

		});

		it("reports the prefix a name carries as its namespace", async () => {

			const document = tree(`<d:b xmlns:d="https://example.net/"/>`);

			expect(outline(select(document, "//*[namespace-uri()='d']"))).toEqual([ "<d:b>" ]);

		});

		it("binds the xml prefix without a declaration", async () => {

			const document = tree(`<item xml:base="https://example.net/" xml:lang="en"/>`);

			expect(outline(select(document, "//item/@xml:base"))).toEqual([ "@xml:base=https://example.net/" ]);
			expect(outline(select(document, "//item[lang('en')]"))).toEqual([ "<item>" ]);

		});

		it("leaves a default namespace declaration out of the names it matches", async () => {

			const document = tree(`<item xmlns="https://example.net/"/>`);

			expect(outline(select(document, "//item"))).toEqual([ "<item>" ]);

		});

		it("reports a namespace declaration as an attribute", async () => {

			const document = tree(`<item xmlns:d="https://example.net/"/>`);

			expect(outline(select(document, "//item/@*"))).toEqual([ "@xmlns:d=https://example.net/" ]);

		});

		it("selects no namespace node", async () => {

			const document = tree(`<item xmlns:d="https://example.net/"/>`);

			expect(select(document, "//item/namespace::*")).toEqual([]);

		});

	});

	describe("HTML trees", () => {

		it("addresses an HTML tree with the expressions an XML one answers to", async () => {

			const page = await process(`<html><body><A HREF="a">alpha</A></body></html>`);

			if ( page === undefined ) {
				throw new Error("no tree parsed");
			}

			expect(outline(select(page, "//a/@href"))).toEqual([ "@href=a" ]);

		});

	});

	describe("predicates and functions", () => {

		it("filters a step by predicate", async () => {

			const document = tree(`<catalog><item id="1"/><item id="2"/></catalog>`);

			expect(outline(select(document, "//item[@id='2']/@id"))).toEqual([ "@id=2" ]);

		});

		it("filters a step by position", async () => {

			const document = tree(`<catalog><item id="1"/><item id="2"/></catalog>`);

			expect(outline(select(document, "//item[position()=2]/@id"))).toEqual([ "@id=2" ]);

		});

		it("counts the nodes a step reaches", async () => {

			const document = tree(`<catalog><group><item/><item/></group><group><item/></group></catalog>`);

			expect(outline(select(document, "//group[count(item)=2]/item"))).toEqual([ "<item>", "<item>" ]);

		});

		it("identifies an element by its id attribute", async () => {

			const document = tree(`<catalog><item id="1"/><item id="2"/></catalog>`);

			expect(outline(select(document, "id('2')/@id"))).toEqual([ "@id=2" ]);

		});

		it("reads text case insensitively through translate", async () => {

			const document = tree(`<item>Alpha</item>`);

			expect(outline(select(document,
				"//item[translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='alpha']"
			))).toEqual([ "<item>" ]);

		});

	});

	describe("document order", () => {

		it("reports the nodes of a union in document order", async () => {

			const document = tree(`<catalog><item id="1"/><item id="2"/></catalog>`);

			expect(outline(select(document, "//item[2]/@id | //item[1]/@id"))).toEqual([ "@id=1", "@id=2" ]);

		});

		it("reports the attributes of an element before its children", async () => {

			const document = tree(`<item id="1"><tag/></item>`);

			expect(outline(select(document, "//tag | //@id"))).toEqual([ "@id=1", "<tag>" ]);

		});

		it("reports a node reached twice once", async () => {

			const document = tree(`<catalog><item/></catalog>`);

			expect(outline(select(document, "//item | //catalog/item"))).toEqual([ "<item>" ]);

		});

		it("orders nodes across the depth of the tree", async () => {

			const document = tree(`<catalog><group><item/></group><item/></catalog>`);

			expect(outline(select(document, "//item[2] | //group | //item[1]")))
				.toEqual([ "<group>", "<item>", "<item>" ]);

		});

	});

	describe("computed values", () => {

		it("reports the number an expression computes", async () => {

			expect(select(tree(`<catalog><item/><item/></catalog>`), "count(//item)")).toEqual([ 2 ]);

		});

		it("reports the string an expression computes", async () => {

			expect(select(tree(`<item>alpha</item>`), "string(//item)")).toEqual([ "alpha" ]);

		});

		it("reports the boolean an expression computes", async () => {

			expect(select(tree(`<catalog><item/></catalog>`), "count(//item)=1")).toEqual([ true ]);

		});

		it.each([ 2, "alpha", true ])("selects nothing from a computed value <%s>", async value => {

			expect(select(value, "//item")).toEqual([]);

		});

	});

	describe("malformed expressions", () => {

		it.each([
			"//", "[", "item[", "@", "1 +", "item tag", "item//", "(", "item/", "*[]", "..."
		])("rejects <%s>", async path => {

			expect(() => select(tree(`<item/>`), path)).toThrow(SyntaxError);

		});

		it("isn't affected by a previously rejected expression", async () => {

			const document = tree(`<item/>`);

			expect(() => select(document, "item[")).toThrow(SyntaxError);
			expect(outline(select(document, "//item"))).toEqual([ "<item>" ]);

		});

	});

});

describe("base", () => {

	it("draws the base a root states", async () => {

		const document = tree(`<catalog xml:base="https://example.net/data/"><item/></catalog>`);

		expect(base(only(select(document, "//item")))?.href).toBe("https://example.net/data/");

	});

	it("draws the base the closest ancestor states", async () => {

		const document = tree(`
			<catalog xml:base="https://example.net/data/">
				<group xml:base="inner/"><item/></group>
			</catalog>
		`);

		expect(base(only(select(document, "//item")))?.href).toBe("https://example.net/data/inner/");

	});

	it("draws the base an element states for itself", async () => {

		const document = tree(`<catalog xml:base="https://example.net/data/"><item xml:base="inner/"/></catalog>`);

		expect(base(only(select(document, "//item")))?.href).toBe("https://example.net/data/inner/");

	});

	it("draws the base of the element stating an attribute", async () => {

		const document = tree(`<catalog xml:base="https://example.net/data/"><item href="a"/></catalog>`);

		expect(base(sole(select(document, "//@href")))?.href).toBe("https://example.net/data/");

	});

	it("locates no node of a tree stating no base", async () => {

		const document = tree(`<catalog><item/></catalog>`);

		expect(base(only(select(document, "//item")))).toBeUndefined();

	});

	it("locates no node of a tree stating a relative base", async () => {

		const document = tree(`<catalog xml:base="data/"><item/></catalog>`);

		expect(base(only(select(document, "//item")))).toBeUndefined();

	});

});
