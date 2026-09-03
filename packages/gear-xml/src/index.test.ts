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

import { parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { boolean, link, number, string } from "./index.js";
import { select, type Target } from "./xpath.core.js";


/**
 * Selects the sole node an expression addresses in a document parsed from text.
 */
function node(text: string, path: string): Target {

	const nodes = select(parseDocument(text, { xmlMode: true }), path);

	expect(nodes).toHaveLength(1);

	const [ node ] = nodes;

	if ( node === undefined ) {
		throw new Error("no node selected");
	}

	return node;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("boolean", () => {

	it("reads the boolean the text names", async () => {

		expect(boolean(node(`<item>true</item>`, "//item"))).toBe(true);
		expect(boolean(node(`<item>false</item>`, "//item"))).toBe(false);

	});

	it("reads a boolean an expression computed", async () => {

		expect(boolean(true)).toBe(true);
		expect(boolean(false)).toBe(false);

	});

	it.each([ "yes", "1", "0", "" ])("reports text naming no boolean <%s>", async text => {

		expect(() => boolean(node(`<item>${text}</item>`, "//item"))).toThrow(TypeError);

	});

});

describe("number", () => {

	it("reads the number the text names", async () => {

		expect(number(node(`<item>42</item>`, "//item"))).toBe(42);

	});

	it("reads a decimal number", async () => {

		expect(number(node(`<item> -1.5 </item>`, "//item"))).toBe(-1.5);

	});

	it("reads a number an expression computed", async () => {

		expect(number(2)).toBe(2);

	});

	it("reports text naming no number", async () => {

		expect(() => number(node(`<item>alpha</item>`, "//item"))).toThrow(TypeError);

	});

	it("reports text holding no number", async () => {

		expect(() => number(node(`<item/>`, "//item"))).toThrow(TypeError);

	});

});

describe("string", () => {

	it("reads the text an element holds", async () => {

		expect(string(node(`<item>alpha<tag>beta</tag></item>`, "//item"))).toBe("alphabeta");

	});

	it("reads the value of an attribute", async () => {

		expect(string(node(`<item id="alpha"/>`, "//@id"))).toBe("alpha");

	});

	it("tidies the whitespace the text is laid out with", async () => {

		expect(string(node(`<item>\n\talpha  beta\n</item>`, "//item"))).toBe("alpha beta");

	});

	it("reads an element holding no text as empty", async () => {

		expect(string(node(`<item/>`, "//item"))).toBe("");

	});

	it("reads a value an expression computed", async () => {

		expect(string("alpha")).toBe("alpha");
		expect(string(2)).toBe("2");
		expect(string(true)).toBe("true");

	});

});

describe("link", () => {

	it("resolves a reference against the base the tree states", async () => {

		expect(link(node(`<catalog xml:base="https://example.net/data/"><item href="a"/></catalog>`, "//@href")))
			.toBe("https://example.net/data/a");

	});

	it("resolves a reference against the base the closest ancestor states", async () => {

		expect(link(node(`
			<catalog xml:base="https://example.net/data/">
				<group xml:base="inner/"><item href="a"/></group>
			</catalog>
		`, "//@href"))).toBe("https://example.net/data/inner/a");

	});

	it("leaves an absolute reference as it stands", async () => {

		expect(link(node(`<catalog xml:base="https://example.net/data/"><item href="https://example.com/a"/></catalog>`,
			"//@href"
		))).toBe("https://example.com/a");

	});

	it("leaves a reference drawn from a tree stating no base as it stands", async () => {

		expect(link(node(`<item href="a"/>`, "//@href"))).toBe("a");

	});

	it("reports text naming no reference", async () => {

		expect(() => link(node(`<item href="a b"/>`, "//@href"))).toThrow(TypeError);

	});

});

