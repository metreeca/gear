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

import type { Object, Value } from "@metreeca/core";
import { parseItem } from "@metreeca/http";
import { log, report } from "@metreeca/tape";


/**
 * The media types a JSON document is served under.
 *
 * Matches any type whose subtype is `json` or carries the `+json` structured syntax suffix, so that JSON-based
 * formats, `application/ld+json` and `application/problem+json` among them, are recognised alongside plain
 * `application/json`.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6838#section-4.2.8 RFC 6838 § 4.2.8 - Structured Syntax Suffixes}
 */
const JSONType = /^[-\w.]+\/(?:[-\w.]+\+)?json$/i;

/**
 * The charsets a JSON document is encoded in.
 *
 * Matches the labels UTF-8 is stated under, the only encoding JSON exchanged between systems is written in.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8259#section-8.1 RFC 8259 § 8.1 - Character Encoding}
 */
const UTF8Charset = /^utf-?8$/i;


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Parses a JSON document.
 *
 * Helper backing the `json()` task, which states the parsing contract.
 */
export async function process<V extends Value = Object>(document: string | Response): Promise<undefined | V> {

	const text = (document instanceof Response ? await read(document) : document).trim();

	return text ? parse(text) : undefined; // a document holding nothing but whitespace holds no value


	async function read(response: Response): Promise<string> {

		const [ type, parameters ] = parseItem(response.headers.get("Content-Type"));
		const charset = parameters.get("charset") ?? "";

		if ( type && !JSONType.test(type) ) {
			logger.warn`unexpected <${type}> content type`;
		}

		if ( charset && !UTF8Charset.test(charset) ) {
			logger.warn`unsupported <${charset}> charset`;
		}

		return response.text();

	}

	function parse(text: string): undefined | V {

		try {

			return JSON.parse(text);

		} catch ( error ) {

			logger.warn`malformed JSON document (${report(error)})`;

			return undefined;

		}

	}

}
