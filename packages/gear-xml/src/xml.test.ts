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
import { xml } from "./xml.js";


type Outline = {

	readonly name: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly Outline[];

}


/**
 * Creates a feed carrying the given chunks.
 */
function chunks(...values: readonly (string | Uint8Array | Response)[]): Feed<string | Uint8Array | Response> {
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

describe("xml", () => {

	it("emits the parsed document as a single value", async () => {

		const [ document, ...others ] = await chunks(`<item id="1"><label>alpha</label></item>`)(xml())(toArray());

		expect(others).toEqual([]);
		expect(outline(document)).toEqual([
			{ name: "item", attributes: { id: "1" }, children: [{ name: "label", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("emits the character data of the document", async () => {

		const [ document ] = await chunks(`<item><label>alpha</label><label>beta</label></item>`)(xml())(toArray());

		expect(text(document)).toBe("alphabeta");

	});

	it("preserves element and attribute name case", async () => {

		const [ document ] = await chunks(`<Item ID="1"/>`)(xml())(toArray());

		expect(outline(document)).toEqual([
			{ name: "Item", attributes: { ID: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("retains namespace prefixes as part of the name", async () => {

		const [ document ] = await chunks(`<r xmlns:d="urn:x"><d:b/></r>`)(xml())(toArray());

		expect(outline(document)).toEqual([
			{
				name: "r", attributes: { "xmlns:d": "urn:x" },
				children: [{ name: "d:b", attributes: {}, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("decodes entity references", async () => {

		const [ document ] = await chunks(`<item>a &amp; b</item>`)(xml())(toArray());

		expect(text(document)).toBe("a & b");

	});

	it("joins documents split across chunks", async () => {

		const [ document ] = await chunks(`<item id="1"><lab`, `el>alp`, `ha</label></item>`)(xml())(toArray());

		expect(text(document)).toBe("alpha");

	});

	it("parses each application as a document of its own", async () => {

		const task = xml();

		const [ first ] = await chunks(`<item id="1"/>`)(task)(toArray());
		const [ second ] = await chunks(`<item id="2"/>`)(task)(toArray());

		expect(outline(first)).toEqual([
			{ name: "item", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

		expect(outline(second)).toEqual([
			{ name: "item", attributes: { id: "2" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("yields no value if the source produces no chunks", async () => {

		expect(await chunks()(xml())(toArray())).toEqual([]);

	});

	it("yields no value if the source produces only whitespace", async () => {

		expect(await chunks(" \n\t ")(xml())(toArray())).toEqual([]);

	});

	it("recovers from malformed markup rather than skipping the document", async () => {

		// parsing is forgiving: the element is closed at the end of the input rather than reported as an error

		const [ document ] = await chunks(`<item><label>alpha`)(xml())(toArray());

		expect(outline(document)).toEqual([
			{ name: "item", attributes: {}, children: [{ name: "label", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `<item id="1"`;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(xml())(toArray())).rejects.toThrow("broken source");

	});

	it("drains the source before emitting the document", async () => {

		const count = 1_000;
		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<string> {

			yield "<items>";

			for (const index of Array.from({ length: count }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield `<item id="${index}"/>`;

			}

			yield "</items>";

		}

		const documents = xml()(items(source()))[Symbol.asyncIterator]();

		await documents.next();

		expect(state.pulled).toBe(count);

	});

	describe("responses", () => {

		/**
		 * Creates a response reporting the given retrieval URL.
		 *
		 * `Response` computes `url` from the exchange that produced it, so a synthesised one always reports an empty
		 * string: the own property shadows the prototype getter to stand in for a real exchange.
		 */
		function response(body: string, url?: string): Response {
			return url === undefined ? new Response(body) : Object.defineProperty(new Response(body), "url", {
				value: url
			});
		}

		it("reads the response body as the document", async () => {

			const [ document ] = await chunks(response(`<item><label>alpha</label></item>`))(xml())(toArray());

			expect(text(document)).toBe("alpha");

		});

		it("records the retrieval URL as an xml:base attribute on the root", async () => {

			const [ document ] = await chunks(response(`<item/>`, "https://example.com/a/b"))(xml())(toArray());

			expect(outline(document)).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records the retrieval URL on every root element", async () => {

			const [ document ] = await chunks(response(`<a/><b/>`, "https://example.com/a/b"))(xml())(toArray());

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/a/b",
				"https://example.com/a/b"
			]);

		});

		it("resolves a declared xml:base against the retrieval URL", async () => {

			const [ document ] = await chunks(response(`<item xml:base="../c/"/>`, "https://example.com/a/b"))
			(xml())(toArray());

			expect(outline(document)).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/c/" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("leaves a declared xml:base untouched without a retrieval URL", async () => {

			const [ document ] = await chunks(`<item xml:base="https://example.net/x"/>`)(xml())(toArray());

			expect(outline(document)).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.net/x" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records nothing for a response reporting no URL", async () => {

			const [ document ] = await chunks(response(`<item/>`))(xml())(toArray());

			expect(outline(document)).toEqual([
				{ name: "item", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records nothing for text or byte chunks", async () => {

			const [ document ] = await chunks(`<item/>`)(xml())(toArray());

			expect(outline(document)).toEqual([
				{ name: "item", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("joins a response with surrounding text chunks", async () => {

			const [ document ] = await chunks(`<item>`, response(`alpha`), `</item>`)(xml())(toArray());

			expect(text(document)).toBe("alpha");

		});

	});

	describe("decoding", () => {

		it("decodes multibyte characters split across byte chunks", async () => {

			const bytes = Buffer.from(`<item>città</item>`, "utf8");
			const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

			const [ document ] = await chunks(bytes.subarray(0, cut), bytes.subarray(cut))(xml())(toArray());

			expect(text(document)).toBe("città");

		});

		it("decodes multibyte characters split across byte chunks resuming after text chunks", async () => {

			const bytes = Buffer.from(`città</item>`, "utf8");
			const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

			const [ document ] = await chunks(`<item>`, bytes.subarray(0, cut), bytes.subarray(cut))
			(xml())(toArray());

			expect(text(document)).toBe("città");

		});

	});

});
