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
 * Helper backing the `focus()` task, which states the extraction contract.
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

		return fold(nodes.map(weigh));


		/**
		 * Totals a set of weights.
		 *
		 * @param scans The weights to total
		 *
		 * @returns The weight of the subtrees `scans` were taken from, taken together
		 */
		function fold(scans: readonly Scan[]): Scan {

			return scans.reduce((total, item) => ({

				xchars: total.xchars+item.xchars,
				echars: total.echars+item.echars,

				densest: item.density > total.density ? item.densest : total.densest, // the first of equals is the outermost
				density: Math.max(total.density, item.density)

			}), Empty);

		}


		function weigh(node: AnyNode): Scan {

			return isTag(node) ? (Ignored.has(name(node)) ? Empty : weighElement(node))
				: isText(node) ? { ...Empty, xchars: normalize(node.data.trim()).length**2 }
					: hasChildren(node) ? scan(node.children)
						: Empty;


			/**
			 * Weighs the text held by an element.
			 *
			 * A leaf carrying text is weighed by the text itself, a container by how much of it is content. An element
			 * carrying no text neither carries nor dilutes, the line breaks, rules, images and metadata a page is laid
			 * out with among them; framing dilutes whatever it holds, so that a page is not read as its own content.
			 *
			 * @param element The element to weigh
			 *
			 * @returns The weight of the text held by `element`, alongside the densest element it holds
			 */
			function weighElement(element: Element): Scan {

				const weighed = element.children.map(node => ({ node, scanned: weigh(node) }));

				const { xchars, echars, densest, density } = fold(weighed.map(({ scanned }) => scanned));

				const children = weighed.flatMap(({ node, scanned }) => // framing tells a container apart from content
					isTag(node) && (scanned.xchars > 0 || Ignored.has(name(node))) ? [ node ] : []
				);

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
		 * The URL the tree drawn from resolved against travels with the page, so that a consumer reads the URL the
		 * content belongs to alongside the content itself.
		 *
		 * @param title The title the page states, if any
		 * @param roots The regions the page holds
		 *
		 * @returns An `html` element holding `roots` in its `body`, stating a `head` with a copy of `title` where one
		 *          is stated and as `xml:base` the URL the tree drawn from resolved against, where it states one
		 */
		function paged(title: undefined | Element, roots: readonly Element[]): Element {

			const target = located(node);

			return holding("html", [
				...(title === undefined ? [] : [ holding("head", [ cloneNode(title, true) ]) ]),
				holding("body", roots)
			], target === undefined ? {} : { "xml:base": target });

		}

		/**
		 * Draws the URL the tree drawn from resolves against.
		 *
		 * @param node The root of the tree drawn from
		 *
		 * @returns The URL `node` resolves against, taken from the root element of the tree where `node` is a
		 *          document; `undefined` if the tree states none
		 */
		function located(node: AnyNode): undefined | string {
			return isTag(node) ? based(node)
				: nodes.filter(isTag).map(based).find(target => target !== undefined);
		}

		/**
		 * Assembles an element around a set of children.
		 *
		 * @param name The name of the element to assemble
		 * @param children The nodes the element holds
		 * @param attribs The attributes the element states
		 *
		 * @returns An element named `name` owning `children` and stating `attribs`
		 */
		function holding(name: string, children: readonly Element[], attribs: Record<string, string> = {}): Element {

			const element = new Element(name, { ...attribs }, [ ...children ]);

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
			const target = based(region);

			clone.attribs = target === undefined ? clone.attribs : { ...clone.attribs, "xml:base": target };

			return clone;

		}

		/**
		 * Draws the URL the references held by an element resolve against.
		 *
		 * @param element The element whose base URL is to be drawn
		 *
		 * @returns The URL `element` resolves against, each `xml:base` in scope resolved against the ones stated
		 *          further up and one resolving to no absolute URL kept as stated; `undefined` if none is in scope
		 */
		function based(element: Element): undefined | string {

			return scoped(element).reduce<undefined | string>((base, href) => absolute(href, base) ?? href, undefined);


			function scoped(element: Element): readonly string[] {

				const parent = element.parent;
				const inherited = parent !== null && isTag(parent) ? scoped(parent) : [];

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
