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

import type { AnyNode, Element } from "domhandler";
import { cloneNode, Document, hasChildren, isTag, isText } from "domhandler";
import { DomUtils } from "htmlparser2";


/**
 * The whitespace runs collapsed to a single space when character data is weighed.
 *
 * Matches spaces and the control characters markup is laid out with, line feeds and tabs among them, so that the
 * layout of the source doesn't weigh on the text.
 */
const Space = /[ \x00-\x1F\x7F]+/g;


/**
 * The elements carrying text a reader is after.
 *
 * Lists the markup a page states its content with, headings, paragraphs, lists, tables and inline emphasis among them,
 * so that a container is weighed by how much of it is content rather than framing.
 */
const Textual = new Set([

	"h1", "h2", "h3", "h4", "h5", "h6",
	"p", "blockquote", "pre",
	"ul", "ol", "dl", "li", "dt", "dd",
	"table", "th", "td",
	"article", "section", "div", "span",
	"em", "strong", "b", "i", "u", "mark",
	"a", "time", "address", "cite", "q",
	"code", "kbd", "samp", "var",
	"small", "sub", "sup", "del", "ins"

]);

/**
 * The elements carrying no text a reader is after.
 *
 * Lists the markup a page is framed by, navigation, headers, footers and sidebars among them, alongside the scripts,
 * styles, controls and embedded objects a reader never reads, so that whatever they hold is left out of the reckoning.
 */
const Ignored = new Set([

	"style", "script", "noscript",
	"nav", "header", "footer", "aside",
	"menu", "menuitem", "toolbar",
	"iframe", "embed", "object", "applet",
	"form", "input", "button", "select", "textarea", "label", "fieldset", "legend",
	"canvas", "svg", "audio", "video", "track", "source"

]);

/**
 * The scan of a subtree holding no text.
 */
