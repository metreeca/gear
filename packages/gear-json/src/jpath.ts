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

import { type Value } from "@metreeca/core";
import { Task } from "@metreeca/flow";
import { map } from "@metreeca/flow/tasks";
import { select } from "./jpath.core.js";


/**
 * Path accessor to a JSON value.
 *
 * Reads the values held by a JSON value, addressing them with a JSONPath-like syntax.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9535 RFC 9535 JSONPath Query Expressions for JSON}
 */
export type JPath = {

	/**
	 * Selects values.
	 *
	 * Supported path syntax:
	 *
	 * - `.property` / `property` — object property
	 * - `['property']` — object property, with backslash escapes
	 * - `[0]` — array element by index
	 * - `.*` / `[*]` — every element of an array or every property value of an object
	 *
	 * A leading `$` denotes the whole value and may be omitted.
	 *
	 * Every step addresses the value it is applied to: arrays are entered only through an index or a wildcard step, so
	 * a path reaching the properties of the objects held by an array must include an explicit `[*]` or `.*` step.
	 *
	 * @param path The selection path; an empty path or `$` selects the whole value
	 *
	 * @returns An immutable list of the values addressed by `path`, in document order; empty if no value is addressed
	 *
	 * @throws {Error} If `path` is malformed
	 */
	(path: string): readonly Value[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a JSON path accessor.
 *
 * The generated task converts a feed of values into a feed of {@link JPath} accessors, one reading the value it was
 * created from.
 *
 * @returns A task converting a feed of values into a feed of path accessors
 */
export function jpath(): Task<Value, JPath>; // without a mapper the accessor is emitted as it is

/**
 * Creates a JSON path projector.
 *
 * The generated task converts a feed of values into a feed of projections, one assembled by `mapper` for each
 * incoming value.
 *
 * @typeParam V The type of the projection assembled from each incoming value
 *
 * @param mapper The projection assembler, applied to a {@link JPath} accessor reading the value being processed
 *
 * @returns A task converting a feed of values into a feed of projections
 *
 * @throws {Error} While the feed is consumed, whatever `mapper` reports while assembling a projection, including a
 *                 malformed path error
 *
 * @example
 *
 * ```typescript
 * const events = jpath(path => ({
 *
 *     id: path("$.id").find(isString),
 *     tags: path("$.tags[*]").filter(isString)
 *
 * }));
 * ```
 */
export function jpath<V>(mapper: (path: JPath) => V): Task<Value, V>;

/**
 * Creates a JSON path accessor or projector.
 */
export function jpath(mapper: (path: JPath) => unknown = path => path): unknown {

	return map((value: Value) => mapper(path => select(value, path)));

}
