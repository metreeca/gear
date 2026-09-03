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
 * Possibly asynchronous, possibly absent value.
 *
 * Absence and asynchrony are taken uniformly, so that a provider hands over whatever it already holds, a value, a
 * promise or nothing at all.
 *
 * @typeParam T The type of the supplied value
 */
export type Source<T> =
	Awaitable<Optional<T>>;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a URL graph walker.
 *
 * The generated task converts a feed of seed URLs into a feed of the URLs reachable from them, so that a consumer
 * works on a whole graph of URLs while stating no more than the step from one URL to the next. URLs are emitted
 * breadth-first in level order, every seed first, then every URL one step away from a seed, and so on, so that the
 * first arrival at a URL is also its shallowest one.
 *
 * Crawling navigates a graph of URLs without retrieving what they stand for: retrieving a URL belongs to the pipe
 * `walker` is built from and deriving results from the crawled URLs to the tasks downstream. Seeds and links are
 * stated either as strings or as {@link !URL} objects, but reach `walker` and the feed as parsed objects, each one the
 * crawl's own and safe to be altered.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: seeds are emitted as they are pulled and reachable URLs level by level, so the feed produced
 * >   runs dry as the feed drawn from and `walker` do; no URL reachable from a seed is emitted until the source runs
 * >   dry, so the feed never completes on an endless source.
 * > - **Materialising**: every crawled URL is retained for the whole lifetime of the feed, as are the seeds and the
 * >   level being crawled, so an unbounded or widely branching graph may exhaust memory.
 * > - **Stateful**: the URLs already crawled decide the ones that follow, so a task invoked per nested feed or per
 * >   run crawls each independently, reaching a URL once per invocation rather than once for the feed as a whole.
 *
 * > [!IMPORTANT]
 * >
 * > URLs are crawled at most once across the whole feed, whatever seed they are reached from, so cyclic and
 * > converging graphs are crawled without duplicates and without looping. They are matched by canonical form, so
 * > that an omitted path or an uppercase host is crawled once, while what the parser keeps apart, a trailing slash
 * > or a fragment among them, is crawled as a distinct URL.
 *
 * @param walker The function stating the URLs linked from a URL, none if it is a leaf
 *
 * @returns A task converting a feed of seed URLs into a feed of the seeds and the URLs reachable from them, each as a
 *          parsed object
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing seeds, or whatever `walker`
 *                 reports while stating the URLs linked from a URL
 *
 * @throws {@link !TypeError} While the feed is consumed, if a seed or a link cannot be parsed on its own, a relative
 *                            reference among them
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
export function crawl(
	walker: (url: URL) => Source<Awaitables<string | URL>>
): Task<string | URL, URL>;

/**
 * Creates a URL graph harvester.
 *
 * The generated task converts a feed of seed URLs into a feed of results derived from what the crawled URLs stand for,
 * so that a consumer harvests a whole graph of URLs while stating no more than what a single URL yields. Each crawled
 * URL is fed once, whatever the number of links converging on it, and both walked and mapped from that single reading,
 * so that the crawl is driven and harvested without reading a URL twice. Results are emitted in the level order the
 * URLs are crawled in, the results of every seed first, then those of every URL one step away from a seed, and so on.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: the results of the seeds are emitted as the seeds are pulled and those of the reachable URLs
 * >   level by level, so the feed produced runs dry as the feed drawn from, `feeder`, `walker` and `mapper` do; no
 * >   URL reachable from a seed is fed until the source runs dry, so the feed never completes on an endless source.
 * > - **Materialising**: every crawled URL is retained for the whole lifetime of the feed, as for the single-step
 * >   form, while what a URL stands for is released as soon as it is walked and mapped, so it is never retained
 * >   across levels.
 * > - **Stateful**: the URLs already crawled decide the ones that follow, as for the single-step form.
 *
 * > [!IMPORTANT]
 * >
 * > URLs are crawled at most once across the whole feed, whatever seed they are reached from, and matched by canonical
 * > form, as for the single-step form.
 *
 * @typeParam V The type of what a crawled URL stands for
 * @typeParam R The type of the results derived from a crawled URL
 *
 * @param feeder The function stating what a URL stands for, none if it is to be crawled no further and to contribute
 *               no result
 * @param walker The function stating the URLs linked from what a URL stands for, none if it is a leaf
 * @param mapper The function stating the results derived from what a URL stands for, either a single result or a
 *               sequence of them, none if it contributes no result
 *
 * @returns A task converting a feed of seed URLs into a feed of the results derived from every crawled URL
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing seeds, or whatever `feeder`,
 *                 `walker` and `mapper` report while reading, walking and mapping a URL
 *
 * @throws {@link !TypeError} While the feed is consumed, if a seed or a link cannot be parsed on its own, a relative
 *                            reference among them
 *
 * @example
 *
 * ```typescript
 * await pipe(
 *   (items(["https://example.com/products/"]))
 *   (crawl(
 *     url => parse(url), // the page the URL stands for, retrieved once
 *     page => page.links(".pagination a"), // the index pages it paginates to
 *     page => page.links(".entry a") // the item links it lists
 *   ))
 *   (toArray())
 * );  // the item links of every index page
 * ```
 */
