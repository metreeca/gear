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
import { describe, expect, it } from "vitest";
import { select } from "./jpath.core.js";
import { jpath } from "./jpath.js";


describe("jpath", () => {

	describe("without a mapper", () => {

		it("emits an accessor reading each value in turn", async () => {

			const values: readonly Value[] = [{ id: "1" }, { id: "2" }];

			const paths = await items<Value>(values)(jpath())(toArray());

			expect(paths.map(path => path("$.id"))).toEqual([["1"], ["2"]]);

		});

	});

	describe("with a mapper", () => {

		it("emits the projection assembled for each value", async () => {

			const values: readonly Value[] = [
				{ id: "1", tags: ["a", "b"] },
				{ id: "2", tags: [] }
			];

			const projections = await items<Value>(values)(jpath(path => ({

				id: path("$.id"),
				tags: path("$.tags[*]")

			})))(toArray());

			expect(projections).toEqual([
				{ id: ["1"], tags: ["a", "b"] },
				{ id: ["2"], tags: [] }
			]);

		});

		it("reports a malformed path while the feed is consumed", async () => {

			const projections = items<Value>([{ a: 1 }])(jpath(path => path("a b")))(toArray());

			await expect(projections).rejects.toThrow(Error);

		});

	});


	it("emits no value if the feed runs dry", async () => {

		expect(await items<Value>([])(jpath())(toArray())).toEqual([]);

	});

});

describe("select", () => {

	describe("root", () => {

		it("selects the whole value on an empty path", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "")).toEqual([value]);

		});

		it("selects the whole value on a root path", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$")).toEqual([value]);

		});

		it("takes the root marker as optional", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$.a")).toEqual([1]);
			expect(select(value, ".a")).toEqual([1]);
			expect(select(value, "a")).toEqual([1]);

		});

	});

	describe("property steps", () => {

		it("selects an object property", async () => {

			const value: Value = { a: { b: 1 } };

			expect(select(value, "$.a.b")).toEqual([1]);

		});

		it("selects a null property value", async () => {

			const value: Value = { a: null };

			expect(select(value, "$.a")).toEqual([null]);

		});

		it("selects nothing for an unknown property", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$.b")).toEqual([]);

		});

		it("selects nothing from an array", async () => {

			const value: Value = { a: [{ b: 1 }] };

			expect(select(value, "$.a.b")).toEqual([]);

		});

		it("selects nothing from a scalar", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$.a.b")).toEqual([]);

		});

	});

	describe("bracketed property steps", () => {

		it("selects a property whose name isn't a bare word", async () => {

			const value: Value = { "a.b": 1 };

			expect(select(value, "$['a.b']")).toEqual([1]);

		});

		it("unescapes the property name", async () => {

			const value: Value = { "a'b": 1, "c\\d": 2 };

			expect(select(value, "$['a\\'b']")).toEqual([1]);
			expect(select(value, "$['c\\\\d']")).toEqual([2]);

		});

		it("reads the JSON escapes carried by the property name", async () => {

			const value: Value = { "a\nb": 1, "cAd": 2 };

			expect(select(value, "$['a\\nb']")).toEqual([1]);
			expect(select(value, "$['c\\u0041d']")).toEqual([2]);

		});

	});

	describe("index steps", () => {

		it("selects an array element", async () => {

			const value: Value = { a: [10, 20] };

			expect(select(value, "$.a[1]")).toEqual([20]);

		});

		it("selects nothing beyond the end of the array", async () => {

			const value: Value = { a: [10, 20] };

			expect(select(value, "$.a[2]")).toEqual([]);

		});

		it("selects nothing from an object", async () => {

			const value: Value = { a: { "0": 10 } };

			expect(select(value, "$.a[0]")).toEqual([]);

		});

	});

	describe("wildcard steps", () => {

		it("selects every array element", async () => {

			const value: Value = { a: [10, 20] };

			expect(select(value, "$.a[*]")).toEqual([10, 20]);
			expect(select(value, "$.a.*")).toEqual([10, 20]);

		});

		it("selects every property value", async () => {

			const value: Value = { a: { x: 10, y: 20 } };

			expect(select(value, "$.a[*]")).toEqual([10, 20]);
			expect(select(value, "$.a.*")).toEqual([10, 20]);

		});

		it("selects nothing from a scalar", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$.a.*")).toEqual([]);

		});

	});

	describe("composite paths", () => {

		it("reaches the properties of array elements through a wildcard", async () => {

			const value: Value = { a: [{ b: 1 }, { b: 2 }, { c: 3 }] };

			expect(select(value, "$.a[*].b")).toEqual([1, 2]);

		});

		it("applies a step to every selected value", async () => {

			const value: Value = { a: [[1, 2], [3, 4]] };

			expect(select(value, "$.a[*][0]")).toEqual([1, 3]);

		});

		it("selects nothing once the selection is empty", async () => {

			const value: Value = { a: 1 };

			expect(select(value, "$.x.y.z")).toEqual([]);

		});

	});

	describe("malformed paths", () => {

		it.each([
			"$$", "$a", ".", "a..b", "a.[0]", "a b", "[", "[0", "['a", "[*", "[-1]"
		])("rejects <%s>", async path => {

			expect(() => select({ a: [1] }, path)).toThrow(Error);

		});

		it("isn't affected by a previously rejected path", async () => {

			const value: Value = { a: 1 };

			expect(() => select(value, "a b")).toThrow(Error);
			expect(select(value, "$.a")).toEqual([1]);

		});

	});

});
