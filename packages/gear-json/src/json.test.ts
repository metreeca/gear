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
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { process } from "./json.core.js";
import { json } from "./json.js";


type Item = {

	readonly id: string;
	readonly label: string;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("process", () => {

	it("parses the document as a value", async () => {

		expect(await process<Item>(`{ "id": "1", "label": "alpha" }`))
			.toEqual({ id: "1", label: "alpha" } satisfies Item);

	});

	it("parses documents rooted at values other than objects", async () => {

		expect(await process<Value>(`[1, "alpha", null]`)).toEqual([1, "alpha", null] satisfies Value);

	});

	it("parses documents rooted at scalar values", async () => {

		expect(await process<Value>(`42`)).toBe(42);

	});

	it("converts a document holding only whitespace to undefined", async () => {

		expect(await process(" \n\t ")).toBeUndefined();

	});

	it("converts a document that cannot be parsed to undefined", async () => {

		expect(await process(`{ "id": "1", `)).toBeUndefined();

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

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`, "application/json")))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("decodes the response body as UTF-8", async () => {

			const bytes = Buffer.from(`{ "id": "1", "label": "città" }`, "utf8");

			expect(await process<Item>(response(bytes, "application/json")))
				.toEqual({ id: "1", label: "città" } satisfies Item);

		});

		it("reads a response stating the UTF-8 charset under any of its labels", async () => {

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`, "application/json; charset=UTF8")))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("reads a response stating a charset other than UTF-8 as UTF-8", async () => {

			// JSON exchanged between systems is encoded as UTF-8, as RFC 8259 § 8.1 prescribes: a body stating
			// another charset is reported to the log and read all the same, its undecodable bytes standing in as
			// replacement characters

			const bytes = Buffer.from(`{ "id": "1", "label": "città" }`, "latin1");

			expect(await process<Item>(response(bytes, "application/json; charset=ISO-8859-1")))
				.toEqual({ id: "1", label: "citt�" } satisfies Item);

		});

		it("reads a response stating a JSON-based content type", async () => {

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`, "application/ld+json")))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("reads a response stating a content type with parameters", async () => {

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`, "application/JSON; charset=utf-8")))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("reads a response stating no content type", async () => {

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`)))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("reads a response stating a content type other than JSON", async () => {

			// a mis-declared type is reported to the log and read all the same, as the parser tells JSON apart anyway

			expect(await process<Item>(response(`{ "id": "1", "label": "alpha" }`, "text/html")))
				.toEqual({ id: "1", label: "alpha" } satisfies Item);

		});

		it("converts a response without a body to undefined", async () => {

			expect(await process(response(null, "application/json"))).toBeUndefined();

		});

	});

});

describe("json", () => {

	it("emits the value of each document in turn", async () => {

		const documents: readonly string[] = [
			`{ "id": "1", "label": "alpha" }`,
			`{ "id": "2", "label": "beta" }`
		];

		expect(await items(documents)(json<Item>())(toArray())).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Item[]);

	});

	it("drops documents holding no text or no parsable value", async () => {

		const documents: readonly string[] = [ " \n\t ", `{ "id": "1", `, `{ "id": "2", "label": "beta" }` ];

		expect(await items(documents)(json<Item>())(toArray())).toEqual([
			{ id: "2", label: "beta" }
		] satisfies readonly Item[]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* () {

			yield `{ "id": "1", "label": "alpha" }`;

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(json())(toArray())).rejects.toThrow("broken source");

	});

	it("emits a value as soon as its document is drawn", async () => {

		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<string> {

			for (const index of Array.from({ length: 10 }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield `{ "id": "${index}", "label": "label-${index}" }`;

			}

		}

		const values = json<Item>()(items(source()))[Symbol.asyncIterator]();

		expect((await values.next()).value).toEqual({ id: "0", label: "label-0" } satisfies Item);
		expect(state.pulled).toBe(1);

		await values.return?.();

	});

});
