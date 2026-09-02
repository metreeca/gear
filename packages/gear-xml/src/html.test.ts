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

import type { Feed } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import type { NodeWithChildren } from "domhandler";
import { hasChildren, isTag, isText } from "domhandler";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { html } from "./html.js";


type Outline = {

	readonly name: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly Outline[];

}


/**
 * Creates a feed carrying the given documents.
 */
function documents(...values: readonly (string | Response)[]): Feed<string | Response> {
	return items((async function* () { yield* values; })());
}

/**
 * Reduces the element tree rooted at a node to its names and attributes.
 */
function outline(node: NodeWithChildren): readonly Outline[] {
	return node.children.filter(isTag).map(element => ({
		name: element.name,
		attributes: element.attribs,
		children: outline(element)
	}));
}

/**
 * Concatenates the character data of the tree rooted at a node.
 */
function text(node: NodeWithChildren): string {
	return node.children
		.map(child => isText(child) ? child.data : hasChildren(child) ? text(child) : "")
		.join("");
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("html", () => {

	it("emits the parsed document as a single value", async () => {

		const [ document, ...others ] = await documents(`<div id="1"><p>alpha</p></div>`)(html())(toArray());

		expect(others).toEqual([]);
		expect(outline(document)).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [{ name: "p", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("emits a document per item", async () => {

		const parsed = await documents(`<div id="1"></div>`, `<div id="2"></div>`)(html())(toArray());

		expect(parsed.map(document => outline(document))).toEqual([
			[{ name: "div", attributes: { id: "1" }, children: [] }],
			[{ name: "div", attributes: { id: "2" }, children: [] }]
		] satisfies readonly (readonly Outline[])[]);

	});

	it("emits the character data of the document", async () => {

		const [ document ] = await documents(`<div><p>alpha</p><p>beta</p></div>`)(html())(toArray());

		expect(text(document)).toBe("alphabeta");

	});

	it("folds element and attribute names to lowercase", async () => {

		const [ document ] = await documents(`<DIV ID="1"></DIV>`)(html())(toArray());

		expect(outline(document)).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("restores the camelCase names carried by inline SVG", async () => {

		const [ document ] = await documents(`<svg viewBox="0 0 16 16"><clipPath clipPathUnits="userSpaceOnUse"/></svg>`)
		(html())(toArray());

		expect(outline(document)).toEqual([
			{
				name: "svg", attributes: { viewBox: "0 0 16 16" },
				children: [{ name: "clipPath", attributes: { clipPathUnits: "userSpaceOnUse" }, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("restores the camelCase names carried by inline MathML", async () => {

		const [ document ] = await documents(`<math><mo definitionURL="urn:x"></mo></math>`)(html())(toArray());

		expect(outline(document)).toEqual([
			{
				name: "math", attributes: {},
				children: [{ name: "mo", attributes: { definitionURL: "urn:x" }, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("leaves the HTML content of a foreign element folded", async () => {

		// `foreignObject` holds HTML, where names are folded as everywhere else in the document

		const [ document ] = await documents(`<svg><foreignObject><div viewBox="x"></div></foreignObject></svg>`)
		(html())(toArray());

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

		const [ document ] = await documents(`<p>alpha</p>`)(html())(toArray());

		expect(outline(document)).toEqual([
			{ name: "p", attributes: {}, children: [] }
		] satisfies readonly Outline[]);

	});

	it("closes elements the source leaves implied", async () => {

		const [ document ] = await documents(`<ul><li>alpha<li>beta</ul>`)(html())(toArray());

		expect(outline(document)).toEqual([
			{
				name: "ul", attributes: {}, children: [
					{ name: "li", attributes: {}, children: [] },
					{ name: "li", attributes: {}, children: [] }
				]
			}
		] satisfies readonly Outline[]);

	});

	it("decodes entity references", async () => {

		const [ document ] = await documents(`<p>a&nbsp;&amp;&nbsp;b</p>`)(html())(toArray());

		expect(text(document)).toBe("a & b");

	});

	it("strips a byte order mark", async () => {

		const [ document ] = await documents(`﻿<div id="1"></div>`)(html())(toArray());

		expect(outline(document)).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("parses each application as a document of its own", async () => {

		const task = html();

		const [ first ] = await documents(`<div id="1"></div>`)(task)(toArray());
		const [ second ] = await documents(`<div id="2"></div>`)(task)(toArray());

		expect(outline(first)).toEqual([
			{ name: "div", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

		expect(outline(second)).toEqual([
			{ name: "div", attributes: { id: "2" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("yields no value if the source produces no documents", async () => {

		expect(await documents()(html())(toArray())).toEqual([]);

	});

	it("yields no value for a document holding only whitespace", async () => {

		expect(await documents(" \n\t ")(html())(toArray())).toEqual([]);

	});

	it("recovers from malformed markup rather than skipping the document", async () => {

		// parsing is forgiving: the element is closed at the end of the input rather than reported as an error

		const [ document ] = await documents(`<div><p>alpha`)(html())(toArray());

		expect(outline(document)).toEqual([
			{ name: "div", attributes: {}, children: [{ name: "p", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `<div id="1"></div>`;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(html())(toArray())).rejects.toThrow("broken source");

	});

	it("emits a document as soon as it is drawn", async () => {

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

	describe("responses", () => {

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


		it("reads the response body as the document", async () => {

			const [ document ] = await documents(response(`<div><p>alpha</p></div>`))(html())(toArray());

			expect(text(document)).toBe("alpha");

		});

		it("records the retrieval URL as an xml:base attribute on the root", async () => {

			const [ document ] = await documents(response(`<div></div>`, { url: "https://example.com/a/b" }))
			(html())(toArray());

			expect(outline(document)).toEqual([
				{ name: "div", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records the base stated by the document, resolved against the retrieval URL", async () => {

			const [ document ] = await documents(response(`<head><base href="../c/"></head><div></div>`, {
				url: "https://example.com/a/b"
			}))(html())(toArray());

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/c/",
				"https://example.com/c/"
			]);

		});

		it("records the first base stated by the document", async () => {

			const [ document ] = await documents(response(`<base href="/one/"><base href="/two/"><div></div>`, {
				url: "https://example.com/a/b"
			}))(html())(toArray());

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/one/",
				"https://example.com/one/",
				"https://example.com/one/"
			]);

		});

		it("records an absolute base stated by a document given as text", async () => {

			const [ document ] = await documents(`<base href="https://example.net/x/"><div></div>`)(html())(toArray());

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.net/x/",
				"https://example.net/x/"
			]);

		});

		it("records nothing for a relative base stated without a retrieval URL", async () => {

			const [ document ] = await documents(`<base href="../c/"><div></div>`)(html())(toArray());

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				undefined,
				undefined
			]);

		});

		it("records nothing for a response reporting no URL", async () => {

			const [ document ] = await documents(response(`<div></div>`))(html())(toArray());

			expect(outline(document)).toEqual([
				{ name: "div", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("decodes the response body as the charset it states", async () => {

			const bytes = Buffer.from(`<p>città</p>`, "latin1");

			const [ document ] = await documents(response(bytes, { type: "text/html; charset=ISO-8859-1" }))
			(html())(toArray());

			expect(text(document)).toBe("città");

		});

		it("decodes the response body as the charset the document declares", async () => {

			const bytes = Buffer.from(`<meta charset="ISO-8859-1"><p>città</p>`, "latin1");

			const [ document ] = await documents(response(bytes, { type: "text/html" }))(html())(toArray());

			expect(text(document)).toBe("città");

		});

		it("prefers the charset stated by the response to the one the document declares", async () => {

			const bytes = Buffer.from(`<meta charset="ISO-8859-1"><p>città</p>`, "utf8");

			const [ document ] = await documents(response(bytes, { type: "text/html; charset=utf-8" }))
			(html())(toArray());

			expect(text(document)).toBe("città");

		});

		it("ignores a charset declared beyond the opening bytes", async () => {

			const filler = `<!--${"x".repeat(1024)}-->`; // pushes the declaration past the prescan limit

			const bytes = Buffer.from(`${filler}<meta charset="ISO-8859-1"><p>città</p>`, "latin1");

			const [ document ] = await documents(response(bytes, { type: "text/html" }))(html())(toArray());

			expect(text(document)).toContain("citt�"); // read as UTF-8, so the latin1 byte is not decodable

		});

		it("decodes the response body as UTF-8 where neither states a charset", async () => {

			const bytes = Buffer.from(`<p>città</p>`, "utf8");

			const [ document ] = await documents(response(bytes))(html())(toArray());

			expect(text(document)).toBe("città");

		});

		it("strips a byte order mark from the response body", async () => {

			const bytes = Buffer.from(`﻿<div id="1"></div>`, "utf8");

			const [ document ] = await documents(response(bytes, { type: "text/html; charset=utf-8" }))
			(html())(toArray());

			expect(outline(document)).toEqual([
				{ name: "div", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating a content type other than HTML", async () => {

			// a mis-declared type is reported to the log and read all the same, as parsing never fails anyway

			const [ document ] = await documents(response(`<div id="1"></div>`, { type: "text/plain" }))
			(html())(toArray());

			expect(outline(document)).toEqual([
				{ name: "div", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating an unknown charset as UTF-8", async () => {

			// a charset the platform doesn't decode is reported to the log and the body read as UTF-8 all the same

			const bytes = Buffer.from(`<p>città</p>`, "utf8");

			const [ document ] = await documents(response(bytes, { type: "text/html; charset=bogus" }))
			(html())(toArray());

			expect(text(document)).toBe("città");

		});

		it("yields no value for a response without a body", async () => {

			expect(await documents(response(null))(html())(toArray())).toEqual([]);

		});

	});

});
