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

import { parseItem } from "@metreeca/http";
import { log } from "@metreeca/tape";
import { parse } from "csv-parse";
import { pipeline, Readable } from "node:stream";
import type { Record } from "./index.js";


/**
 * The media types a CSV document is served under.
 *
 * Matches the registered `text/csv` and the unregistered `application/csv` a good many sources state instead. No
 * structured syntax suffix is registered for CSV, so no `+csv` type is recognised.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4180#section-4.1 RFC 4180 § 4.1 - MIME Type Registration of text/csv}
 */
const CSVType = /^(?:text|application)\/csv$/i;


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Parses a CSV document.
 *
 * Reads a document as the records its data rows state, header row included, so that a consumer works on structured
 * data rather than on text.
 *
 * The document is given either as text or as a response carrying it as its body. A response carrying no body states
 * no record.
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
 * Nothing is read until the first record is asked for, and a response body is pulled as records are drawn, so that a
 * document of any size is read without being held in memory and a consumer that stops early releases the source; a
 * document given as text is nonetheless parsed in one go, and some of a body is read ahead of the records actually
 * consumed.
 *
 * > [!WARNING]
 * > Records that cannot be parsed are skipped and reported to the log, leaving the remaining ones to be read.
 *
 * @typeParam R The type of the records produced; field values are produced as parsed, without being validated against
 *              it
 *
 * @param document The document to parse, given either as text or as a response carrying it as its body
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
 * @returns The records stated by the data rows of `document`, in document order
 *
 * @throws {@link !Error Error} While the records are drawn, whatever reading the body of a response reports
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4180 RFC 4180 Common Format and MIME Type for CSV Files}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 */
export async function* process<R extends Record = Record>(document: string | Response, {

	header,

	skip,
	trim,
	flex,

	quote,
	delimiter

}: {

	readonly header?: boolean

	readonly skip?: boolean
	readonly trim?: boolean
	readonly flex?: boolean

	readonly quote?: string
	readonly delimiter?: string

} = {}): AsyncIterable<R> {

	const source = document instanceof Response ? read(document) : Readable.from([document]);

	// built per document, so nothing is read until the first record is pulled

	const parser = parse({

		columns: header === true,

		quote: quote || "\"",
		delimiter: delimiter || ",",

		bom: true,

		skipEmptyLines: skip === true,
		trim: trim === true,
		relaxColumnCount: flex === true,

		skipRecordsWithError: true,
		onSkip: error => void logger.warn`(${error?.lines}) malformed record (${error?.message})`

	});

	// records are parsed as the source is pulled, no document buffered whole, and the chain is torn down
	// both ways: stopping early releases the source, a source failure surfaces on the parser

	pipeline(source, parser, () => {});

	// delegation keeps the pull chain intact, forwarding a downstream `return()` to the parser

	yield* parser;


	function read(response: Response): Readable {

		const [ type, parameters ] = parseItem(response.headers.get("Content-Type"));
		const charset = parameters.get("charset") || "UTF-8";

		if ( type && !CSVType.test(type) ) {
			logger.warn`unexpected <${type}> content type`;
		}

		const decoder = decode(charset);

		if ( decoder === undefined ) {
			logger.warn`unknown <${charset}> charset`;
		}

		if ( response.body === null ) {

			return Readable.from([]);

		} else {

			return Readable.from(text(response.body, decoder ?? new TextDecoder()));

		}

	}

	async function* text(body: ReadableStream<Uint8Array>, decoder: TextDecoder): AsyncIterable<string> {

		for await (const chunk of body) {

			yield decoder.decode(chunk, { stream: true }); // chunk by chunk, so that split multibyte sequences survive

		}

		yield decoder.decode(); // whatever the last chunk left withheld

	}

	function decode(charset: string): undefined | TextDecoder {

		try {

			return new TextDecoder(charset);

		} catch {

			return undefined;

		}

	}

}