const Empty: Scan = {

	xchars: 0,
	echars: 0,
	densest: undefined,
	density: 0

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The text weight of a subtree.
 */
type Scan = {

	/**
	 * The raw weight of the text held by the subtree.
	 */
	readonly xchars: number;

	/**
	 * The effective weight of the text held by the subtree, discounted by the framing it is diluted with.
	 */
	readonly echars: number;

	/**
	 * The densest element in the subtree, if any carries text.
	 */
	readonly densest: undefined | Element;

	/**
	 * The effective weight of the densest element in the subtree.
	 */
	readonly density: number;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Extracts the main content of a markup tree.
 *
 * Draws from an X/HTML page the region carrying its main textual content, leaving behind the navigation, headers,
 * footers, sidebars and controls the page is framed by, so that a consumer works on the content it is after rather
 * than on the boilerplate around it.
 *
 * The region is the one the page marks as its own: the first `main` element, or the first element stating
 * `role="main"` where the page states no `main`. Names are matched as the tree carries them, case insensitively.
 *
 * Where the page marks none, the regions are the `article` elements it states, taken together, so that a page listing
 * entries is handed over whole rather than reduced to whichever entry comes first. Articles held by navigation,
 * headers, footers, sidebars and the other framing a reader is not after are left out, as are the ones nested inside
 * another article, which the enclosing one already carries. Articles carrying no text at all are widgets rather than
 * content, and leave the page to be scored.
 *
 * Where the page states none either, the region is the element holding the densest text: a long run of text counts for
 * more than the same amount of text scattered across short ones, and a container counts by how much of what it holds is
 * content rather than framing. Scripts, styles, navigation, headers, footers, sidebars, controls and embedded objects
 * count for nothing, whatever they hold, so a page framed by long menus is scored on its prose alone. Where two
 * elements are equally dense the one stated first wins, which is the outermost of a chain of sole children.
 *
 * @param node The root of the tree to draw content from; only its descendants are considered, so a tree rooted at the
 *             very element carrying the content is scanned for a region inside it
 *
 * @returns A document rooted at a copy of each region carrying the main content of the tree rooted at `node`, several
 *          roots where the page states several articles; `undefined` if the tree holds no content. Each root records as
 *          `xml:base` the URL relative references in it resolve against, where the tree states one, so that they
 *          resolve as they did however deeply the region sat in the page. The tree drawn from is left untouched
 *
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-main-element WHATWG HTML - The main element}
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-article-element WHATWG HTML - The article
 * element}
 * @see {@link https://www.w3.org/TR/wai-aria-1.2/#main WAI-ARIA - main role}
 */
export function process(node: AnyNode): undefined | Document {

	const nodes = hasChildren(node) ? node.children : [];
	const regions = marked(nodes) ?? articles(nodes) ?? dense(nodes);

	return regions === undefined ? undefined : extract(regions);


	// the region a page marks as its own is taken as stated, however dense the text it holds

	function marked(nodes: readonly AnyNode[]): undefined | readonly Element[] {

		const element = first(element => name(element) === "main")
			?? first(element => element.attribs["role"]?.toLowerCase() === "main");

		return element === undefined ? undefined : [ element ];


		function first(test: (element: Element) => boolean): undefined | Element {
			return DomUtils.findOne(test, [ ...nodes ], true) ?? undefined; // searched as stated, in document order
		}

	}


	// a page states as many articles as it lists, so they are taken together rather than one standing for the rest

	function articles(nodes: readonly AnyNode[]): undefined | readonly Element[] {

		const stated = outermost(nodes);

		// articles carrying no text are widgets rather than content, and leave the page to be scored

		return stated.length > 0 && scan(stated).density > 0 ? stated : undefined;


		function outermost(nodes: readonly AnyNode[]): readonly Element[] {
			return nodes.filter(isTag).flatMap(element => name(element) === "article" ? [ element ] // holds its own
				: Ignored.has(name(element)) ? [] // framing lists articles a reader is not after
					: outermost(element.children)
			);
		}

	}


	function dense(nodes: readonly AnyNode[]): undefined | readonly Element[] {

		const { densest } = scan(nodes);

		return densest === undefined ? undefined : [ densest ];

	}


	// text weighs by the square of its length, so that a long run outweighs the same amount of text scattered around

	function scan(nodes: readonly AnyNode[]): Scan {

		return nodes.map(weigh).reduce((total, item) => ({

			xchars: total.xchars+item.xchars,
			echars: total.echars+item.echars,

			densest: item.density > total.density ? item.densest : total.densest, // the first of equals is the outermost
			density: Math.max(total.density, item.density)

		}), Empty);


		function weigh(node: AnyNode): Scan {

			return isTag(node) ? (Ignored.has(name(node)) ? Empty : weighElement(node))
				: isText(node) ? { ...Empty, xchars: node.data.trim().replace(Space, " ").length**2 }
					: hasChildren(node) ? scan(node.children)
						: Empty;


			function weighElement(element: Element): Scan {

				const { xchars, echars, densest, density } = scan(element.children);

				const children = element.children.filter(isTag);

				const diluting = children.length;
				const carrying = children.filter(child => Textual.has(name(child))).length;

				// a leaf carrying text is weighed by the text itself, a container by how much of it is content

				const weight = Textual.has(name(element)) && echars === 0 ? xchars
					: echars*(carrying+1)/(diluting+1);

				return {

					xchars,
					echars: weight,

					densest: weight > 0 && weight >= density ? element : densest, // an element outweighs its content
					density: Math.max(weight, density)

				};

			}

		}

	}


	// the regions are handed over rooted in a document of their own, so that expressions apply as to a parsed page

	function extract(regions: readonly Element[]): Document {

		const roots = regions.map(rebased);
		const document = new Document([ ...roots ]);

		roots.forEach(root => { root.parent = document; }); // a document owns the roots it is handed over rooted at

		return document;


		// the URL a region resolved against in the page travels with the copy, so that its references still resolve

		function rebased(region: Element): Element {

			const clone = cloneNode(region, true);
			const target = base(region);

			clone.attribs = target === undefined ? clone.attribs : { ...clone.attribs, "xml:base": target };

			return clone;

		}

		function base(element: Element): undefined | string {

			return bases(element).reduce<undefined | string>((base, href) => absolute(href, base) ?? href, undefined);


			function bases(element: Element): readonly string[] {

				const parent = element.parent;
				const inherited = parent !== null && isTag(parent) ? bases(parent) : [];

				const href = element.attribs["xml:base"];

				return href === undefined ? inherited : [ ...inherited, href ];

			}

			function absolute(href: string, base: undefined | string): undefined | string {

				try {

					return new URL(href, base).href;

				} catch { // a malformed or unresolvable reference leaves the base as it stands

					return undefined;

				}

			}

		}

	}


	function name(element: Element): string {
		return element.name.toLowerCase();
	}

}
