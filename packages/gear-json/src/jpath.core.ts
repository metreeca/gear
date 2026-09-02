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

import { isArray, isObject, type Value } from "@metreeca/core"; // aliased, as the global is used
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
 * Supported path syntax:
 *
 * - `.property` / `property` — object property
 * - `['property']` — object property, with JSON string escapes
 * - `[0]` — array element by index
 * - `.*` / `[*]` — every element of an array or every property value of an object
 *
 * A leading `$` denotes the whole value and may be omitted.
 *
 * A quoted property name carries the escapes a JSON string may carry, read back leniently, so a sequence the syntax
 * doesn't account for stands for the character it introduces and `\'` names an apostrophe.
 *
 * Every step addresses the value it is applied to: arrays are entered only through an index or a wildcard step, so a
 * path reaching the properties of the objects held by an array must include an explicit `[*]` or `.*` step.
 *
 * @param value The value to select from
 * @param path  The selection path; an empty path or `$` selects `value` itself
 *
 * @returns An immutable list of the values addressed by `path`, in document order; empty if no value is addressed
 *
 * @throws {Error} If `path` is malformed
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
			throw new Error(`malformed path <${path}>`);
		}

		return steps;

	}

	function step(selection: readonly Value[], step: RegExpExecArray): readonly Value[] {

		const { dot, name, index } = step.groups ?? {};

		const property = dot ?? name;

		return property !== undefined ? fields(selection, unescape(property))
			: index !== undefined ? items(selection, Number(index))
				: members(selection);

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
