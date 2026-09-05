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
import { parseItem } from "@metreeca/http";
import { log } from "@metreeca/tape";
import type { Document } from "domhandler";
import { isTag } from "domhandler";
import { parseDocument } from "htmlparser2";
import { isBase } from "./index.core.js";


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
 * Reads a document as a tree, so that a consumer works on the structure the document states rather than on its text. A
 * document holding no text, or only whitespace, is read as no document at all, as is a response carrying no body.
 *
 * A body is decoded as the `charset` parameter of its content type states, and as UTF-8 where it states none, whatever
 * the US-ASCII default carried by the `text` media types. A byte order mark opening a document is stripped, both from
 * text and from a body decoded under a Unicode charset.
 *
 * A response is read whatever it states about itself, so that a mis-declared source is diagnosed without being shut
 * out: a content type that is not an XML one, `application/xml`, `text/xml` or a `+xml` format such as
 * `application/rss+xml`, and a charset the platform doesn't decode are both reported to the log and the body read all
 * the same, decoded as UTF-8 where the charset is not known. The report is the only sign a document is not what it was
 * taken for, as parsing never fails.
 *
 * References drawn from the tree resolve by the standard rules without the request being tracked alongside it: the URL
 * they resolve against is recorded as an `xml:base` attribute on every root element, and a root already declaring one
 * keeps its own value, resolved against it.
 *
 * The `base` argument states that URL and is taken as it stands. Where it is left out, a response supplies the URL it
 * was retrieved from, the one the request landed on rather than the one it was issued for. Nothing is recorded where
 * neither states one, as for a document given as text or a synthesised response.
 *
 * The `base` argument is expected to be a hierarchical identifier, that is a scheme followed by a root-relative path:
 * a relative reference or an opaque identifier such as `urn:example:x` is reported rather than recorded, as either
 * would leave every reference drawn from the tree silently unresolved.
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
 * @param base The URL references resolve against, taken as it stands in place of the URL a response was retrieved from
 *
 * @returns A tree holding the content of `document`; `undefined` if it holds no text
 *
 * @throws {@link !RangeError RangeError} If `base` is not a hierarchical identifier, that is a scheme followed by a
 *                                        root-relative path, and so cannot serve as a resolution base
 *
 * @throws {@link !Error Error} Whatever reading the body of a response reports
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 * @see {@link https://www.rfc-editor.org/rfc/rfc7303 RFC 7303 XML Media Types}
 * @see {@link https://www.w3.org/TR/xmlbase/ XML Base}
 */
export async function process(document: string | Response, base?: IRI): Promise<undefined | Document> {

	const text = (document instanceof Response ? await read(document) : document).trim();

	// a document holding nothing but whitespace, a byte order mark included, holds no content

	return text ? rebase(parseDocument(text, { xmlMode: true }), locate(document, base)) : undefined;


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

	function locate(document: string | Response, base: undefined | IRI): undefined | URL {

		// a stated base is taken as it stands, so the retrieval URL never stands in as the one to resolve it against

		if ( base !== undefined ) {

			if ( !isBase(base) ) {
				throw new RangeError(`expected resolvable base URL <${base}>`);
			}

			return new URL(base);

		} else {

			return document instanceof Response && document.url ? new URL(document.url) : undefined;

		}

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
