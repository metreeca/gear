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

/**
 * Resource fetcher.
 *
 * @module
 *
 * @see {@link https://developer.mozilla.org/docs/Web/API/Window/fetch `fetch()`}
 */

import type { Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { service } from "@metreeca/gear";
import { createFetch, type Middleware } from "@metreeca/http";
import { headers } from "@metreeca/http/headers";
import { transport } from "@metreeca/http/transport";


/**
 * The `User-Agent` field exchanges are sent under.
 *
 * States a current desktop Chrome, so that sites serving unattended clients differently, or refusing them altogether,
 * are scraped as a browser would be. The platform token and the `AppleWebKit` and `Safari` tokens are frozen by the
 * reduced user agent Chrome reports, leaving the Chrome version as the only one to be kept in step.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-10.1.5 RFC 9110 § 10.1.5 - User-Agent}
 * @see {@link https://developer.chrome.com/docs/privacy-security/user-agent-client-hints User-Agent Client Hints}
 */
const UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
	+" AppleWebKit/537.36 (KHTML, like Gecko)"
	+" Chrome/151.0.0.0"
	+" Safari/537.36";

/**
 * The `Accept` field exchanges are sent under.
 *
 * Ranks media types as Chrome ranks them, down to the `q=0.8` weight carried by the catch-all entry, so that a site
 * reading the field against the browser claimed by {@link UserAgent} is not handed a mismatched pair to fingerprint.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1 RFC 9110 § 12.5.1 - Accept}
 */
const Accept = "text/html,"
	+"application/xhtml+xml,"
	+"application/xml;q=0.9,"
	+"*/*;q=0.8";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a resource exchange task.
 *
 * The generated task reads a feed of requests as a feed of byte chunks, emitting the body of each response as its
 * chunks are received; requests are given as accepted by the standard `fetch()` function, that is as URL strings,
 * {@link https://developer.mozilla.org/docs/Web/API/URL URL} objects or
 * {@link https://developer.mozilla.org/docs/Web/API/Request Request} objects.
 *
 * A response without a body contributes no chunks.
 *
 * Exchanges are routed through the fetch client resolved from the enclosing
 * {@link @metreeca/gear!index.executor execution}, so that the transport is chosen when the task is run rather than
 * by the task itself: binding {@link createFetch} routes every exchange through a throttled, cached or stubbed
 * client, without altering the task, while an unbound execution falls back on the standard `fetch` function.
 *
 * Exchanges are sent under desktop browser `User-Agent` and `Accept` fields, so that sites serving unattended clients
 * differently, or refusing them altogether, are scraped as a browser would be; a request already stating one of these
 * fields keeps its own value, as do the ones stated by `middlewares`.
 *
 * Content coding is left to the transport, which states the codings it decodes and decodes the body before it reaches
 * the consumer: no runtime API reports what an implementation handles, so a field stated here would be a guess, and a
 * coding guessed wrong would hand over a body still compressed.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: chunks are emitted as they are received, so the reported feed runs dry as the feed drawn from
 * >   does.
 * > - **Streaming**: responses are drawn one at a time and chunk by chunk, none retained, so resources of any size
 * >   are handled without holding them in memory and a consumer that stops early cancels the response.
 * > - **Stateless**: every request is exchanged on its own, so the outcome is unaffected by how the feed is split
 * >   across nested feeds or runs, whatever state `middlewares` and the resolved client carry across exchanges.
 *
 * > [!WARNING]
 * > Responses reporting an unsuccessful status are skipped, leaving the feed to run to completion; a request stating
 * > a URL that is not absolute or is otherwise malformed brings the feed down instead, unless a middleware screening
 * > it, such as `monitor()` from `@metreeca/http/monitor`, is layered over the client.
 *
 * @param middlewares The middlewares to be layered over the resolved fetch client, in request processing order
 *
 * @returns A task converting a feed of requests into a feed of response byte chunks
 *
 * @throws Error While the feed is consumed, if no execution is running, as the fetch client is resolved from the
 *               enclosing one
 *
 * @throws Error While the feed is consumed, whatever the exchange reports while connecting to a resource or receiving
 *               its response
 */
export function fetch(...middlewares: readonly Middleware[]): Task<string | URL | Request, Uint8Array> {

	return requests => items((async function* () {

		const fetch = service(createFetch);

		const send = createFetch(
			...middlewares,
			headers({

				"Accept": Accept,
				"User-Agent": UserAgent

			}),
			transport(fetch)
		);

		for await (const request of requests) {

			const response = await send(request);

			yield* response.ok ? response.body ?? [] : []; // a response without a body contributes no chunks

		}

	})());

}
