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
 * Parses an XML document.
 *
 * Reads a document as a tree, so that a consumer works on the structure the document states rather than on its text.
 *
 * The document is given either as text or as a response carrying it as its body. A document holding no text, or only
 * whitespace, is read as no document at all, as is a response carrying no body.
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
 * A tree parsed from a response records the URL the response was retrieved from as an `xml:base` attribute on each of
 * its root elements, so relative references resolve against it by the standard rules, without the request being
 * tracked alongside the tree. The URL is the one the request landed on, which differs from the one it was issued for
 * if it was redirected; a root that already declares `xml:base` keeps its own value, resolved against it. Nothing is
 * recorded for a document given as text, or for a synthesised response, which carries no URL.
 *
 * > [!WARNING]
 * > Parsing is forgiving and never fails. The tree produced is always structurally sound, since anything the source
 * > leaves unclosed is closed at the end of the input, but it may misrepresent malformed input rather than reject it:
 * > an unclosed element absorbs what follows as its descendants, an unterminated attribute value swallows the rest of
 * > the input, and the tree may carry any number of element children, none included. Consumers that require
 * > well-formed input must validate the tree themselves.
 *
 * > [!WARNING]
 * > The encoding declared by the XML prolog is ignored: a body is decoded as the content type states, so a document
 * > declaring one encoding and served under another is read under the served one.
 *
 * @param document The document to parse, given either as text or as a response carrying it as its body
 *
 * @returns A tree holding the content of `document`; `undefined` if it holds no text
 *
 * @throws {Error} Whatever reading the body of a response reports
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 * @see {@link https://www.rfc-editor.org/rfc/rfc7303 RFC 7303 XML Media Types}
 */
export async function process(document: string | Response): Promise<undefined | Document> {

	const text = (document instanceof Response ? await read(document) : document).trim();

	// a document holding nothing but whitespace, a byte order mark included, holds no content

	return text ? rebase(parseDocument(text, { xmlMode: true }), locate(document)) : undefined;


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
