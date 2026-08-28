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


import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Fetch } from "../index.js";

/**
 * Creates a `file` protocol handler.
 *
 * The generated handler retrieves local files, reporting their content as it is asked for, so that files of any size
 * are handled without holding them in memory; a consumer that stops early closes the underlying descriptor.
 *
 * The target is probed before the response is reported, so that a file that cannot be read is known as an unsuccessful
 * status rather than as an error thrown while the body is being consumed: a missing file is reported as `404`, an
 * unreadable one and a directory as `403`, a malformed `file` URL as `400`. Requests other than `GET` and `HEAD` are
 * refused as `405`.
 *
 * @returns A {@link Fetch} implementation serving the `file` scheme
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8089 RFC 8089 - The "file" URI Scheme}
 */
function file(): Fetch {

	return async (input, init) => {

		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
		const url = input instanceof Request ? input.url : input.toString();

		if ( method !== "GET" && method !== "HEAD" ) { // a local file is read-only
			return new Response(null, { status: 405, headers: { "Allow": "GET, HEAD" } });
		}

		try {

			const path = fileURLToPath(url);
			const stats = await stat(path);

			if ( stats.isDirectory() ) {

				return new Response(null, { status: 403 });

			} else {

				const headers = {

					"Content-Length": String(stats.size),
					"Last-Modified": new Date(stats.mtimeMs).toUTCString(),
					"Content-Location": url

				};

				return method === "HEAD" ? new Response(null, { headers }) : new Response(body(path), { headers });

			}

		} catch ( error ) {

			return new Response(null, { status: status(error) });

		}


		/**
		 * Reports the content of a file as a stream reading from it as chunks are asked for.
		 *
		 * The platform `ReadableStream` is assembled by hand, rather than through `Readable.toWeb()`, as the stream
		 * types of `node:stream/web` and the ones `Response` is defined against are structurally incompatible.
		 */
		function body(path: string): ReadableStream {

			const chunks = createReadStream(path)[Symbol.asyncIterator]();

			return new ReadableStream({

				async pull(controller) {

					const { done, value } = await chunks.next();

					if ( done ) {

						controller.close();

					} else {

						controller.enqueue(value);

					}

				},

				async cancel() {

					await chunks.return?.();

				}

			});

		}

		/**
		 * Reports the status a file system error is to be relayed as.
		 */
		function status(error: unknown): number {

			const code = error instanceof Error && "code" in error ? error.code : undefined;

			if ( code === "ENOENT" || code === "ENOTDIR" ) {

				return 404;

			} else if ( code === "EACCES" || code === "EPERM" ) {

				return 403;

			} else if ( typeof code === "string" && code.startsWith("ERR_INVALID") ) {

				return 400;

			} else {

				return 500;

			}

		}

	};

}
