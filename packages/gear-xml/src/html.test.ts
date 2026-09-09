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
import type { NodeWithChildren } from "domhandler";
import { hasChildren, isTag, isText } from "domhandler";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { process } from "./html.core.js";
import { html } from "./html.js";


type Outline = {

	readonly name: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly Outline[];

}


/**
 * Reduces the element tree rooted at a node to its names and attributes.
 */
function outline(node: undefined | NodeWithChildren): readonly Outline[] {
	return node?.children.filter(isTag).map(element => ({
		name: element.name,
		attributes: element.attribs,
		children: outline(element)
	})) ?? [];
}

/**
 * Concatenates the character data of the tree rooted at a node.
 */
function text(node: undefined | NodeWithChildren): string {
	return node?.children
		.map(child => isText(child) ? child.data : hasChildren(child) ? text(child) : "")
		.join("") ?? "";
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("process", () => {

	/**
	 * Creates a response stating the given retrieval URL and content type.
	 *
	 * `Response` computes `url` from the exchange that produced it, so a synthesised one always reports an empty
	 * string: the own property shadows the prototype getter to stand in for a real exchange. The content type is
	 * stated as empty rather than left out, as the constructor infers one from the body.
	 */
	function response(body: BodyInit | null, { url, type }: {

		readonly url?: string;
		readonly type?: string;

	} = {}): Response {

		const response = new Response(body, { headers: { "Content-Type": type ?? "" } });

		return url === undefined ? response : Object.defineProperty(response, "url", { value: url });

	}


	it("parses the document as a tree", async () => {

		expect(outline(await process(`<div id="1"><p>alpha</p></div>`))).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [{ name: "p", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("reads the character data of the document", async () => {

		expect(text(await process(`<div><p>alpha</p><p>beta</p></div>`))).toBe("alphabeta");

	});

	it("folds element and attribute names to lowercase", async () => {

		expect(outline(await process(`<DIV ID="1"></DIV>`))).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("restores the camelCase names carried by inline SVG", async () => {

		const document = await process(`<svg viewBox="0 0 16 16"><clipPath clipPathUnits="userSpaceOnUse"/></svg>`);

		expect(outline(document)).toEqual([
			{
				name: "svg", attributes: { viewBox: "0 0 16 16" },
				children: [{ name: "clipPath", attributes: { clipPathUnits: "userSpaceOnUse" }, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("restores the camelCase names carried by inline MathML", async () => {

		expect(outline(await process(`<math><mo definitionURL="urn:x"></mo></math>`))).toEqual([
			{
				name: "math", attributes: {},
				children: [{ name: "mo", attributes: { definitionURL: "urn:x" }, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("leaves the HTML content of a foreign element folded", async () => {

		// `foreignObject` holds HTML, where names are folded as everywhere else in the document

		const document = await process(`<svg><foreignObject><div viewBox="x"></div></foreignObject></svg>`);

		expect(outline(document)).toEqual([
			{
				name: "svg", attributes: {}, children: [{
					name: "foreignObject", attributes: {},
					children: [{ name: "div", attributes: { viewbox: "x" }, children: [] }]
				}]
			}
		] satisfies readonly Outline[]);

	});

	it("supplies no root element where the source states none", async () => {

		expect(outline(await process(`<p>alpha</p>`))).toEqual([
			{ name: "p", attributes: {}, children: [] }
		] satisfies readonly Outline[]);

	});

	it("closes elements the source leaves implied", async () => {

		expect(outline(await process(`<ul><li>alpha<li>beta</ul>`))).toEqual([
			{
				name: "ul", attributes: {}, children: [
					{ name: "li", attributes: {}, children: [] },
					{ name: "li", attributes: {}, children: [] }
				]
			}
		] satisfies readonly Outline[]);

	});

	it("decodes entity references", async () => {

		expect(text(await process(`<p>a&nbsp;&amp;&nbsp;b</p>`))).toBe("a & b");

	});

	it("strips a byte order mark", async () => {

		expect(outline(await process(`﻿<div id="1"></div>`))).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("recovers from malformed markup rather than skipping the document", async () => {

		// parsing is forgiving: the element is closed at the end of the input rather than reported as an error

		expect(outline(await process(`<div><p>alpha`))).toEqual([
			{ name: "div", attributes: {}, children: [{ name: "p", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("converts a document holding only whitespace to undefined", async () => {

		expect(await process(" \n\t ")).toBeUndefined();

	});

	describe("responses", () => {

		it("reads the response body as the document", async () => {

			expect(text(await process(response(`<div><p>alpha</p></div>`)))).toBe("alpha");

		});

		it("records the retrieval URL as an xml:base attribute on the root", async () => {

			expect(outline(await process(response(`<div></div>`, { url: "https://example.com/a/b" })))).toEqual([
				{ name: "div", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records the base stated by the document, resolved against the retrieval URL", async () => {

			const document = await process(response(`<head><base href="../c/"></head><div></div>`, {
				url: "https://example.com/a/b"
			}));

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/c/",
				"https://example.com/c/"
			]);

		});

		it("records the first base stated by the document", async () => {

			const document = await process(response(`<base href="/one/"><base href="/two/"><div></div>`, {
				url: "https://example.com/a/b"
			}));

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/one/",
				"https://example.com/one/",
				"https://example.com/one/"
			]);

		});

		it("records an absolute base stated by a document given as text", async () => {

			const document = await process(`<base href="https://example.net/x/"><div></div>`);

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.net/x/",
				"https://example.net/x/"
			]);

		});

		it("records nothing for a relative base stated without a retrieval URL", async () => {

			const document = await process(`<base href="../c/"><div></div>`);

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				undefined,
				undefined
			]);

		});

		it("records nothing for a response reporting no URL", async () => {

			expect(outline(await process(response(`<div></div>`)))).toEqual([
				{ name: "div", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("decodes the response body as the charset it states", async () => {

			const bytes = Buffer.from(`<p>città</p>`, "latin1");

			expect(text(await process(response(bytes, { type: "text/html; charset=ISO-8859-1" })))).toBe("città");

		});

		it("decodes the response body as the charset the document declares", async () => {

			const bytes = Buffer.from(`<meta charset="ISO-8859-1"><p>città</p>`, "latin1");

			expect(text(await process(response(bytes, { type: "text/html" })))).toBe("città");

		});

		it("prefers the charset stated by the response to the one the document declares", async () => {

			const bytes = Buffer.from(`<meta charset="ISO-8859-1"><p>città</p>`, "utf8");

			expect(text(await process(response(bytes, { type: "text/html; charset=utf-8" })))).toBe("città");

		});

		it("ignores a charset declared beyond the opening bytes", async () => {

			const filler = `<!--${"x".repeat(1024)}-->`; // pushes the declaration past the prescan limit

			const bytes = Buffer.from(`${filler}<meta charset="ISO-8859-1"><p>città</p>`, "latin1");

			expect(text(await process(response(bytes, { type: "text/html" }))))
				.toContain("citt�"); // read as UTF-8, so the latin1 byte is not decodable

		});

		it("decodes the response body as UTF-8 where neither states a charset", async () => {

			const bytes = Buffer.from(`<p>città</p>`, "utf8");

			expect(text(await process(response(bytes)))).toBe("città");

		});

		it("strips a byte order mark from the response body", async () => {

			const bytes = Buffer.from(`﻿<div id="1"></div>`, "utf8");

			expect(outline(await process(response(bytes, { type: "text/html; charset=utf-8" })))).toEqual([
				{ name: "div", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating a content type other than HTML", async () => {

			// a mis-declared type is reported to the log and read all the same, as parsing never fails anyway

			expect(outline(await process(response(`<div id="1"></div>`, { type: "text/plain" })))).toEqual([
				{ name: "div", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating an unknown charset as UTF-8", async () => {

			// a charset the platform doesn't decode is reported to the log and the body read as UTF-8 all the same

			const bytes = Buffer.from(`<p>città</p>`, "utf8");

			expect(text(await process(response(bytes, { type: "text/html; charset=bogus" })))).toBe("città");

		});

		it("converts a response without a body to undefined", async () => {

			expect(await process(response(null))).toBeUndefined();

		});

	});

	describe("bases", () => {

		it("records a stated base as an xml:base attribute on the root", async () => {

			expect(outline(await process(`<div></div>`, "https://example.com/a/b"))).toEqual([
				{ name: "div", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records a stated base in place of the retrieval URL", async () => {

			const document = await process(response(`<div></div>`, { url: "https://example.com/a/b" }),
				"https://example.net/x/"
			);

			expect(outline(document)).toEqual([
				{ name: "div", attributes: { "xml:base": "https://example.net/x/" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("resolves a base stated by the document against a stated base", async () => {

			const document = await process(`<base href="../c/"><div></div>`, "https://example.com/a/b");

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/c/",
				"https://example.com/c/"
			]);

		});

		it("reports a stated base that is a relative reference", async () => {

			await expect(process(`<div></div>`, "../c/")).rejects.toThrow(RangeError);

		});

		it("reports a stated base that is a relative reference, whatever the retrieval URL", async () => {

			// a base is taken as it stands, so the retrieval URL never stands in as the one to resolve it against

			await expect(process(response(`<div></div>`, { url: "https://example.com/a/b" }), "../c/"))
				.rejects.toThrow(RangeError);

		});

		it("reports a stated base that cannot serve as a resolution base", async () => {

			await expect(process(`<div></div>`, "urn:example:x")).rejects.toThrow(RangeError);

		});

	});

});

describe("html", () => {

	it("emits the tree of each document in turn", async () => {

		const documents: readonly string[] = [ `<div id="1"></div>`, `<div id="2"></div>` ];

		expect((await items(documents)(html())(toArray())).map(document => outline(document))).toEqual([
			[{ name: "div", attributes: { id: "1" }, children: [] }],
			[{ name: "div", attributes: { id: "2" }, children: [] }]
		] satisfies readonly (readonly Outline[])[]);

	});

	it("drops documents holding no text", async () => {

		const documents: readonly string[] = [ " \n\t ", `<div id="1"></div>` ];

		expect((await items(documents)(html())(toArray())).map(document => outline(document))).toEqual([
			[{ name: "div", attributes: { id: "1" }, children: [] }]
		] satisfies readonly (readonly Outline[])[]);

	});

	it("records the stated base on every tree", async () => {

		const documents: readonly string[] = [ `<div id="1"></div>`, `<div id="2"></div>` ];

		const trees = await items(documents)(html("https://example.com/a/b"))(toArray());

		expect(trees.flatMap(document => outline(document)).map(({ attributes }) => attributes["xml:base"])).toEqual([
			"https://example.com/a/b",
			"https://example.com/a/b"
		]);

	});

	it("reports a stated base that is not resolvable as the task is created", async () => {

		// stated once for the whole feed, so a base that cannot serve is reported before any document is drawn

		expect(() => html("../c/")).toThrow(RangeError);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `<div id="1"></div>`;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(html())(toArray())).rejects.toThrow("broken source");

	});

	it("emits a tree as soon as its document is drawn", async () => {

		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<string> {

			for (const index of Array.from({ length: 10 }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield `<div id="${index}"></div>`;

			}

		}

		const parsed = html()(items(source()))[Symbol.asyncIterator]();

		await parsed.next();

		expect(state.pulled).toBe(1);

		await parsed.return?.();

	});

});
