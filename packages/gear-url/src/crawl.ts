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

import type { Awaitable } from "@metreeca/core/async";
import type { Data, Task } from "@metreeca/flow";
import { feed } from "@metreeca/flow/feeds";


/**
 * Creates a task crawling the nodes reachable from the items of a stream.
 *
 * Each item is taken as a crawl seed and `traverser` converts a node into the {@link @metreeca/flow!index.Data Data}
 * value listing the nodes reachable from it, or into `undefined` if the node is a leaf. Nodes are emitted
 * breadth-first in level order, every seed first, then every node one step away from a seed, and so on, so that the
 * first arrival at a node is also its shallowest one. Nodes are emitted as they are, arrays and iterables whole
 * rather than expanded into their items, while the value returned by `traverser` is expanded into the nodes it lists.
 *
 * Crawling navigates a graph without changing the node type: retrieving whatever a node stands for belongs to the
 * pipe `traverser` is built from, while deriving results from the crawled nodes belongs to the tasks downstream.
 *
 * > [!NOTE]
 * >
 * > Node types are inferred from the source stream and never from `traverser` or `opts.selector`, so that a traverser
 * > yielding no node doesn't collapse them.
 *
 * > [!IMPORTANT]
 * >
 * > Nodes are crawled at most once. The set of the crawled nodes is shared by all seeds and spans the whole stream,
 * > so cyclic and converging graphs are crawled without duplicates and without looping. Nodes are matched the way a
 * > `Set` matches them, that is by `SameValueZero`, unless `opts.selector` derives a key to match them by.
 *
 * > [!IMPORTANT]
 * >
 * > Seeds are drained before the crawl descends: they are emitted as they are pulled, but no node reachable from
 * > them is emitted until the source runs dry, so the stream never completes on an infinite source.
 *
 * > [!WARNING]
 * >
 * > One key per crawled node is retained for the whole lifetime of the stream: without `opts.selector` that key is
 * > the node itself, otherwise only the derived key is held and the nodes are released as their level passes. The
 * > seeds and the level being crawled are buffered as well. For unbounded or widely branching graphs, this may
 * > exhaust memory or never complete.
 *
 * @typeParam V The type of the crawled nodes
 * @typeParam K The type of the keys the crawled nodes are matched by
 *
 * @param traverser The possibly asynchronous function extracting from a node the nodes to be crawled in turn, or
 *   `undefined` if the node is a leaf
 * @param opts The crawling options
 * @param opts.selector The possibly asynchronous function deriving from a node the key it is matched by; defaults to
 *   matching nodes by themselves
 *
 * @returns A task emitting the items of the source stream and every node reachable from them, each at most once
 *
 * @example
 *
 * ```typescript
 * const graph: Record<string, string[]> = { a: ["b", "c"], b: ["d"], c: ["d"], d: [] };
 *
 * await pipe(
 *   (feed(["a"]))
 *   (crawl(node => graph[node]))
 *   (toArray())
 * );  // ["a", "b", "c", "d"]
 * ```
 */
// !!! a staged traverser, splitting node retrieval from link extraction, was sketched as an alternative overload
// !!! and dropped here to keep the module compilable: revisit before wiring `crawl` into the package exports

export function crawl<V, K>(traverser: (node: V) => Awaitable<undefined | Data<NoInfer<V>>>, {

	selector

}: {

	readonly selector?: (node: NoInfer<V>) => Awaitable<K> // !!! rename here and in distinct

} = {}): Task<V> {

	return async function* (source: AsyncIterable<V>) {

		const crawled = new Set<K | V>(); // the keys of the crawled nodes, shared by all seeds

		// the seed level, drained before descending so that the first arrival at a node is its shallowest;
		// seeds are emitted as they are pulled, so a slow source doesn't withhold the ones already in

		const seeds: V[] = [];

		for await (const seed of source) {
			if ( await admit(seed) ) {

				seeds.push(seed);

				yield seed;

			}
		}

		// descend one level at a time, emitting every node as it is reached for the first time

		let frontier: readonly V[] = seeds;

		while ( frontier.length > 0 ) {

			const reached: V[] = [];

			for (const node of frontier) {
				for await (const next of traverse(node)) {
					if ( await admit(next) ) {

						reached.push(next);

						yield next;

					}
				}
			}

			frontier = reached;

		}


		/**
		 * Admits a node into the crawl.
		 *
		 * @returns True if `node` was not crawled before, in which case it is recorded as crawled; false otherwise
		 */
		async function admit(node: V): Promise<boolean> {

			const key = selector === undefined ? node : await selector(node);

			if ( crawled.has(key) ) {

				return false;

			} else {

				crawled.add(key);

				return true;

			}

		}

	};


	/**
	 * Traverses a node.
	 *
	 * @returns A stream of the nodes reachable from `node`, empty if the traverser extracts none from it
	 */
	async function* traverse(node: V): AsyncIterable<V> {

		const data = await traverser(node);

		yield* feed<V>(data === undefined ? [] : data)(); // `??` would take a `null` node for a leaf

	}

}
