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
import { service } from "@metreeca/gear";
import { createFetch, type Middleware } from "@metreeca/http";
import { headers } from "@metreeca/http/headers";
import { monitor } from "@metreeca/http/monitor";
import { transport } from "@metreeca/http/transport";
import { log } from "@metreeca/tape";


/**
 * The `User-Agent` field exchanges are sent under.
 *
 * States a current desktop Chrome, so that sites serving unattended clients differently, or refusing them altogether,
 * are scraped as a browser would be. The platform token and the `AppleWebKit` and `Safari` tokens are frozen by the
 * reduced user agent Chrome sends, leaving the Chrome version as the only one to be kept in step.
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


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a resource exchange task.
 *
 * The generated task reads a feed of requests as a feed of
 * {@link https://developer.mozilla.org/docs/Web/API/Response Response} objects, each emitted as soon as its head is
 * received, with the body left unread for the consumer to draw or discard; a response carrying no body is emitted all
 * the same.
 *
 * Requests are given as accepted by the standard `fetch()` function, that is as URL strings,
 * {@link https://developer.mozilla.org/docs/Web/API/URL URL} objects or
 * {@link https://developer.mozilla.org/docs/Web/API/Request Request} objects.
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
 * Content coding is left to the transport, which states the codings it accepts and decodes the body before it reaches
 * the consumer, so that no `Accept-Encoding` field is stated here and no body is handed over still compressed.
 *
 * Every exchange is reported to the log as it is performed, so that a run leaves a trace of the resources it drew on
 * and of the ones it was denied; requests are reported as they are stated, before `middlewares` are given a chance to
 * alter them.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: responses are emitted as they are received, so the feed produced runs dry as the feed drawn
 * >   from does.
 * > - **Streaming**: responses are drawn one at a time and handed over with the body unread, none retained, so
 * >   resources of any size are handled without holding them in memory, as long as each body is read or cancelled
 * >   before the next response is drawn.
 * > - **Stateless**: every request is exchanged on its own, so the outcome is unaffected by how the feed is split
 * >   across nested feeds or runs, whatever state `middlewares` and the resolved client carry across exchanges.
 *
 * > [!WARNING]
 * > A request stating a URL that is not absolute, or malformed in any other way, is dropped before it is sent, as is
 * > a response stating an unsuccessful status; both are reported to the log, leaving the feed to run to completion.
 *
 * @param middlewares The middlewares to be layered over the resolved fetch client, in request processing order
 *
 * @returns A task converting a feed of requests into a feed of responses
 *
 * @throws {Error} While the feed is consumed, if no execution is running, as the fetch client is resolved from the
 *                 enclosing one
 *
 * @throws {Error} While the feed is consumed, whatever the exchange reports while connecting to a resource or
 *                 receiving its response
 *
 * @see {@link https://developer.mozilla.org/docs/Web/API/Window/fetch `fetch()`}
 */
export function fetch(...middlewares: readonly Middleware[]): Task<string | URL | Request, Response> {

	return requests => items((async function* () {

		const fetch = service(createFetch);

		const send = createFetch(
			monitor(logger),
			...middlewares,
			headers({

				"Accept": Accept,
				"User-Agent": UserAgent

			}),
			transport(fetch)
		);

		for await (const request of requests) {

			const response = await send(request);

			yield* response.ok ? [response] : []; // unsuccessful responses are reported by the monitor and skipped

		}

	})());

}
