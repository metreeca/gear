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

import { isFunction, type Value } from "@metreeca/core";
import { Task } from "@metreeca/flow";
import { map } from "@metreeca/flow/tasks";
import { select } from "./jpath.core.js";


/**
 * JSONPath-like selector over JSON values.
 *
 * Selects the values held by a fixed set of target JSON values, addressing them with a JSONPath-like syntax. The
 * target set is settled when the selector is created and cannot be changed afterwards.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9535 RFC 9535 JSONPath Query Expressions for JSON}
 */
export type JPath = {

	/**
	 * Selects values.
	 *
	 * A single selection reaches across the whole target set: the values retrieved from each target are merged into
	 * one list, sparing the caller a loop of its own.
	 *
	 * A path chains steps, each selecting from the values the preceding one selected and written straight after it,
	 * with no separator beyond the leading `.` some steps carry:
	 *
	 * - `$` — the target value itself; allowed only as the leading step, where it may be omitted
	 * - `.property` / `property` — object property
	 * - `['property']` — object property, with JSON string escapes read leniently: an unaccounted escape stands for
	 *   the character it introduces, so `\'` names an apostrophe
	 * - `[0]` — array element by index
	 * - `.*` / `[*]` — every element of an array or every property value of an object
	 *
	 * Arrays are entered only through an index or a wildcard step, so a path reaching the properties of the objects
	 * held by an array must include an explicit `[*]` or `.*` step.
	 *
	 * @param path The selection path; an empty path or `$` selects the target values unchanged
	 *
	 * @returns An immutable list of the values selected by `path`, ordered by target and, within each target, in
	 *          document order; empty if `path` selects no value
	 *
	 * @throws {@link !SyntaxError SyntaxError} If `path` is malformed
	 */
	(path: string): readonly Value[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a JSON path selector task.
 *
 * The generated task converts a feed of values into a feed of {@link JPath} selectors, one selector per value, so that
 * a consumer selects what a value holds by path rather than walking it.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each selector is emitted as soon as its value is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: values are drawn one at a time and none retained, so the length of the feed weighs on memory no
 * >   more than a single value does; a selector keeps the value it targets for as long as a consumer holds it.
 * > - **Stateless**: every value is targeted on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @returns A task converting a feed of values into a feed of path selectors
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing values
 *
 * @group Factories
 */
export function jpath(): Task<Value, JPath>; // without a mapper the selector is emitted as it is

/**
 * Creates a JSON path mapping task.
 *
 * The generated task converts a feed of values into a feed of mapped results, one result per value, so that a
 * consumer works on the shape it is after rather than on the one the source states.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each result is emitted as soon as its value is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: values are drawn one at a time and released as soon as their result is assembled, so the
 * >   length of the feed weighs on memory no more than a single value does.
 * > - **Stateless**: every value is mapped on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @typeParam V The type of the result mapped from each incoming value
 *
 * @param mapper The mapping function, applied to a {@link JPath} selector targeting the value being processed
 *
 * @returns A task converting a feed of values into a feed of mapped results
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing values, or
 *                              whatever `mapper` reports while mapping a value, including a {@link !SyntaxError
 *                              SyntaxError} for a malformed path
 *
 * @example
 *
 * ```typescript
 * const events = jpath(path => ({
 *
 *     id: path("$.id"),
 *     tags: path("$.tags[*]")
 *
 * }));
 * ```
 *
 * @group Factories
 */
export function jpath<V>(mapper: (path: JPath) => V): Task<Value, V>;

/**
 * Creates a JSON path selector over given values.
 *
 * Targets values already at hand, outside a feed, so that a consumer selecting from a value it holds does so exactly
 * as one selecting from a value drawn from a source.
 *
 * > [!IMPORTANT]
 * >
 * > A call with no value, spreading an empty list included, creates a task over a feed of values rather than a
 * > selector with an empty target set.
 *
 * @param values The target values, in the order they are to be selected from
 *
 * @returns An immutable selector targeting `values`
 *
 * @group Factories
 */
export function jpath(...values: readonly Value[]): JPath;

/**
 * Creates a JSON path selector.
 */
export function jpath(...args: readonly Value[] | readonly [mapper: (path: JPath) => unknown]): unknown {

	return isMapper(args) ? map((value: Value) => args[0](selector([value])))
		: args.length === 0 ? map((value: Value) => selector([value]))
			: selector(args);


	function isMapper(args: readonly unknown[]): args is readonly [mapper: (path: JPath) => unknown] {
		return isFunction(args[0]);
	}

	function selector(values: readonly Value[]): JPath {
		return Object.freeze((path: string) => values.flatMap(value => select(value, path)));
	}

}
