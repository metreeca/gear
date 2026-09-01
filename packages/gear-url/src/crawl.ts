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

import type { Optional } from "@metreeca/core";
import type { Awaitable, Awaitables } from "@metreeca/core/async";
import type { Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";


/**
 * Creates a task crawling the URLs reachable from the items of a feed.
 *
 * Each item is taken as a crawl seed and `walker` states the URLs linked from a URL, or nothing if it is a leaf. URLs
 * are emitted breadth-first in level order, every seed first, then every URL one step away from a seed, and so on, so
 * that the first arrival at a URL is also its shallowest one.
 *
 * Crawling navigates a graph of URLs without retrieving what they stand for: retrieving a URL belongs to the pipe
 * `walker` is built from, while deriving results from the crawled URLs belongs to the tasks downstream. Seeds and
 * links are stated either as strings or as {@link URL} objects, but reach `walker` and the feed as parsed objects,
 * each one the crawl's own and safe to be altered.
 *
 * > [!IMPORTANT]
 * >
 * > URLs are crawled at most once across the whole feed, whatever seed they are reached from, so cyclic and
 * > converging graphs are crawled without duplicates and without looping. They are matched by canonical form, so
 * > that an omitted path or an uppercase host is crawled once, while what the parser keeps apart, a trailing slash
 * > or a fragment among them, is crawled as a distinct URL.
 *
 * > [!IMPORTANT]
 * >
 * > Seeds are drained before the crawl descends: they are emitted as they are pulled, but no URL reachable from
 * > them is emitted until the source runs dry, so the feed never completes on an endless source.
 *
 * > [!WARNING]
 * >
 * > Every crawled URL is retained for the whole lifetime of the feed, as are the seeds and the level being crawled.
 * > For unbounded or widely branching graphs, this may exhaust memory or never complete.
 *
 * @param walker The possibly asynchronous function stating the URLs linked from a URL as an
 *   {@link @metreeca/core!async.Awaitables Awaitables} sequence, or nothing if it is a leaf
 *
 * @returns A task emitting the URLs of the source feed and every URL reachable from them, each at most once and as a
 *   parsed object
 *
 * @throws {TypeError} While the feed is consumed, if a seed or a link cannot be parsed on its own, a relative
 *   reference among them
 *
 * @example
 *
 * ```typescript
 * const pages: Record<string, string[]> = { "/a": ["/b", "/c"], "/b": ["/d"], "/c": ["/d"], "/d": [] };
 *
 * await pipe(
 *   (items(["https://example.com/a"]))
 *   (crawl(url => pages[url.pathname]?.map(path => new URL(path, url))))
 *   (toArray())
 * );  // the URLs of /a, /b, /c and /d, in that order
 * ```
 */
export function crawl(walker: (url: URL) => Awaitable<Optional<Awaitables<string | URL>>>): Task<string | URL, URL> {

	return source => items((async function* () {

		const visited = new Set<string>(); // the hrefs of the crawled URLs, shared by all seeds

		// the seed level, drained before descending so that the first arrival at a URL is its shallowest;
		// seeds are emitted as they are pulled, so a slow source doesn't withhold the ones already in

		const seeds: URL[] = [];

		for await (const seed of source) {

			const url = new URL(seed);

			if ( visit(url) ) {

				seeds.push(url);

				yield url;

			}

		}

		// descend one level at a time, emitting every URL as it is reached for the first time

		let frontier: readonly URL[] = seeds;

		while ( frontier.length > 0 ) {

			const reached: URL[] = [];

			for (const url of frontier) {
				for await (const next of walk(url)) {
					if ( visit(next) ) {

						reached.push(next);

						yield next;

					}
				}
			}

			frontier = reached;

		}


		function visit({ href }: URL): boolean {

			if ( visited.has(href) ) {

				return false;

			} else {

				visited.add(href);

				return true;

			}

		}

		async function* walk(url: URL): AsyncIterable<URL> {

			for await (const link of items(await walker(url) ?? [])) {
				yield new URL(link);
			}

		}

	})());

}

// feeder
// walker
// mapper
