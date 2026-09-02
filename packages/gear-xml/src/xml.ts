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
import { parseItem } from "@metreeca/http";
import { log } from "@metreeca/tape";
import type { Document } from "domhandler";
import { isTag } from "domhandler";
import { parseDocument } from "htmlparser2";


/**
 * The media types an XML document is served under.
 *
 * Matches any type whose subtype is `xml` or carries the `+xml` structured syntax suffix, so that XML-based formats,
 * `application/rss+xml` and `application/xhtml+xml` among them, are recognised alongside plain `application/xml` and
 * `text/xml`.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7303#section-4.2 RFC 7303 § 4.2 - '+xml' Structured Syntax Suffix}
 */
const XMLType = /^[-\w.]+\/(?:[-\w.]+\+)?xml$/i;


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an XML parser.
 *
 * The generated task reads a feed of XML documents as a feed of parsed trees, parsing each document on its own and
 * emitting the single tree it holds; a document is given either as text or as a response carrying it as its body.
 *
 * A document holding no text, or only whitespace, contributes no value, as does a response carrying no body.
 *
 * Response bodies are decoded as the `charset` parameter of the content type states, and as UTF-8 where it states
 * none, whatever the US-ASCII default carried by the `text` media types. A byte order mark opening a document is
 * stripped, both from text and from a body decoded under a Unicode charset.
 *
 * A response stating a content type that is not an XML one, `application/xml`, `text/xml` or a `+xml` format such as
 * `application/rss+xml`, or a charset the platform doesn't decode, is reported to the log and read all the same, the
 * body decoded as UTF-8 where the charset is not known, so that a mis-declared source is diagnosed without being shut
 * out. The report is the only sign a document is not what it was taken for, as parsing never fails.
 *
 * Documents parsed from a response record the URL the response was retrieved from as an `xml:base` attribute on each
 * of their root elements, so relative references resolve against it by the standard rules, without the request being
 * tracked alongside the document. The URL is the one the request landed on, which differs from the one it was issued
 * for if it was redirected; a root that already declares `xml:base` keeps its own value, resolved against it. Nothing
 * is recorded for a document given as text, or for a synthesised response, which reports no URL.
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
 * > Parsing is forgiving and never fails. The emitted tree is always structurally sound, since anything the source
 * > leaves unclosed is closed at the end of the input, but it may misrepresent malformed input rather than reject it:
 * > an unclosed element absorbs what follows as its descendants, an unterminated attribute value swallows the rest of
 * > the input, and the document may carry any number of element children, none included. Consumers that require
 * > well-formed input must validate the emitted document themselves.
 *
 * > [!WARNING]
 * > The encoding declared by the XML prolog is ignored: a body is decoded as the content type states, so a document
 * > declaring one encoding and served under another is read under the served one.
 *
 * @returns A task converting a feed of XML documents, given as text or as responses, into a feed of parsed trees
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing documents, or whatever
 *                 reading the body of a response reports
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 * @see {@link https://www.rfc-editor.org/rfc/rfc7303 RFC 7303 XML Media Types}
 */
export function xml(): Task<string | Response, Document> {

	return documents => items((async function* () {

		for await (const document of documents) {

			const text = (document instanceof Response ? await read(document) : document).trim();

			if ( text ) { // a document holding nothing but whitespace, a byte order mark included, contributes no value

				yield rebase(parseDocument(text, { xmlMode: true }), locate(document));

			}

		}

	})());


	async function read(response: Response): Promise<string> {

		const [ type, parameters ] = parseItem(response.headers.get("Content-Type"));
		const charset = parameters.get("charset") || "UTF-8";

		if ( type && !XMLType.test(type) ) {
			logger.warn`unexpected <${type}> content type`;
		}

		const decoder = decode(charset);

		if ( decoder === undefined ) {
			logger.warn`unknown <${charset}> charset`;
		}

		return (decoder ?? new TextDecoder()).decode(await response.arrayBuffer());

	}

	function decode(charset: string): undefined | TextDecoder {

		try {

			return new TextDecoder(charset);

		} catch {

			return undefined;

		}

	}

	function locate(document: string | Response): undefined | URL {
		return document instanceof Response && document.url ? new URL(document.url) : undefined;
	}

	function rebase(document: Document, base: URL | undefined): Document {

		if ( base === undefined ) {

			return document;

		} else {

			document.children.filter(isTag).forEach(root => {
				root.attribs["xml:base"] = new URL(root.attribs["xml:base"] ?? "", base).href;
			});

			return document;

		}

	}

}
