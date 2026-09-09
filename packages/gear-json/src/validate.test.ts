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
import type { Trace } from "@metreeca/core/trace";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import { describe, expect, it } from "vitest";
import { validate } from "./validate.js";


type Item = {

	readonly id: string;
	readonly label: string;

}


/**
 * Rejects items stating an empty label, reporting the violation under the offending property.
 */
function labelled(item: Item): Optional<Trace> {
	return item.label ? undefined : [ { label: [ "expected a non-empty label" ] } ];
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("validate", () => {

	it("emits the values the validator accepts", async () => {

		const values: readonly Item[] = [
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		];

		expect(await items(values)(validate(labelled))(toArray())).toEqual([
			{ id: "1", label: "alpha" },
			{ id: "2", label: "beta" }
		] satisfies readonly Item[]);

	});

	it("drops the values the validator reports violations for", async () => {

		const values: readonly Item[] = [
			{ id: "1", label: "" },
			{ id: "2", label: "beta" }
		];

		expect(await items(values)(validate(labelled))(toArray())).toEqual([
			{ id: "2", label: "beta" }
		] satisfies readonly Item[]);

	});

	it("propagates a source failure", async () => {

		const failing = items((async function* (): AsyncGenerator<Item> {

			yield { id: "1", label: "alpha" };

			throw new Error("broken source"); // told apart from failures raised by the task by its message

		})());

		await expect(failing(validate(labelled))(toArray())).rejects.toThrow("broken source");

	});

	it("propagates a validator failure", async () => {

		const breaking = items<Item>([ { id: "1", label: "alpha" } ]);

		await expect(breaking(validate<Item>(() => {

			throw new Error("broken validator");

		}))(toArray())).rejects.toThrow("broken validator");

	});

	it("emits a value as soon as it is drawn", async () => {

		const state = { pulled: 0 }; // records how far the task pulls the source

		async function* source(): AsyncIterable<Item> {

			for (const index of Array.from({ length: 10 }, (_, i) => i)) { // generators have no functional equivalent

				state.pulled = index+1;

				yield { id: `${index}`, label: `label-${index}` };

			}

		}

		const values = validate(labelled)(items(source()))[Symbol.asyncIterator]();

		expect((await values.next()).value).toEqual({ id: "0", label: "label-0" } satisfies Item);
		expect(state.pulled).toBe(1);

		await values.return?.();

	});

});
