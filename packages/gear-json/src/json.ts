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
import { log, report } from "@metreeca/tape";
import { text  } from "node:stream/consumers"; // aliased, as `parse()` names its own text


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a JSON parser.
 *
 * The generated task reads a feed of JSON text or byte chunks as a feed of values, taking the whole source as a
 * single document and emitting it as a single value.
 *
 * A source yielding no text, or only whitespace, is read as an empty feed.
 *
 * > [!WARNING]
 * >
 * > - **Exhaustive**: the whole feed is drained before the value is emitted, as JSON documents cannot be parsed
 * >   incrementally, so an infinite feed never completes.
 * > - **Materialising**: the whole text is held in memory, as parsing requires it as a single contiguous string, so
 * >   peak memory use is about twice the size of the document and a large one may exhaust it.
 * > - **Stateful**: chunks are joined across draws, so a task invoked per nested feed or per run parses each as a
 * >   document of its own rather than the feed as a whole.
 *
 * > [!WARNING]
 * > A document that cannot be parsed is skipped and reported to the log, leaving the feed to complete empty.
 *
 * @typeParam V The type of the value produced; the parsed document is emitted as is, without being validated
 *              against it; defaults to a JSON {@link Object}
 *
 * @returns A task converting a feed of JSON text or byte chunks into a feed of values
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing chunks
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8259 RFC 8259 JSON Data Interchange Format}
 */
export function json<V extends Value = Object>(): Task<string | Uint8Array, V> {

	return chunks => items((async function* () {

		yield* parse(await text(chunks));

	})());


	function parse(text: string): readonly V[] {

		try {

			return text.trim() ? [JSON.parse(text)] : [];

		} catch ( error ) {

			logger.warn`malformed JSON document (${report(error)})`;

			return [];

		}

	}

}
