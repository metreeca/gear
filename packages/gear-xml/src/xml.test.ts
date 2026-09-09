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
import { process } from "./xml.core.js";
import { xml } from "./xml.js";


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

		expect(outline(await process(`<item id="1"><label>alpha</label></item>`))).toEqual([
			{ name: "item", attributes: { id: "1" }, children: [{ name: "label", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("reads the character data of the document", async () => {

		expect(text(await process(`<item><label>alpha</label><label>beta</label></item>`))).toBe("alphabeta");

	});

	it("preserves element and attribute name case", async () => {

		expect(outline(await process(`<Item ID="1"/>`))).toEqual([
			{ name: "Item", attributes: { ID: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("retains namespace prefixes as part of the name", async () => {

		expect(outline(await process(`<r xmlns:d="urn:x"><d:b/></r>`))).toEqual([
			{
				name: "r", attributes: { "xmlns:d": "urn:x" },
				children: [{ name: "d:b", attributes: {}, children: [] }]
			}
		] satisfies readonly Outline[]);

	});

	it("decodes entity references", async () => {

		expect(text(await process(`<item>a &amp; b</item>`))).toBe("a & b");

	});

	it("strips a byte order mark", async () => {

		expect(outline(await process(`﻿<item id="1"/>`))).toEqual([
			{ name: "item", attributes: { id: "1" }, children: [] }
		] satisfies readonly Outline[]);

	});

	it("recovers from malformed markup rather than skipping the document", async () => {

		// parsing is forgiving: the element is closed at the end of the input rather than reported as an error

		expect(outline(await process(`<item><label>alpha`))).toEqual([
			{ name: "item", attributes: {}, children: [{ name: "label", attributes: {}, children: [] }] }
		] satisfies readonly Outline[]);

	});

	it("converts a document holding only whitespace to undefined", async () => {

		expect(await process(" \n\t ")).toBeUndefined();

	});

	describe("responses", () => {

		it("reads the response body as the document", async () => {

			expect(text(await process(response(`<item><label>alpha</label></item>`)))).toBe("alpha");

		});

		it("records the retrieval URL as an xml:base attribute on the root", async () => {

			expect(outline(await process(response(`<item/>`, { url: "https://example.com/a/b" })))).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records the retrieval URL on every root element", async () => {

			const document = await process(response(`<a/><b/>`, { url: "https://example.com/a/b" }));

			expect(outline(document).map(({ attributes }) => attributes["xml:base"])).toEqual([
				"https://example.com/a/b",
				"https://example.com/a/b"
			]);

		});

		it("resolves a declared xml:base against the retrieval URL", async () => {

			const document = await process(response(`<item xml:base="../c/"/>`, { url: "https://example.com/a/b" }));

			expect(outline(document)).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/c/" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("leaves a declared xml:base untouched without a retrieval URL", async () => {

			expect(outline(await process(`<item xml:base="https://example.net/x"/>`))).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.net/x" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records nothing for a response reporting no URL", async () => {

			expect(outline(await process(response(`<item/>`)))).toEqual([
				{ name: "item", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records nothing for a document given as text", async () => {

			expect(outline(await process(`<item/>`))).toEqual([
				{ name: "item", attributes: {}, children: [] }
			] satisfies readonly Outline[]);

		});

		it("decodes the response body as the charset it states", async () => {

			const bytes = Buffer.from(`<item>città</item>`, "latin1");

			expect(text(await process(response(bytes, { type: "application/xml; charset=ISO-8859-1" }))))
				.toBe("città");

		});

		it("decodes the response body as UTF-8 where it states no charset", async () => {

			const bytes = Buffer.from(`<item>città</item>`, "utf8");

			expect(text(await process(response(bytes)))).toBe("città");

		});

		it("strips a byte order mark from the response body", async () => {

			const bytes = Buffer.from(`﻿<item id="1"/>`, "utf8");

			expect(outline(await process(response(bytes, { type: "application/xml; charset=utf-8" })))).toEqual([
				{ name: "item", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating a content type other than XML", async () => {

			// a mis-declared type is reported to the log and read all the same, as parsing never fails anyway

			expect(outline(await process(response(`<item id="1"/>`, { type: "text/plain" })))).toEqual([
				{ name: "item", attributes: { id: "1" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reads a response stating an unknown charset as UTF-8", async () => {

			// a charset the platform doesn't decode is reported to the log and the body read as UTF-8 all the same

			const bytes = Buffer.from(`<item>città</item>`, "utf8");

			expect(text(await process(response(bytes, { type: "application/xml; charset=bogus" })))).toBe("città");

		});

		it("converts a response without a body to undefined", async () => {

			expect(await process(response(null))).toBeUndefined();

		});

	});

	describe("bases", () => {

		it("records a stated base as an xml:base attribute on the root", async () => {

			expect(outline(await process(`<item/>`, "https://example.com/a/b"))).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/a/b" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("records a stated base in place of the retrieval URL", async () => {

			const document = await process(response(`<item/>`, { url: "https://example.com/a/b" }),
				"https://example.net/x/"
			);

			expect(outline(document)).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.net/x/" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("resolves a declared xml:base against a stated base", async () => {

			expect(outline(await process(`<item xml:base="../c/"/>`, "https://example.com/a/b"))).toEqual([
				{ name: "item", attributes: { "xml:base": "https://example.com/c/" }, children: [] }
			] satisfies readonly Outline[]);

		});

		it("reports a stated base that is a relative reference", async () => {

			await expect(process(`<item/>`, "../c/")).rejects.toThrow(RangeError);

		});

		it("reports a stated base that is a relative reference, whatever the retrieval URL", async () => {

			// a base is taken as it stands, so the retrieval URL never stands in as the one to resolve it against

			await expect(process(response(`<item/>`, { url: "https://example.com/a/b" }), "../c/"))
				.rejects.toThrow(RangeError);

		});

		it("reports a stated base that cannot serve as a resolution base", async () => {

			await expect(process(`<item/>`, "urn:example:x")).rejects.toThrow(RangeError);

		});

	});

});

describe("xml", () => {

	it("emits the tree of each document in turn", async () => {

		const documents: readonly string[] = [ `<item id="1"/>`, `<item id="2"/>` ];

		expect((await items(documents)(xml())(toArray())).map(document => outline(document))).toEqual([
			[{ name: "item", attributes: { id: "1" }, children: [] }],
			[{ name: "item", attributes: { id: "2" }, children: [] }]
		] satisfies readonly (readonly Outline[])[]);

	});

	it("drops documents holding no text", async () => {

		const documents: readonly string[] = [ " \n\t ", `<item id="1"/>` ];

		expect((await items(documents)(xml())(toArray())).map(document => outline(document))).toEqual([
			[{ name: "item", attributes: { id: "1" }, children: [] }]
		] satisfies readonly (readonly Outline[])[]);

	});

	it("records the stated base on every tree", async () => {

		const documents: readonly string[] = [ `<item id="1"/>`, `<item id="2"/>` ];

		const trees = await items(documents)(xml("https://example.com/a/b"))(toArray());

		expect(trees.flatMap(document => outline(document)).map(({ attributes }) => attributes["xml:base"])).toEqual([
			"https://example.com/a/b",
			"https://example.com/a/b"
		]);

	});

	it("reports a stated base that is not resolvable as the task is created", async () => {

		// stated once for the whole feed, so a base that cannot serve is reported before any document is drawn

		expect(() => xml("../c/")).toThrow(RangeError);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `<item id="1"/>`;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(xml())(toArray())).rejects.toThrow("broken source");

	});

	it("emits a tree as soon as its document is drawn", async () => {

		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<string> {

			for (const index of Array.from({ length: 10 }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield `<item id="${index}"/>`;

			}

		}

		const parsed = xml()(items(source()))[Symbol.asyncIterator]();

		await parsed.next();

		expect(state.pulled).toBe(1);

		await parsed.return?.();

	});

});
