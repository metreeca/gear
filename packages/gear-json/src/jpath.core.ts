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

import { isArray, isDefined, isObject, type Value } from "@metreeca/core"; // aliased, as the global is used
import { unescape } from "@metreeca/core/strings";


const DotPattern = "(?:^|\\.)(?<dot>\\w+)";
const NamePattern = "\\['(?<name>(?:[^']|\\\\.)*)']";
const IndexPattern = "\\[(?<index>\\d+)]";
const WildcardPattern = "(?:^|\\.)\\*|\\[\\*]";

const StepPattern = `(?:^\\$)?(?:(?:${DotPattern})|(?:${NamePattern})|(?:${IndexPattern})|(?:${WildcardPattern}))`;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Selects values from a JSON value.
 *
 * A path chains steps, each selecting from the values the preceding one selected and written straight after it, with
 * no separator beyond the leading `.` some steps carry:
 *
 * - `$` — `value` itself; allowed only as the leading step, where it may be omitted
 * - `.property` / `property` — object property
 * - `['property']` — object property, with JSON string escapes read leniently: an unaccounted escape stands for the
 *   character it introduces, so `\'` names an apostrophe
 * - `[0]` — array element by index
 * - `.*` / `[*]` — every element of an array or every property value of an object
 *
 * Arrays are entered only through an index or a wildcard step, so a path reaching the properties of the objects held
 * by an array must include an explicit `[*]` or `.*` step.
 *
 * Only values a JSON document may state are selected: `null` is selected as the value it states, while `undefined`,
 * which only a value assembled in code carries, is passed over exactly as an absent property is.
 *
 * @param value The value to select from
 * @param path  The selection path; an empty path or `$` selects `value` itself
 *
 * @returns An immutable list of the values selected by `path`, in document order; empty if `path` selects no value
 *
 * @throws {@link !SyntaxError SyntaxError} If `path` is malformed
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9535 RFC 9535 JSONPath Query Expressions for JSON}
 */
export function select(value: Value, path: string): readonly Value[] {

	return !path || path === "$" ? [value]
		: parse(path).reduce<readonly Value[]>(step, [value]);


	function parse(path: string): readonly RegExpExecArray[] {

		// sticky, so that steps match contiguously; global, as required by `matchAll`

		const steps = [...path.matchAll(new RegExp(StepPattern, "gy"))];

		// the scan stops at the first unmatched position, leaving the tail of the path uncovered

		const scanned = steps.reduce((length, step) => length + step[0].length, 0);

		if ( scanned !== path.length ) {
			throw new SyntaxError(`malformed path <${path}>`);
		}

		return steps;

	}

	function step(selection: readonly Value[], step: RegExpExecArray): readonly Value[] {

		const { dot, name, index } = step.groups ?? {};

		const property = dot ?? name;

		// `undefined` isn't a JSON value: a value assembled in code carries it where a parsed one cannot

		return (property !== undefined ? fields(selection, unescape(property))
			: index !== undefined ? items(selection, Number(index))
				: members(selection)).filter(isDefined);

	}

	function fields(selection: readonly Value[], key: string): readonly Value[] {

		return selection.flatMap(value => isObject(value) && key in value ? [value[key]] : []);

	}

	function items(selection: readonly Value[], position: number): readonly Value[] {

		return selection.flatMap(value => isArray<Value>(value) && position < value.length ? [value[position]] : []);

	}

	function members(selection: readonly Value[]): readonly Value[] {

		return selection.flatMap(value => isArray<Value>(value) || isObject(value) ? Object.values(value) : []);

	}


}
