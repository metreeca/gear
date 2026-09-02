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
import type { Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { process } from "./json.core.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a JSON parser.
 *
 * The generated task reads a feed of JSON documents as a feed of values, parsing each document on its own and
 * emitting the single value it holds; a document is given either as text or as a response carrying it as its body.
 *
 * A document holding no text, or only whitespace, contributes no value, as does a response carrying no body.
 *
 * Response bodies are decoded as UTF-8, the only encoding JSON is exchanged under, and bytes that are not valid UTF-8
 * are read as replacement characters.
 *
 * A response stating a content type that is not a JSON one, `application/json` or a `+json` format such as
 * `application/ld+json`, or a charset other than UTF-8, is reported to the log and read all the same, so that a
 * mis-declared source is diagnosed without being shut out.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each value is emitted as soon as its document is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Materialising**: a document is held in memory while it is parsed, as parsing requires it as a single
 * >   contiguous string, so peak memory use is about twice the size of the largest document rather than of the feed.
 * > - **Stateless**: every document is parsed on its own, so the outcome is unaffected by how the feed is split
 * >   across nested feeds or runs.
 *
 * > [!WARNING]
 * > A document that cannot be parsed is skipped and reported to the log, leaving the feed to run to completion.
 *
 * @typeParam V The type of the value produced; the parsed document is emitted as is, without being validated
 *              against it; defaults to a JSON {@link Object}
 *
 * @returns A task converting a feed of JSON documents, given as text or as responses, into a feed of values
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing documents, or whatever
 *                 reading the body of a response reports
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8259 RFC 8259 JSON Data Interchange Format}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 */
export function json<V extends Value = Object>(): Task<string | Response, V> {

	return documents => items((async function* () {

		for await (const document of documents) {

			const value = await process<V>(document);

			if ( value !== undefined ) { // a document holding no parsable value contributes no value

				yield value;

			}

		}

	})());

}
