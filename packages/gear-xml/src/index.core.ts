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
import { hasChildren, isTag } from "domhandler";
import { DomUtils } from "htmlparser2";


/**
 * The whitespace runs collapsed to a single space when character data is read.
 *
 * Matches the control characters markup is laid out with, line feeds and tabs among them, alongside the spaces a page
 * is typeset with, the no-break space and the wider separators among them, so that neither the layout of the source
 * nor the typesetting of the page weighs on the text. The zero-width space and the joiners stand for no space at all
 * and are left as they are; the byte order mark is folded like the rest, as the standard counts it among the spaces.
 *
 * @see {@link https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space ECMA-262 -
 * White Space}
 */
export const Space = /[\x00-\x20\x7F\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;

/**
 * The elements carrying no text a reader is after.
 *
 * Lists the markup a page is framed by, navigation, headers, footers and sidebars among them, alongside the scripts,
 * styles, controls and embedded objects a reader never reads, so that whatever they hold weighs neither on the text a
 * page is scored on nor on the title it is taken to state.
 */
export const Ignored = new Set([

	"style", "script", "noscript",
	"nav", "header", "footer", "aside",
	"menu", "menuitem", "toolbar",
	"iframe", "embed", "object", "applet",
	"form", "input", "button", "select", "textarea", "label", "fieldset", "legend",
	"canvas", "svg", "audio", "video", "track", "source"

]);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reads the name of an element as the tree carries it.
 *
 * @param element The element to name
 *
 * @returns The name of `element`, folded to lower case, so that names are matched case insensitively
 */
export function name(element: Element): string {
	return element.name.toLowerCase();
}

/**
 * Collapses the whitespace character data is laid out with.
 *
 * @param text The text to collapse
 *
 * @returns `text` with every run of whitespace replaced by a single space
 */
export function normalize(text: string): string {
	return text.replace(Space, " ");
}

/**
 * Draws the title a tree states.
 *
 * The framing a reader is not after is left out, so that the caption of an embedded object is not mistaken for the
 * title of the page.
 *
 * @param node The root of the tree to search; only its descendants are considered
 *
 * @returns The first title stated by the tree rooted at `node`; `undefined` if none is stated or the first one carries
 *          no text
 */
export function titled(node: AnyNode): undefined | Element {

	const [ title ] = stated(hasChildren(node) ? node.children : []);

	return title !== undefined && DomUtils.textContent(title).trim() !== "" ? title : undefined;


	function stated(nodes: readonly AnyNode[]): readonly Element[] {
		return nodes.filter(isTag).flatMap(element => name(element) === "title" ? [ element ] // states its own
			: Ignored.has(name(element)) ? [] // framing states captions a reader is not after
				: stated(element.children)
		);
	}

}
