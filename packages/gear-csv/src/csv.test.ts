/*
 * Copyright © 2020-2026 EC2U Alliance
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

import type { Feed } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { Buffer } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { csv } from "./csv.js";


type Row = {

	readonly id: string;
	readonly label: string;

}


/**
 * Creates a feed carrying the given chunks.
 */
function chunks(...values: readonly (string | Uint8Array)[]): Feed<string | Uint8Array> {
	return items((async function* () { yield* values; })());
}

/**
 * Drains a feed into an array.
 *
 * Hand-rolled rather than delegating to `Array.fromAsync()`, which the `ES2022` library the project compiles against
 * doesn't provide.
 */
async function collect<V>(feed: AsyncIterable<V>): Promise<readonly V[]> {

	const collected: V[] = [];

	for await (const item of feed) { collected.push(item); } // draining a feed has no functional equivalent

	return collected;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("csv", () => {

	it("yields a record for each data row", async () => {

		const records = csv<Row>({ header: true })(chunks("id,label\n1,alpha\n2,beta\n"));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("yields no record for an empty feed", async () => {

		const records = csv<Row>({ header: true })(chunks());

		expect(await collect(records)).toEqual([]);

	});

	it("joins records split across chunks", async () => {

		const records = csv<Row>({ header: true })(chunks("id,la", "bel\n1,al", "pha\n2,beta\n"));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("decodes multibyte characters split across byte chunks", async () => {

		const bytes = Buffer.from("id,label\n1,città\n", "utf8");
		const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

		const records = csv<Row>({ header: true })(chunks(bytes.subarray(0, cut), bytes.subarray(cut)));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "città" }
		] satisfies readonly Row[]);

	});

	it("parses each application as a document of its own", async () => {

		const task = csv<Row>({ header: true });

		expect(await collect(task(chunks("id,label\n1,alpha\n")))).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Row[]);

		expect(await collect(task(chunks("id,label\n2,beta\n")))).toEqual([
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("skips records that cannot be parsed", async () => {

		const records = csv<Row>({ header: true })(chunks("id,label\n1,\"alpha\"x\n"));

		expect(await collect(records)).toEqual([]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield "id,label\n";

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(collect(csv({ header: true })(failing))).rejects.toThrow("broken source");

	});

	describe("streaming", () => {

		/**
		 * Creates a feed carrying a header and `count` data rows, recording the effects the task has on it.
		 */
		function rows(count: number) {

			const state = { pulled: 0, closed: false };

			async function* generate(): AsyncIterable<string> {

				yield "id,label\n";

				try {

					for (const index of Array.from({ length: count }, (_, i) => i)) { // generators have no functional equivalent

						state.pulled = index+1;

						yield `${index},label-${index}\n`;

					}

				} finally {

					state.closed = true;

				}

			}

			return { state, chunks: items(generate()) };

		}


		it("pulls from the source as records are consumed", async () => {

			const count = 10_000;
			const { state, chunks: source } = rows(count);

			const records = csv({ header: true })(source)[Symbol.asyncIterator]();

			await records.next();

			expect(state.pulled).toBeLessThan(count/2);

		});

		it("releases the source when the consumer stops early", async () => {

			const { state, chunks: source } = rows(10_000);

			const records = csv({ header: true })(source)[Symbol.asyncIterator]();

			await records.next();
			await records.return?.(); // as a downstream take() would, once satisfied

			await delay(10); // teardown propagates upstream asynchronously

			expect(state.closed).toBe(true);

		});

	});

	describe("header", () => {

		it("keys fields by positional index by default", async () => {

			const records = csv()(chunks("1,alpha\n2,beta\n"));

			expect(await collect(records)).toEqual([
				["1", "alpha"],
				["2", "beta"]
			]);

		});

		it("keys fields by column label on request", async () => {

			const records = csv<Row>({ header: true })(chunks("id,label\n1,alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("skip", () => {

		it("skips empty lines on request", async () => {

			const records = csv<Row>({ header: true, skip: true })(chunks("id,label\n1,alpha\n\n2,beta\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" },
				{ id: "2", label: "beta" }
			] satisfies readonly Row[]);

		});

	});

	describe("trim", () => {

		it("keeps field whitespace by default", async () => {

			const records = csv<Row>({ header: true })(chunks("id,label\n 1 , alpha \n"));

			expect(await collect(records)).toEqual([
				{ id: " 1 ", label: " alpha " }
			] satisfies readonly Row[]);

		});

		it("strips field whitespace on request", async () => {

			const records = csv<Row>({ header: true, trim: true })(chunks(" id , label \n 1 , alpha \n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("flex", () => {

		it("skips records with mismatched field counts by default", async () => {

			const records = csv<Row>({ header: true })(chunks("id,label\n1\n2,beta,extra\n3,gamma\n"));

			expect(await collect(records)).toEqual([
				{ id: "3", label: "gamma" }
			] satisfies readonly Row[]);

		});

		it("emits short records without their missing fields on request", async () => {

			const records = csv<Row>({ header: true, flex: true })(chunks("id,label\n1\n2,beta\n"));

			expect(await collect(records)).toEqual([
				{ id: "1" },
				{ id: "2", label: "beta" }
			] satisfies readonly Partial<Row>[]);

		});

		it("discards fields beyond the header on request", async () => {

			const records = csv<Row>({ header: true, flex: true })(chunks("id,label\n1,alpha,extra\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("quote", () => {

		it("unwraps fields with the stated quote", async () => {

			const records = csv<Row>({ header: true, quote: "'" })(chunks("id,label\n1,'alpha,beta'\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha,beta" }
			] satisfies readonly Row[]);

		});

		it("falls back to the default quote if stated as empty", async () => {

			const records = csv<Row>({ header: true, quote: "" })(chunks("id,label\n1,\"alpha,beta\"\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha,beta" }
			] satisfies readonly Row[]);

		});

	});

	describe("delimiter", () => {

		it("splits fields on the stated delimiter", async () => {

			const records = csv<Row>({ header: true, delimiter: ";" })(chunks("id;label\n1;alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

		it("falls back to the default delimiter if stated as empty", async () => {

			const records = csv<Row>({ header: true, delimiter: "" })(chunks("id,label\n1,alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

});
