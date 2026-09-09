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
 * Helper backing the `xml()` task, which states the parsing contract.
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
