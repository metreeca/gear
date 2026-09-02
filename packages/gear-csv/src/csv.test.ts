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
 * Creates a feed carrying the given documents.
 */
function documents(...values: readonly (string | Response)[]): Feed<string | Response> {
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

		const records = csv<Row>({ header: true })(documents("id,label\n1,alpha\n2,beta\n"));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("yields no record for an empty feed", async () => {

		const records = csv<Row>({ header: true })(documents());

		expect(await collect(records)).toEqual([]);

	});

	it("reads each document on its own, header included", async () => {

		const records = csv<Row>({ header: true })(documents(
			"id,label\n1,alpha\n",
			"label,id\nbeta,2\n"
		));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("parses each application as a document of its own", async () => {

		const task = csv<Row>({ header: true });

		expect(await collect(task(documents("id,label\n1,alpha\n")))).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Row[]);

		expect(await collect(task(documents("id,label\n2,beta\n")))).toEqual([
			{ id: "2", label: "beta" }
		] satisfies readonly Row[]);

	});

	it("strips a byte order mark", async () => {

		const records = csv<Row>({ header: true })(documents("﻿id,label\n1,alpha\n"));

		expect(await collect(records)).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Row[]);

	});

	it("skips records that cannot be parsed", async () => {

		const records = csv<Row>({ header: true })(documents("id,label\n1,\"alpha\"x\n"));

		expect(await collect(records)).toEqual([]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield "id,label\n1,alpha\n";

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(collect(csv({ header: true })(failing))).rejects.toThrow("broken source");

	});

	describe("streaming", () => {

		/**
		 * Creates a feed carrying `count` documents, recording the effects the task has on it.
		 */
		function feed(count: number) {

			const state = { pulled: 0, closed: false };

			async function* generate(): AsyncIterable<string> {

				try {

					for (const index of Array.from({ length: count }, (_, i) => i)) { // generators have no functional equivalent

						state.pulled = index+1;

						yield `id,label\n${index},label-${index}\n`;

					}

				} finally {

					state.closed = true;

				}

			}

			return { state, documents: items(generate()) };

		}


		it("draws one document at a time", async () => {

			const { state, documents: source } = feed(10_000);

			const records = csv({ header: true })(source)[Symbol.asyncIterator]();

			await records.next();

			expect(state.pulled).toBe(1);

			await records.return?.();

		});

		it("releases the source when the consumer stops early", async () => {

			const { state, documents: source } = feed(10_000);

			const records = csv({ header: true })(source)[Symbol.asyncIterator]();

			await records.next();
			await records.return?.(); // as a downstream take() would, once satisfied

			await delay(10); // teardown propagates upstream asynchronously

			expect(state.closed).toBe(true);

		});

	});

	describe("responses", () => {

		/**
		 * Creates a response stating the given content type, none if it is omitted.
		 *
		 * The field is stated as empty rather than left out, as the `Response` constructor infers one from the body.
		 */
		function response(body: BodyInit | null, type?: string): Response {
			return new Response(body, { headers: { "Content-Type": type ?? "" } });
		}


		it("reads the response body as the document", async () => {

			const records = csv<Row>({ header: true })(documents(
				response("id,label\n1,alpha\n", "text/csv")
			));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

		it("decodes the response body as the charset it states", async () => {

			const bytes = Buffer.from("id,label\n1,città\n", "latin1");

			const records = csv<Row>({ header: true })(documents(
				response(bytes, "text/csv; charset=ISO-8859-1")
			));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "città" }
			] satisfies readonly Row[]);

		});

		it("decodes the response body as UTF-8 where it states no charset", async () => {

			const bytes = Buffer.from("id,label\n1,città\n", "utf8");

			const records = csv<Row>({ header: true })(documents(response(bytes)));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "città" }
			] satisfies readonly Row[]);

		});

		it("strips a byte order mark from the response body", async () => {

			const bytes = Buffer.from("﻿id,label\n1,alpha\n", "utf8");

			const records = csv<Row>({ header: true })(documents(response(bytes, "text/csv; charset=utf-8")));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

		it("reads a response stating a content type other than CSV", async () => {

			// a mis-declared type is reported to the log and read all the same, as CSV is served under many types

			const records = csv<Row>({ header: true })(documents(
				response("id,label\n1,alpha\n", "text/plain")
			));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

		it("reads a response stating an unknown charset as UTF-8", async () => {

			// a charset the platform doesn't decode is reported to the log and the body read as UTF-8 all the same

			const bytes = Buffer.from("id,label\n1,città\n", "utf8");

			const records = csv<Row>({ header: true })(documents(response(bytes, "text/csv; charset=bogus")));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "città" }
			] satisfies readonly Row[]);

		});

		it("yields no record for a response without a body", async () => {

			const records = csv<Row>({ header: true })(documents(response(null, "text/csv")));

			expect(await collect(records)).toEqual([]);

		});

		it("pulls the response body as records are consumed", async () => {

			const count = 10_000;
			const state = { pulled: 0 };

			const body = new ReadableStream<Uint8Array>({

				start(controller) {
					controller.enqueue(new TextEncoder().encode("id,label\n"));
				},

				pull(controller) {

					state.pulled += 1; // recording a pull has no functional equivalent

					if ( state.pulled > count ) {

						controller.close();

					} else {

						controller.enqueue(new TextEncoder().encode(`${state.pulled},label-${state.pulled}\n`));

					}

				}

			});

			const records = csv({ header: true })(documents(response(body, "text/csv")))[Symbol.asyncIterator]();

			await records.next();

			expect(state.pulled).toBeLessThan(count/2);

			await records.return?.();

		});

	});

	describe("header", () => {

		it("keys fields by positional index by default", async () => {

			const records = csv()(documents("1,alpha\n2,beta\n"));

			expect(await collect(records)).toEqual([
				["1", "alpha"],
				["2", "beta"]
			]);

		});

		it("keys fields by column label on request", async () => {

			const records = csv<Row>({ header: true })(documents("id,label\n1,alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("skip", () => {

		it("skips empty lines on request", async () => {

			const records = csv<Row>({ header: true, skip: true })(documents("id,label\n1,alpha\n\n2,beta\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" },
				{ id: "2", label: "beta" }
			] satisfies readonly Row[]);

		});

	});

	describe("trim", () => {

		it("keeps field whitespace by default", async () => {

			const records = csv<Row>({ header: true })(documents("id,label\n 1 , alpha \n"));

			expect(await collect(records)).toEqual([
				{ id: " 1 ", label: " alpha " }
			] satisfies readonly Row[]);

		});

		it("strips field whitespace on request", async () => {

			const records = csv<Row>({ header: true, trim: true })(documents(" id , label \n 1 , alpha \n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("flex", () => {

		it("skips records with mismatched field counts by default", async () => {

			const records = csv<Row>({ header: true })(documents("id,label\n1\n2,beta,extra\n3,gamma\n"));

			expect(await collect(records)).toEqual([
				{ id: "3", label: "gamma" }
			] satisfies readonly Row[]);

		});

		it("emits short records without their missing fields on request", async () => {

			const records = csv<Row>({ header: true, flex: true })(documents("id,label\n1\n2,beta\n"));

			expect(await collect(records)).toEqual([
				{ id: "1" },
				{ id: "2", label: "beta" }
			] satisfies readonly Partial<Row>[]);

		});

		it("discards fields beyond the header on request", async () => {

			const records = csv<Row>({ header: true, flex: true })(documents("id,label\n1,alpha,extra\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

	describe("quote", () => {

		it("unwraps fields with the stated quote", async () => {

			const records = csv<Row>({ header: true, quote: "'" })(documents("id,label\n1,'alpha,beta'\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha,beta" }
			] satisfies readonly Row[]);

		});

		it("falls back to the default quote if stated as empty", async () => {

			const records = csv<Row>({ header: true, quote: "" })(documents("id,label\n1,\"alpha,beta\"\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha,beta" }
			] satisfies readonly Row[]);

		});

	});

	describe("delimiter", () => {

		it("splits fields on the stated delimiter", async () => {

			const records = csv<Row>({ header: true, delimiter: ";" })(documents("id;label\n1;alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

		it("falls back to the default delimiter if stated as empty", async () => {

			const records = csv<Row>({ header: true, delimiter: "" })(documents("id,label\n1,alpha\n"));

			expect(await collect(records)).toEqual([
				{ id: "1", label: "alpha" }
			] satisfies readonly Row[]);

		});

	});

});
