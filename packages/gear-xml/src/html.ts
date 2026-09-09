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

import type { IRI } from "@metreeca/core/resource";
import type { Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import type { Document } from "domhandler";
import { process } from "./html.core.js";
import { isBase } from "./index.core.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an HTML parser.
 *
 * The generated task converts a feed of HTML documents into a feed of parsed trees, one tree per document, so that a
 * consumer works on the structure a document states rather than on its text. A document holding no text, or only
 * whitespace, contributes no tree, as does a response carrying no body.
 *
 * Trees are shaped as the ones produced for XML, so that a single set of path expressions serves both: names are
 * carried as the source writes them, with no `xmlns` declaration resolved, and no `html`, `head` or `body` element is
 * supplied where the source states none.
 *
 * A body is decoded as the `charset` parameter of its content type states, as the `meta` charset declared in the
 * opening kilobyte of the document where the content type states none, and as UTF-8 where neither does, whatever the
 * windows-1252 default HTML carries for historical reasons. A byte order mark opening a document is stripped, both
 * from text and from a body decoded under a Unicode charset.
 *
 * A response is read whatever it states about itself, so that a mis-declared source is diagnosed without being shut
 * out: a content type other than `text/html` or `application/xhtml+xml`, and a charset the platform doesn't decode are
 * both reported to the log and the body read all the same, decoded as UTF-8 where the charset is not known. The report
 * is the only sign a document is not what it was taken for, as parsing never fails.
 *
 * References drawn from a tree resolve by the standard rules without the request being tracked alongside it: the URL
 * they resolve against is recorded as an `xml:base` attribute on every root element, and a root already declaring one
 * keeps its own value, resolved against it.
 *
 * That URL is the one stated by the first `base` element in tree order, resolved against the retrieval base. The
 * `base` argument states that retrieval base and is taken as it stands; where it is left out, a response supplies the
 * URL it was retrieved from, the one the request landed on rather than the one it was issued for. Nothing is recorded
 * where no absolute URL is reached, as for a document given as text stating only a relative base.
 *
 * The `base` argument is expected to be a hierarchical identifier, that is a scheme followed by a root-relative path:
 * a relative reference or an opaque identifier such as `urn:example:x` is reported rather than recorded, as either
 * would leave every reference drawn from the trees silently unresolved. A `base` element a document states is read
 * leniently all the same, as it is drawn from the source rather than stated by the consumer.
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
 * @param base The URL references resolve against, taken as it stands in place of the URL a response was retrieved
 *             from, and superseded in turn by a `base` element the document states
 *
 * @returns A task converting a feed of HTML documents, given as text or as responses, into a feed of parsed trees
 *
 * @throws {@link !RangeError RangeError} If `base` is not a hierarchical identifier, that is a scheme followed by a
 *                                        root-relative path, and so cannot serve as a resolution base
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing documents, or
 *                              whatever reading the body of a response reports
 *
 * @see {@link https://html.spec.whatwg.org/multipage/ WHATWG HTML Living Standard}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 * @see {@link https://www.w3.org/TR/xmlbase/ XML Base}
 *
 * @group Factories
 */
export function html(base?: IRI): Task<string | Response, Document> {

	if ( base !== undefined && !isBase(base) ) {
		throw new RangeError(`expected resolvable base URL <${base}>`);
	}

	return documents => items((async function* () {

		for await (const document of documents) {

			const tree = await process(document, base);

			if ( tree !== undefined ) { // a document holding no text contributes no value

				yield tree;

			}

		}

	})());

}
