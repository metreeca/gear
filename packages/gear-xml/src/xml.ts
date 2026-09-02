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
import type { Document } from "domhandler";
import { parseDocument } from "htmlparser2";
import { text } from "node:stream/consumers";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an XML parser.
 *
 * The generated task reads a feed of XML text or byte chunks as a feed of documents, taking the whole source as a
 * single document and emitting it as a single value.
 *
 * A source yielding no text, or only whitespace, is read as an empty feed.
 *
 * > [!WARNING]
 * >
 * > - **Exhaustive**: the whole feed is drained before the document is emitted, as XML documents cannot be parsed
 * >   incrementally, so an infinite feed never completes.
 * > - **Materialising**: the whole text is held in memory, as parsing requires it as a single contiguous string, so
 * >   peak memory use is about twice the size of the document and a large one may exhaust it.
 * > - **Stateful**: chunks are joined across draws, so a task invoked per nested feed or per run parses each as a
 * >   document of its own rather than the feed as a whole.
 *
 * > [!WARNING]
 * > Parsing is forgiving and never fails: malformed markup is recovered from silently, leaving unclosed elements open
 * > and stray markup in place, so a document is emitted even for input no conforming XML processor would accept.
 * > Consumers that require well-formed input must validate the emitted document themselves.
 *
 * @returns A task converting a feed of XML text or byte chunks into a feed of documents
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing chunks
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 */
export function xml(): Task<string | Uint8Array, Document> {

	return chunks => items((async function* () {

		yield* parse(await text(chunks));

	})());


	function parse(source: string): readonly Document[] {
		return source.trim() ? [parseDocument(source, { xmlMode: true })] : [];
	}

}
