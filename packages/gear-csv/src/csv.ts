/*
 * Copyright © 2020-2026 EC2U Alliance
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
import { process } from "./csv.core.js";
import type { Record } from "./index.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a CSV parser.
 *
 * The generated task reads a feed of CSV documents as a feed of records, one {@link Record} per data row; a document
 * is given either as text or as a response carrying it as its body, and is read on its own, header row included.
 *
 * A response carrying no body contributes no record.
 *
 * Response bodies are decoded as the `charset` parameter of the content type states, and as UTF-8 where it states
 * none, whatever the US-ASCII default carried by the `text` media types, as UTF-8 is what CSV is exchanged under in
 * practice. A byte order mark opening a document is stripped, both from text and from a body decoded under a Unicode
 * charset.
 *
 * A response stating a content type other than `text/csv` or `application/csv`, or a charset the platform doesn't
 * decode, is reported to the log and read all the same, the body decoded as UTF-8 where the charset is not known, so
 * that a mis-declared source is diagnosed without being shut out: CSV is served under `text/plain` and vendor types
 * as readily as under `text/csv`.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: records are emitted as they are parsed, so the feed produced runs dry as the feed drawn from
 * >   does.
 * > - **Streaming**: documents are drawn one at a time and a response body is pulled as records are asked for, so
 * >   resources of any size are handled without holding them in memory and a consumer that stops early releases the
 * >   source; a document given as text is nonetheless parsed in one go, and some of a body is read ahead of the
 * >   records actually consumed.
 * > - **Stateless**: every document is parsed on its own, reading a header row of its own, so the outcome is
 * >   unaffected by how the feed is split across nested feeds or runs.
 *
 * > [!WARNING]
 * > Records that cannot be parsed are skipped and reported to the log, leaving the feed to run to completion.
 *
 * @typeParam R The type of the records produced; field values are emitted as parsed, without being validated
 *              against it
 *
 * @param options The parsing options
 * @param options.header Reads the first row as column labels, keying records by label rather than by positional
 *                       index; defaults to `false`
 * @param options.skip Ignores empty lines rather than emitting them as records; defaults to `false`
 * @param options.trim Strips surrounding whitespace from field values; defaults to `false`
 * @param options.flex Emits records whose field count doesn't match the header, leaving out missing fields and
 *                     discarding fields beyond the header, rather than skipping them; defaults to `false`
 * @param options.quote The character wrapping field values; defaults to `"` if unset or empty
 * @param options.delimiter The character separating fields; defaults to `,` if unset or empty
 *
 * @returns A task converting a feed of CSV documents, given as text or as responses, into a feed of records
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing documents, or whatever
 *                 reading the body of a response reports
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4180 RFC 4180 Common Format and MIME Type for CSV Files}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 */
export function csv<R extends Record = Record>(options: {

	readonly header?: boolean

	readonly skip?: boolean
	readonly trim?: boolean
	readonly flex?: boolean

	readonly quote?: string
	readonly delimiter?: string

} = {}): Task<string | Response, R> {

	return documents => items((async function* () {

		for await (const document of documents) {

			yield* process<R>(document, options);

		}

	})());

}
