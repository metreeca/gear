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

import type { Value } from "@metreeca/core";
import type { Feed } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { json } from "./json.js";


type Item = {

	readonly id: string;
	readonly label: string;

}


/**
 * Creates a feed carrying the given chunks.
 */
function chunks(...values: readonly (string | Uint8Array)[]): Feed<string | Uint8Array> {
	return items((async function* () { yield* values; })());
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("json", () => {

	it("emits the parsed document as a single value", async () => {

		const values = await chunks(`{ "id": "1", "label": "alpha" }`)(json<Item>())(toArray());

		expect(values).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Item[]);

	});

	it("emits documents rooted at values other than objects", async () => {

		const values = await chunks(`[1, "alpha", null]`)(json<Value>())(toArray());

		expect(values).toEqual([
			[1, "alpha", null]
		] satisfies readonly Value[]);

	});

	it("emits documents rooted at scalar values", async () => {

		const values = await chunks(`42`)(json<Value>())(toArray());

		expect(values).toEqual([
			42
		] satisfies readonly Value[]);

	});

	it("joins documents split across chunks", async () => {

		const values = await chunks(`{ "id": "1", `, `"label": "al`, `pha" }`)(json<Item>())(toArray());

		expect(values).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Item[]);

	});

	it("parses each application as a document of its own", async () => {

		const task = json<Item>();

		expect(await chunks(`{ "id": "1", "label": "alpha" }`)(task)(toArray())).toEqual([
			{ id: "1", label: "alpha" }
		] satisfies readonly Item[]);

		expect(await chunks(`{ "id": "2", "label": "beta" }`)(task)(toArray())).toEqual([
			{ id: "2", label: "beta" }
		] satisfies readonly Item[]);

	});

	it("yields no value if the source produces no chunks", async () => {

		expect(await chunks()(json())(toArray())).toEqual([]);

	});

	it("yields no value if the source produces only whitespace", async () => {

		expect(await chunks(" \n\t ")(json())(toArray())).toEqual([]);

	});

	it("skips documents that cannot be parsed", async () => {

		expect(await chunks(`{ "id": "1", `)(json())(toArray())).toEqual([]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `{ "id": "1", `;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(json())(toArray())).rejects.toThrow("broken source");

	});

	it("drains the source before emitting the value", async () => {

		const count = 1_000;
		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<string> {

			yield "[";

			for (const index of Array.from({ length: count }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield `${index > 0 ? "," : ""}{"id":"${index}","label":"label-${index}"}`;

			}

			yield "]";

		}

		const values = json<readonly Item[]>()(items(source()))[Symbol.asyncIterator]();

		await values.next();

		expect(state.pulled).toBe(count);

	});

	describe("decoding", () => {

		it("decodes multibyte characters split across byte chunks", async () => {

			const bytes = Buffer.from(`{ "id": "1", "label": "città" }`, "utf8");
			const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

			const values = await chunks(bytes.subarray(0, cut), bytes.subarray(cut))(json<Item>())(toArray());

			expect(values).toEqual([
				{ id: "1", label: "città" }
			] satisfies readonly Item[]);

		});

		it("decodes multibyte characters split across byte chunks resuming after text chunks", async () => {

			const bytes = Buffer.from(`città" }`, "utf8");
			const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

			const values = await chunks(`{ "id": "1", "label": "`, bytes.subarray(0, cut), bytes.subarray(cut))
			(json<Item>())(toArray());

			expect(values).toEqual([
				{ id: "1", label: "città" }
			] satisfies readonly Item[]);

		});

		it("skips documents whose byte sequences are left truncated by a switch to text", async () => {

			const bytes = Buffer.from(`{ "id": "1", "label": "città`, "utf8");
			const cut = bytes.indexOf(Buffer.from("à", "utf8"))+1; // between the two bytes of à

			// the withheld bytes are released at the end of the source rather than where the text resumes, so the
			// replacement character trails the document rather than standing in for the truncated sequence

			expect(await chunks(bytes.subarray(0, cut), `" }`)(json<Item>())(toArray())).toEqual([]);

		});

	});

});
