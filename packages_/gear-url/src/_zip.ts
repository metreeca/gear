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


import type { Fetch } from "@metreeca/http";

/**
 * Entry extraction function.
 *
 * Reports the content of the `entry` of a zip `archive`, or `undefined` if the archive states no such entry.
 */
type Unzip = (archive: Uint8Array<ArrayBuffer>, entry: string) => Uint8Array<ArrayBuffer> | undefined;

/**
 * Creates a `zip` protocol handler.
 *
 * The generated handler serves the entries of zip archives, addressed as the archive URL followed by the entry path,
 * separated by `!/`, as in `zip:file:///data/isced.zip!/concepts.csv`.
 *
 * Archives are retrieved through `archives`, so that an archive is reached wherever it is stored and through whatever
 * middlewares that client is assembled with; the outcome of an unsuccessful retrieval is relayed to the caller as it
 * was reported. A URL stating no `!/` separator is refused as `400`, an entry the archive doesn't state as `404`, and
 * requests other than `GET` and `HEAD` as `405`.
 *
 * > [!WARNING]
 * > The archive is held in memory while the entry is extracted, so archives are to be kept to a size the process can
 * > afford.
 *
 * @param archives The {@link Fetch} implementation to retrieve archives through
 * @param unzip The function to extract entries with
 *
 * @returns A {@link Fetch} implementation serving the `zip` scheme
 *
 * @see {@link https://pkware.cachefly.net/webdocs/APPNOTE/APPNOTE-6.3.9.TXT APPNOTE 6.3.9 - .ZIP File Format
 *     Specification}
 */
function zip(archives: Fetch, unzip: Unzip): Fetch {

	return async (input, init) => {

		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
		const url = input instanceof Request ? input.url : input.toString();

		const separator = url.indexOf("!/");

		if ( method !== "GET" && method !== "HEAD" ) { // an archive entry is read-only
			return new Response(null, { status: 405, headers: { "Allow": "GET, HEAD" } });
		}

		if ( separator < 0 ) {

			return new Response(null, { status: 400 });

		} else {

			const response = await archives(url.slice(url.indexOf(":")+1, separator));

			if ( !response.ok ) {

				return response;

			} else {

				const entry = unzip(new Uint8Array(await response.arrayBuffer()), url.slice(separator+2));

				if ( entry === undefined ) {

					return new Response(null, { status: 404 });

				} else {

					return new Response(method === "HEAD" ? null : entry, {

						headers: {

							"Content-Length": String(entry.length),
							"Content-Location": url

						}

					});

				}

			}

		}

	};

}
