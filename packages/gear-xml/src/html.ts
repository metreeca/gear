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
import type { Document } from "domhandler";
import { process } from "./html.core.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an HTML parser.
 *
 * The generated task converts a feed of HTML documents into a feed of parsed trees, one tree per document, so that a
 * consumer works on the structure a document states rather than on its text.
 *
 * A document is given either as text or as a response carrying it as its body, and is parsed on its own. A document
 * holding no text, or only whitespace, contributes no tree, as does a response carrying no body.
 *
 * Trees are shaped as the ones produced for XML, so that a single set of path expressions serves both: names are
 * matched as the tree carries them, without namespaces, and no `html`, `head` or `body` element is supplied where the
 * source states none.
 *
 * Response bodies are decoded as the `charset` parameter of the content type states, as the `meta` charset declared in
 * the opening kilobyte of the document where the content type states none, and as UTF-8 where neither does, whatever
 * the windows-1252 default HTML carries for historical reasons. A byte order mark opening a document is stripped, both
 * from text and from a body decoded under a Unicode charset.
 *
 * A response stating a content type other than `text/html` or `application/xhtml+xml`, or a charset the platform
 * doesn't decode, is reported to the log and read all the same, the body decoded as UTF-8 where the charset is not
 * known, so that a mis-declared source is diagnosed without being shut out. The report is the only sign a document is
 * not what it was taken for, as parsing never fails.
 *
 * Documents record the URL relative references resolve against as an `xml:base` attribute on each of their root
 * elements, so that a consumer resolves them by the standard rules without tracking the request alongside the
 * document. The URL is the one stated by the first `base` element in tree order, resolved against the URL the response
 * was retrieved from, and the retrieval URL itself where the document states none; the retrieval URL is the one the
 * request landed on, which differs from the one it was issued for if it was redirected, and a root that already
 * declares `xml:base` keeps its own value, resolved against it. Nothing is recorded for a document given as text that
 * states no absolute base, or for a synthesised response, which carries no URL.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each tree is emitted as soon as its document is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Materialising**: a document is held in memory while it is parsed, as parsing requires it as a single
 * >   contiguous string, so peak memory use is about twice the size of the largest document rather than of the feed.
 * > - **Stateless**: every document is parsed on its own, so the outcome is unaffected by how the feed is split
 * >   across nested feeds or runs.
 *
 * > [!WARNING]
 * >
 * > Parsing is forgiving and never fails. The emitted tree is always structurally sound, since anything the source
 * > leaves unclosed is closed at the end of the input, but it may misrepresent malformed input rather than reject it,
 * > and it reflects the markup as stated rather than as a browser would repair it: misnested elements are left
 * > misnested, and content a browser would relocate stays where the source put it. Expressions are best written
 * > against the tree the parser actually produces.
 *
 * > [!NOTE]
 * >
 * > Names are folded to lowercase, as HTML prescribes, except inside inline SVG and MathML, where the camelCase
 * > element and attribute names the two languages define are restored: `clipPath` and `@viewBox` are selected as
 * > written, while the HTML content hosted by `foreignObject` and the MathML text elements is folded like the rest of
 * > the document.
 *
 * @returns A task converting a feed of HTML documents, given as text or as responses, into a feed of parsed trees
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing documents, or whatever
 *                 reading the body of a response reports
 *
 * @see {@link https://html.spec.whatwg.org/multipage/ WHATWG HTML Living Standard}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 *
 * @group Factories
 */
export function html(): Task<string | Response, Document> {

	return documents => items((async function* () {

		for await (const document of documents) {

			const tree = await process(document);

			if ( tree !== undefined ) { // a document holding no text contributes no value

				yield tree;

			}

		}

	})());

}
