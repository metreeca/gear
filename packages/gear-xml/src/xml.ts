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
import { toArray } from "@metreeca/flow/sinks";
import type { Document } from "domhandler";
import { isTag } from "domhandler";
import { parseDocument } from "htmlparser2";
import { text } from "node:stream/consumers";

/**
 * Creates an XML parser.
 *
 * The generated task reads a feed of XML text, byte chunks or responses as a feed of documents, taking the whole
 * source as a single document and emitting it as a single value.
 *
 * A source yielding no text, or only whitespace, is read as an empty feed.
 *
 * Documents parsed from a response record the URL the response was retrieved from as an `xml:base` attribute on each
 * of their root elements, so relative references resolve against it by the standard rules, without the request being
 * tracked alongside the document. The URL is the one the request landed on, which differs from the one it was issued
 * for if it was redirected; a root that already declares `xml:base` keeps its own value, resolved against it. Nothing
 * is recorded for text or byte chunks, or for a synthesised response, which reports no URL.
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
 * > Parsing is forgiving and never fails. The emitted tree is always structurally sound, since anything the source
 * > leaves unclosed is closed at the end of the input, but it may misrepresent malformed input rather than reject it:
 * > an unclosed element absorbs what follows as its descendants, an unterminated attribute value swallows the rest of
 * > the input, and the document may carry any number of element children, none included. Consumers that require
 * > well-formed input must validate the emitted document themselves.
 *
 * > [!WARNING]
 * > Byte chunks and response bodies are decoded as UTF-8 whatever the source declares, so a document encoded
 * > otherwise is read as mojibake rather than reported as an error.
 *
 * @returns A task converting a feed of XML text, byte chunks or responses into a feed of documents
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing chunks
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 */
export function xml(): Task<string | Uint8Array | Response, Document> {

	return chunks => items((async function* () {

		const parts = await chunks(toArray());

		yield* parse(await decode(parts), locate(parts));

	})());


	/**
	 * Joins the parts into the source text, replacing responses with their bodies.
	 *
	 * Byte chunks are decoded as a single run, so multibyte sequences split across chunks survive.
	 */
	async function decode(parts: readonly (string | Uint8Array | Response)[]): Promise<string> {

		const bodies = await Promise.all(parts.map(part => part instanceof Response ? part.text() : part));

		return text((async function* () { yield* bodies; })());

	}

	/**
	 * Reports the URL the document was retrieved from, taken from the first response that knows its own.
	 */
	function locate(parts: readonly (string | Uint8Array | Response)[]): URL | undefined {

		const located = parts.find(part => part instanceof Response && part.url);

		return located instanceof Response ? new URL(located.url) : undefined;

	}

	function parse(source: string, base: URL | undefined): readonly Document[] {
		return source.trim() ? [rebase(parseDocument(source, { xmlMode: true }), base)] : [];
	}

	/**
	 * Records the retrieval URL as an `xml:base` attribute on each root element of a freshly parsed document.
	 *
	 * A root declaring its own `xml:base` keeps it, resolved against the retrieval URL as XML Base prescribes.
	 */
	function rebase(document: Document, base: URL | undefined): Document {

		if ( base === undefined ) {

			return document;

		} else {

			document.children.filter(isTag).forEach(root => { // stamping a tree no consumer has seen yet
				root.attribs["xml:base"] = new URL(root.attribs["xml:base"] ?? "", base).href;
			});

			return document;

		}

	}

}
