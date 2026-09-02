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

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import type { AnyNode, Document, Element } from "domhandler";
import { isDocument, isTag } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";
import { describe, expect, it } from "vitest";
import { process } from "./focus.core.js";
import { focus } from "./focus.js";


/**
 * Parses a document as HTML.
 */
function tree(markup: string): Document {
	return parseDocument(markup);
}

/**
 * Renders a node as markup.
 */
function markup(node: undefined | AnyNode): undefined | string {
	return node === undefined ? undefined : DomUtils.getOuterHTML(node);
}

/**
 * Reports the `xml:base` recorded by the root of a document.
 */
function base(document: undefined | Document): undefined | string {
	return document?.children.filter(isTag)[0]?.attribs["xml:base"];
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("process", () => {

	describe("landmarks", () => {

		it("selects the main element", async () => {

			expect(markup(process(tree(`<nav>alpha</nav><main><p>beta</p></main>`))))
				.toBe("<main><p>beta</p></main>");

		});

		it("selects an element stating the main role where no main element is stated", async () => {

			expect(markup(process(tree(`<nav>alpha</nav><div role="main"><p>beta</p></div>`))))
				.toBe(`<div role="main"><p>beta</p></div>`);

		});

		it("selects the articles stated where no main element or role is stated", async () => {

			expect(markup(process(tree(`<nav>alpha</nav><article><p>beta</p></article>`))))
				.toBe("<article><p>beta</p></article>");

		});

		it("prefers a main element to an article", async () => {

			expect(markup(process(tree(`<article><p>alpha</p></article><main><p>beta</p></main>`))))
				.toBe("<main><p>beta</p></main>");

		});

		it("prefers an element stating the main role to an article", async () => {

			expect(markup(process(tree(`<article><p>alpha</p></article><div role="main"><p>beta</p></div>`))))
				.toBe(`<div role="main"><p>beta</p></div>`);

		});

		it("selects the first landmark stated", async () => {

			expect(markup(process(tree(`<main><p>alpha</p></main><main><p>beta</p></main>`))))
				.toBe("<main><p>alpha</p></main>");

		});

		it("matches element names case insensitively", async () => {

			expect(markup(process(parseDocument(`<MAIN><P>alpha</P></MAIN>`, { xmlMode: true }))))
				.toBe("<MAIN><P>alpha</P></MAIN>");

		});

	});

	describe("articles", () => {

		it("selects every article the page states", async () => {

			expect(markup(process(tree(`<article><p>alpha</p></article><article><p>beta</p></article>`))))
				.toBe("<article><p>alpha</p></article><article><p>beta</p></article>");

		});

		it("selects articles wherever they sit in the page", async () => {

			expect(markup(process(tree(`<div><section><article><p>alpha</p></article></section></div>`))))
				.toBe("<article><p>alpha</p></article>");

		});

		it("leaves out articles held by framing", async () => {

			expect(markup(process(tree(
				`<aside><article><p>alpha</p></article></aside><article><p>beta</p></article>`
			))))
				.toBe("<article><p>beta</p></article>");

		});

		it("takes the outermost of nested articles", async () => {

			expect(markup(process(tree(`<article><p>alpha</p><article><p>beta</p></article></article>`))))
				.toBe("<article><p>alpha</p><article><p>beta</p></article></article>");

		});

		it("scores the page where its articles hold no text", async () => {

			expect(markup(process(tree(`<article><img src="cat.png"></article><div><p>alpha beta</p></div>`))))
				.toBe(`<div><p>alpha beta</p></div>`);

		});

	});

	describe("density", () => {

		it("selects the element holding the densest text", async () => {

			expect(markup(process(tree(
				`<div id="teaser"><p>alpha beta</p></div>`
				+`<div id="body"><p>alpha beta gamma delta epsilon</p></div>`
			))))
				.toBe(`<div id="body"><p>alpha beta gamma delta epsilon</p></div>`);

		});

		it("prefers a long run of text to the same amount scattered across short ones", async () => {

			expect(markup(process(tree(
				`<div id="run"><p>alpha beta gamma delta</p></div>`
				+`<div id="bits"><p>alpha beta</p><p>gamma delta</p></div>`
			))))
				.toBe(`<div id="run"><p>alpha beta gamma delta</p></div>`);

		});

		it("leaves the text held by framing elements out of the reckoning", async () => {

			expect(markup(process(tree(
				`<nav><a href="/">alpha beta gamma delta epsilon zeta eta theta</a></nav>`
				+`<section><p>iota kappa</p></section>`
			))))
				.toBe(`<section><p>iota kappa</p></section>`);

		});

		it("selects the outermost of equally dense elements", async () => {

			expect(markup(process(tree(`<div id="outer"><div id="inner"><p>alpha beta</p></div></div>`))))
				.toBe(`<div id="outer"><div id="inner"><p>alpha beta</p></div></div>`);

		});

	});

	describe("documents", () => {

		it("roots the content in a document of its own", async () => {

			const document = process(tree(`<main><p>alpha</p></main>`));

			expect(document !== undefined && isDocument(document)).toBe(true);
			expect(document?.children.map(node => isTag(node) && node.name)).toEqual([ "main" ]);
			expect(document?.children[0]?.parent).toBe(document);

		});

		it("leaves the tree drawn from untouched", async () => {

			const source = tree(`<nav>alpha</nav><main><p>beta</p></main>`);
			const before = DomUtils.getOuterHTML(source);

			process(source);

			expect(DomUtils.getOuterHTML(source)).toBe(before);

		});

		it("converts a tree holding no content to undefined", async () => {

			expect(process(tree(`   `))).toBeUndefined();

		});

		it("ignores a tree holding nothing but framing", async () => {

			expect(process(tree(`<script>const alpha = 1;</script>`))).toBeUndefined();

		});

	});

	describe("bases", () => {

		it("records the base URL stated by the tree", async () => {

			expect(base(process(tree(
				`<html xml:base="https://example.com/docs/index.html"><main><p>alpha</p></main></html>`
			))))
				.toBe("https://example.com/docs/index.html");

		});

		it("resolves the base URL stated by the content against the one stated by the tree", async () => {

			expect(base(process(tree(
				`<html xml:base="https://example.com/docs/index.html">`
				+`<main xml:base="sub/page.html"><p>alpha</p></main>`
				+`</html>`
			))))
				.toBe("https://example.com/docs/sub/page.html");

		});

		it("records the base URL on every root", async () => {

			const document = process(tree(
				`<html xml:base="https://example.com/docs/index.html">`
				+`<article><p>alpha</p></article><article><p>beta</p></article>`
				+`</html>`
			));

			expect(document?.children.filter(isTag).map(root => root.attribs["xml:base"]))
				.toEqual([ "https://example.com/docs/index.html", "https://example.com/docs/index.html" ]);

		});

		it("records no base URL where the tree states none", async () => {

			expect(base(process(tree(`<main><p>alpha</p></main>`)))).toBeUndefined();

		});

		it("keeps a base URL that cannot be resolved as stated", async () => {

			expect(base(process(tree(`<main xml:base="sub/page.html"><p>alpha</p></main>`))))
				.toBe("sub/page.html");

		});

	});

	describe("samples", () => {

		/**
		 * The folder holding the pages the extractor is tuned against, saved as retrieved on 2026-09-02.
		 *
		 * The folder is read rather than a list, so a page dropped in it is covered as soon as the expectations below
		 * state what the extractor is to reduce it to. `matematica.unipv.it` answers `curl` and Node's `fetch` with a
		 * `403` whatever headers are set, so its page has to be saved from a browser or from the IntelliJ HTTP client.
		 */
		const folder = join(import.meta.dirname, "focus");

		/**
		 * Reports the pages the folder holds, named as the expectations state them.
		 */
		async function collected(): Promise<readonly string[]> {
			return (await readdir(folder)).filter(file => file.endsWith(".html")).map(file => basename(file, ".html"));
		}

		/**
		 * Parses the page the folder holds under a name.
		 */
		async function page(name: string): Promise<Document> {
			return tree(await readFile(join(folder, `${ name }.html`), "utf-8"));
		}

		/**
		 * The region each page is expected to be reduced to, with the content it keeps and the framing it leaves,
		 * alongside the URL the page was drawn from.
		 */
		const samples = {

			"agenda-coimbra-event": {
				source: "https://agenda.coimbra.pt/event/ykclqzc9xdssmeu9",
				regions: [ "div#main" ],
				holds: [ "Núcleo da Guitarra e do Fado de Coimbra", "Torre de Anto" ],
				drops: [ "Aviso Legal", "agendacoimbra@coimbra.pt" ]
			},

			"guardian-vuelta-stage": {
				source: "https://www.theguardian.com/sport/2026/sep/01/bastien-tronchon-claims-surprise-vuelta-stage-victory-in-thrilling-bunch-finish-cycling",
				regions: [ "main" ],
				holds: [ "Bastien Tronchon" ],
				drops: [ "International edition" ]
			},

			"matematica-unipv-home": {
				source: "https://matematica.unipv.it/",
				regions: [ "div#content" ],
				holds: [ "Matematica a Pavia", "Eventi e appuntamenti" ],
				drops: [ "Come raggiungerci", "Link utili" ]
			},

			"phd-unipv-safd": {
				source: "https://phd.unipv.it/la-scuola-di-alta-formazione-dottorale-di-pavia-safd/",
				regions: [ "div.page-content-container" ],
				holds: [ "Scuola di Alta Formazione Dottorale" ],
				drops: [ "Webmail", "Accessibilità" ]
			},

			"portale-unipv-dipartimenti": {
				source: "https://portale.unipv.it/it/ricerca/strutture-di-ricerca/dipartimenti",
				regions: [ "main#content" ],
				holds: [ "Presso i Dipartimenti" ],
				drops: [ "Futuro studente", "Webmail" ]
			},

			"unipv-news-summer-school": {
				source: "https://www.unipv.news/eventi/7th-pavia-summer-school-indo-european-linguistics",
				regions: [ "main#content" ],
				holds: [ "Pavia Summer School" ],
				drops: [ "Archivio newsletter" ]
			}

		};

		/**
		 * Reports an element as `tag#id`, or as `tag.class` where it states no id.
		 */
		function label(element: Element): string {

			const id = element.attribs["id"];
			const [ style ] = element.attribs["class"]?.trim().split(/\s+/) ?? [];

			return id !== undefined ? `${ element.name }#${ id }`
				: style !== undefined ? `${ element.name }.${ style }`
					: element.name;

		}

		/**
		 * Reports the text a reader sees, with the layout of the source collapsed to single spaces.
		 */
		function reading(document: Document): string {
			return DomUtils.innerText(document.children).replace(/\s+/g, " ").trim();
		}

		it("states an expectation for every page", async () => {

			expect([ ...await collected() ].sort()).toEqual(Object.keys(samples).sort());

		});

		it.each(Object.entries(samples))("reduces %s to its content", async (name, { regions, holds, drops }) => {

			const source = await page(name);
			const document = process(source);

			expect(document?.children.filter(isTag).map(label)).toEqual(regions);

			const content = document === undefined ? "" : reading(document);
			const whole = reading(source);

			holds.forEach(marker => {
				expect(content).toContain(marker);
			});

			drops.forEach(marker => {
				expect(whole).toContain(marker); // the page states the marker…
				expect(content).not.toContain(marker); // …and the extraction leaves it behind
			});

		});

	});

});

describe("focus", () => {

	it("emits the content of each tree in turn", async () => {

		const trees: readonly AnyNode[] = [
			tree(`<nav>alpha</nav><main><p>beta</p></main>`),
			tree(`<main><p>gamma</p></main>`)
		];

		expect((await items(trees)(focus())(toArray())).map(document => DomUtils.getOuterHTML(document)))
			.toEqual([ "<main><p>beta</p></main>", "<main><p>gamma</p></main>" ]);

	});

	it("drops trees holding no content", async () => {

		const trees: readonly AnyNode[] = [ tree(``), tree(`<main><p>alpha</p></main>`) ];

		expect((await items(trees)(focus())(toArray())).map(document => DomUtils.getOuterHTML(document)))
			.toEqual([ "<main><p>alpha</p></main>" ]);

	});

});
