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
 * Helper backing the `csv()` task, which states the parsing contract.
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