export function crawl<V, R>(
	feeder: (url: URL) => Source<V>,
	walker: (data: V) => Source<Awaitables<string | URL>>,
	mapper: (data: V) => Source<R | Awaitables<R>>
): Task<string | URL, R>;

/**
 * Creates a URL graph walker or harvester.
 */
export function crawl<V, R>(...steps:
	| [
		walker: (url: URL) => Source<Awaitables<string | URL>>
	]
	| [
		feeder: (url: URL) => Source<V>,
		walker: (data: V) => Source<Awaitables<string | URL>>,
		mapper: (data: V) => Source<R | Awaitables<R>>
	]
): Task<string | URL, URL | R> {

	return steps.length === 1
		? roam(steps[0])
		: reap(steps[0], steps[1], steps[2]);


	function roam(walker: (url: URL) => Source<Awaitables<string | URL>>): Task<string | URL, URL> {

		return source => items((async function* () {

			const admitted = admitting();

			// the seed level, drained before descending so that the first arrival at a URL is its shallowest;
			// seeds are emitted as they are pulled, so a slow source doesn't withhold the ones already in

			const seeds: URL[] = [];

			for await (const url of admitted(source)) {

				seeds.push(url);

				yield url;

			}

			yield* descending(seeds, reach);


			async function* reach(url: URL, reached: URL[]): AsyncIterable<URL> {

				for await (const next of admitted(await walker(url))) {

					reached.push(next);

					yield next;

				}

			}

		})());

	}

	function reap<V, R>(
		feeder: (url: URL) => Source<V>,
		walker: (data: V) => Source<Awaitables<string | URL>>,
		mapper: (data: V) => Source<R | Awaitables<R>>
	): Task<string | URL, R> {

		return source => items((async function* () {

			const admitted = admitting();

			// the URLs linked from the seed level, buffered until the source runs dry so that the first arrival at a
			// URL is its shallowest; seeds are reached as they are pulled, so a slow source doesn't withhold the
			// ones already in

			const linked: URL[] = [];

			for await (const url of admitted(source)) {
				yield* reach(url, linked);
			}

			yield* descending(linked, reach);


			async function* reach(url: URL, reached: URL[]): AsyncIterable<R> {

				const data = await feeder(url);

				if ( data !== undefined ) {

					yield* items<R>(await mapper(data) ?? []);

					for await (const next of admitted(await walker(data))) {
						reached.push(next);
					}

				}

			}

		})());

	}


	function admitting(): (links: Optional<Awaitables<string | URL>>) => AsyncIterable<URL> {

		const crawled = new Set<string>();

		return async function* (links) {

			for await (const link of items(links ?? [])) {

				const url = new URL(link);

				if ( !crawled.has(url.href) ) {

					crawled.add(url.href);

					yield url;

				}

			}

		};

	}

	async function* descending<R>(
		seeds: readonly URL[],
		reach: (url: URL, reached: URL[]) => AsyncIterable<R>
	): AsyncIterable<R> {

		let frontier: readonly URL[] = seeds;

		while ( frontier.length > 0 ) {

			const reached: URL[] = [];

			for (const url of frontier) {
				yield* reach(url, reached);
			}

			frontier = reached;

		}

	}

}
