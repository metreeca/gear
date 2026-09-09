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

import type { Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import type { AnyNode, Document } from "domhandler";
import { process } from "./focus.core.js";


/**
 * Creates a content extractor.
 *
 * The generated task converts a feed of parsed X/HTML trees into a feed of documents holding their main content, one
 * document per tree, so that a consumer works on the content it is after rather than on the navigation, headers,
 * footers, sidebars and controls a page is framed by.
 *
 * A tree holding no content contributes no document, so the feed produced is not aligned one to one with the feed
 * drawn from.
 *
 * The content of a tree is the region the page marks as its own: the first `main` element, or the first element
 * stating `role="main"` where the page states no `main`. Only what a tree holds below its root is considered, so a
 * tree rooted at the very element carrying the content is scanned for a region inside it. Names are matched as the
 * tree carries them, case insensitively.
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
 * count for nothing, whatever they hold, so a page framed by long menus is scored on its prose alone, though a
 * container is still discounted for holding them. An element carrying no text of its own weighs on neither side of the
 * reckoning, the line breaks, rules, images and metadata a page is laid out with among them, so that a run of
 * paragraphs is weighed as prose rather than discounted for the punctuation it is set out with. Where two elements are
 * equally dense the one stated first wins, which is the outermost of a chain of sole children.
 *
 * Where the tree is a page, that is where it states an `html` or a `body` element or a title, the regions are handed
 * on inside the `body` of an `html` element, so that a consumer works on a page as it drew one. The `html` element
 * states a `head` with a copy of the title where the tree states one, so that a consumer reads the page the content
 * belongs to alongside the content itself: the title is the first `title` element stated outside the framing a reader
 * is not after, so that the caption of an embedded object is not mistaken for it. Where the tree is a bare fragment,
 * the regions are handed on as they stand, one document root per region.
 *
 * Each region records as `xml:base` the URL relative references in it resolve against, where the tree states one, so
 * that a consumer resolves them by the standard rules however deeply the region sat in the page it was drawn from.
 * Where the regions are handed on inside a page, the `html` element records as `xml:base` the URL the tree itself
 * resolves against, so that a consumer reads the URL the content belongs to alongside the content itself. The trees
 * drawn from are left untouched.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each document is emitted as soon as its tree is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: trees are drawn one at a time and released as soon as the document copying their regions is
 * >   assembled, so the length of the feed weighs on memory no more than a single tree does.
 * > - **Stateless**: every tree is scored on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @returns A task converting a feed of parsed X/HTML trees into a feed of documents holding their main content
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing trees
 *
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-main-element WHATWG HTML - The main element}
 * @see {@link https://html.spec.whatwg.org/multipage/sections.html#the-article-element WHATWG HTML - The article
 * element}
 * @see {@link https://www.w3.org/TR/wai-aria-1.2/#main WAI-ARIA - main role}
 *
 * @group Factories
 */
export function focus(): Task<AnyNode, Document> {

	return trees => items((async function* () {

		for await (const tree of trees) {

			const main = process(tree);

			if ( main !== undefined ) { // a tree holding no content contributes no value

				yield main;

			}

		}

	})());

}
