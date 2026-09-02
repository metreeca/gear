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

import type { AnyNode } from "domhandler";
import { cloneNode, Document, Element, hasChildren, isTag, isText } from "domhandler";
import { DomUtils } from "htmlparser2";
import { Ignored, name, normalize, titled } from "./index.core.js";


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
 * Where the tree is a page, that is where it states an `html` or a `body` element or a title, the regions are handed
 * over inside the `body` of an `html` element, so that a consumer works on a page as it drew one. The `html` element
 * states a `head` with a copy of the title where the tree states one, so that a consumer reads the page the content
 * belongs to alongside the content itself: the title is the first `title` element stated outside the framing a reader
 * is not after, so that the caption of an embedded object is not mistaken for it. Where the tree is a bare fragment,
 * the regions are handed over as they stand.
 *
 * @param node The root of the tree to draw content from; only its descendants are considered, so a tree rooted at the
 *             very element carrying the content is scanned for a region inside it
 *
 * @returns A document holding a copy of each region carrying the main content of the tree rooted at `node`, several
 *          where the page states several articles, wrapped in a page where the tree is one; `undefined` if the tree
 *          holds no content. Each region records as `xml:base` the URL relative references in it resolve against,
 *          where the tree states one, so that they resolve as they did however deeply the region sat in the page. The
 *          tree drawn from is left untouched
 *
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-main-element WHATWG HTML - The main element}
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-article-element WHATWG HTML - The article
 * element}
 * @see {@link https://www.w3.org/TR/wai-aria-1.2/#main WAI-ARIA - main role}
 */
export function process(node: AnyNode): undefined | Document {

	const nodes = hasChildren(node) ? node.children : [];
	const regions = marked(nodes) ?? articles(nodes) ?? dense(nodes);

	return regions === undefined ? undefined : extract(regions, framed(nodes), titled(node));


	/**
	 * Draws the region a page marks as its own.
	 *
	 * The region is taken as stated, however dense the text it holds.
	 *
	 * @param nodes The nodes to search
	 *
	 * @returns A singleton holding the region marked by `nodes`; `undefined` if none is marked
	 */
	function marked(nodes: readonly AnyNode[]): undefined | readonly Element[] {

		const element = first(element => name(element) === "main")
			?? first(element => element.attribs["role"]?.toLowerCase() === "main");

		return element === undefined ? undefined : [ element ];


		function first(test: (element: Element) => boolean): undefined | Element {
			return DomUtils.findOne(test, [ ...nodes ], true) ?? undefined; // searched as stated, in document order
		}

	}


	/**
	 * Draws the regions a page states as articles.
	 *
	 * A page states as many articles as it lists, so they are taken together rather than one standing for the rest.
	 * Articles carrying no text are widgets rather than content, and leave the page to be scored.
	 *
	 * @param nodes The nodes to search
	 *
	 * @returns The outermost articles stated by `nodes`; `undefined` if none is stated or none carries text
	 */
	function articles(nodes: readonly AnyNode[]): undefined | readonly Element[] {

		const stated = outermost(nodes);

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


	/**
	 * Weighs the text held by a sequence of nodes.
	 *
	 * Text weighs by the square of its length, so that a long run outweighs the same amount of text scattered around.
	 *
	 * @param nodes The nodes to weigh
	 *
	 * @returns The weight of the text held by `nodes`, alongside the densest element among them
	 */
	function scan(nodes: readonly AnyNode[]): Scan {

		return nodes.map(weigh).reduce((total, item) => ({

			xchars: total.xchars+item.xchars,
			echars: total.echars+item.echars,

			densest: item.density > total.density ? item.densest : total.densest, // the first of equals is the outermost
			density: Math.max(total.density, item.density)

		}), Empty);


		function weigh(node: AnyNode): Scan {

			return isTag(node) ? (Ignored.has(name(node)) ? Empty : weighElement(node))
				: isText(node) ? { ...Empty, xchars: normalize(node.data.trim()).length**2 }
					: hasChildren(node) ? scan(node.children)
						: Empty;


			/**
			 * Weighs the text held by an element.
			 *
			 * A leaf carrying text is weighed by the text itself, a container by how much of it is content.
			 *
			 * @param element The element to weigh
			 *
			 * @returns The weight of the text held by `element`, alongside the densest element it holds
			 */
			function weighElement(element: Element): Scan {

				const { xchars, echars, densest, density } = scan(element.children);

				const children = element.children.filter(isTag);

				const diluting = children.length;
				const carrying = children.filter(child => Textual.has(name(child))).length;

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


	/**
	 * Tests whether a tree states the frame of a page.
	 *
	 * @param nodes The nodes to search
	 *
	 * @returns true if `nodes` state an `html` or a `body` element; false otherwise
	 */
	function framed(nodes: readonly AnyNode[]): boolean {
		return DomUtils.findOne(element => name(element) === "html" || name(element) === "body",
			[ ...nodes ], true
		) !== null;
	}


	/**
	 * Roots a set of regions in a document of their own.
	 *
	 * Regions are copied into a document, so that expressions apply to them as to a parsed page. Where the tree drawn
	 * from is a page, that is where it is framed or states a title, the copies are held by the `body` of an `html`
	 * element, stating a `head` with a copy of the title where the tree states one.
	 *
	 * @param regions The regions to root
	 * @param frame Whether the tree drawn from states the frame of a page
	 * @param title The title the tree drawn from states, if any
	 *
	 * @returns A document holding a copy of each region in `regions`
	 */
	function extract(regions: readonly Element[], frame: boolean, title: undefined | Element): Document {

		const roots = regions.map(rebased);
		const children = frame || title !== undefined ? [ paged(title, roots) ] : roots;
		const document = new Document([ ...children ]);

		children.forEach(root => { root.parent = document; }); // a document owns the roots it is handed over rooted at

		return document;


		/**
		 * Assembles a page holding a title and a set of regions.
		 *
		 * @param title The title the page states, if any
		 * @param roots The regions the page holds
		 *
		 * @returns An `html` element holding `roots` in its `body`, stating a `head` with a copy of `title` where one
		 *          is stated
		 */
		function paged(title: undefined | Element, roots: readonly Element[]): Element {
			return holding("html", [
				...(title === undefined ? [] : [ holding("head", [ cloneNode(title, true) ]) ]),
				holding("body", roots)
			]);
		}

		/**
		 * Assembles an element around a set of children.
		 *
		 * @param name The name of the element to assemble
		 * @param children The nodes the element holds
		 *
		 * @returns An element named `name` owning `children`
		 */
		function holding(name: string, children: readonly Element[]): Element {

			const element = new Element(name, {}, [ ...children ]);

			children.forEach(child => { child.parent = element; }); // an element owns the nodes it is handed over

			return element;

		}


		/**
		 * Copies a region, recording the URL its references resolve against.
		 *
		 * The URL a region resolved against in the page travels with the copy, so that its references still resolve.
		 *
		 * @param region The region to copy
		 *
		 * @returns A copy of `region` stating as `xml:base` the URL it resolved against, where the page states one
		 */
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

}
