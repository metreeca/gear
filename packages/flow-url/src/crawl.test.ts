/*
 * Copyright © 2025-2026 Metreeca srl
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

import type { Data } from "@metreeca/pipe";
import { feed } from "@metreeca/pipe/feeds";
import { toArray } from "@metreeca/pipe/sinks";
import { take } from "@metreeca/pipe/tasks";
import { describe, expect, it } from "vitest";
import { crawl } from "./crawl.js";


/**
 * A directed graph as an adjacency map, converging on `d` and leaving `z` unreachable from `a`.
 */
const graph: Record<string, readonly string[]> = {
	a: ["b", "c"],
	b: ["d"],
	c: ["d", "e"],
	d: [],
	e: [],
	z: []
};


describe("crawl()", () => {

	it("should emit the seed nodes", async () => {

		const values = await feed(["a", "b"])(crawl(() => undefined))(toArray());

		expect(values).toEqual(["a", "b"]);

	});

	it("should emit nothing for an empty source", async () => {

		const values = await feed<string>([])(crawl(() => undefined))(toArray());

		expect(values).toEqual([]);

	});

	it("should crawl reachable nodes breadth-first in level order", async () => {

		// depth-first pre-order would emit ["a", "b", "d", "c", "e"]; `z` is unreachable from `a`

		const values = await feed(["a"])(crawl(node => graph[node]))(toArray());

		expect(values).toEqual(["a", "b", "c", "d", "e"]);

	});

	it("should crawl converging nodes once, at their shallowest level", async () => {

		// `f` is linked both from the seed and from `e`; the first arrival is the shallowest one

		const converging: Record<string, readonly string[]> = { a: ["b", "f"], b: ["e"], e: ["f"], f: [] };

		const values = await feed(["a"])(crawl(node => converging[node]))(toArray());

		expect(values).toEqual(["a", "b", "f", "e"]);

	});

	it("should terminate on cyclic graphs", async () => {

		const cyclic: Record<string, readonly string[]> = { a: ["b"], b: ["a"] };

		const values = await feed(["a"])(crawl(node => cyclic[node]))(toArray());

		expect(values).toEqual(["a", "b"]);

	});

	it("should share crawled nodes across seeds", async () => {

		const shared: Record<string, readonly string[]> = { a: ["d"], c: ["d"], d: [] };

		const values = await feed(["a", "c"])(crawl(node => shared[node]))(toArray());

		expect(values).toEqual(["a", "c", "d"]);

	});

	it("should crawl repeated seeds once", async () => {

		const values = await feed(["a", "a"])(crawl(() => undefined))(toArray());

		expect(values).toEqual(["a"]);

	});

	it("should drain the seeds before descending", async () => {

		// descending eagerly would emit ["a", "p", "x"]

		const values = await feed(["a", "x"])(crawl(node => node === "a" ? "p" : undefined))(toArray());

		expect(values).toEqual(["a", "x", "p"]);

	});

	it("should emit the seeds before the source is drained", async () => {

		let traversals = 0;

		const seeds = feed((async function* () {
			for (let i = 0; true; i++) { yield `s${i}`; }
		})());

		const values = await seeds(crawl(() => {

			traversals++;

			return undefined;

		}))(take(2))(toArray());

		expect(values).toEqual(["s0", "s1"]);
		expect(traversals).toBe(0); // the descent never starts, as the source is never exhausted

	});

	it("should treat an undefined traversal as a leaf", async () => {

		const values = await feed(["a"])(crawl(node => node === "a" ? ["b"] : undefined))(toArray());

		expect(values).toEqual(["a", "b"]);

	});

	it("should emit iterable nodes whole", async () => {

		const values = await feed<readonly string[]>([["x", "y"]])(crawl(() => undefined))(toArray());

		expect(values).toEqual([["x", "y"]]);

	});

	it("should match nodes by identity", async () => {

		const one = { id: 1 };
		const two = { id: 1 };

		// the traverser yields `two` only if handed `one` itself, so both ends of the identity are exercised

		const values = await feed([one])(crawl(node => node === one ? [two] : undefined))(toArray());

		expect(values).toEqual([{ id: 1 }, { id: 1 }]); // structurally equal, but crawled as distinct nodes

	});

	it("should expand every data shape the traverser returns", async () => {

		const shapes: Record<string, undefined | Data<string>> = {
			a: "b",
			b: ["c"],
			c: new Set(["d"]),
			d: feed(["e"]),
			e: (async function* () { yield "f"; })(),
			f: undefined
		};

		const values = await feed(["a"])(crawl(node => shapes[node]))(toArray());

		expect(values).toEqual(["a", "b", "c", "d", "e", "f"]);

	});

	it("should support asynchronous traversers", async () => {

		const values = await feed(["a"])(crawl(async node => graph[node]))(toArray());

		expect(values).toEqual(["a", "b", "c", "d", "e"]);

	});

	it("should close the source when the stream is closed early", async () => {

		let closed = false;

		const seeds = feed((async function* () {
			try {
				yield "a";
				yield "b";
			} finally {
				closed = true;
			}
		})());

		const values = await seeds(crawl(() => undefined))(take(1))(toArray());

		expect(values).toEqual(["a"]);
		expect(closed).toBe(true);

	});


	describe("with a selector", () => {

		it("should crawl nodes with equal keys once", async () => {

			const one = { uri: "u" };
			const two = { uri: "u" };

			const values = await feed([one])(crawl(node => node === one ? [two] : undefined, {
				selector: node => node.uri
			}))(toArray());

			expect(values).toEqual([{ uri: "u" }]); // `two` keys to the same `u` as the seed

		});

		it("should crawl seeds with equal keys once", async () => {

			const values = await feed([{ uri: "u" }, { uri: "u" }])(crawl(() => undefined, {
				selector: node => node.uri
			}))(toArray());

			expect(values).toHaveLength(1);

		});

		it("should support asynchronous selectors", async () => {

			const values = await feed([{ uri: "u" }, { uri: "u" }])(crawl(() => undefined, {
				selector: async node => node.uri
			}))(toArray());

			expect(values).toHaveLength(1);

		});

	});

});
