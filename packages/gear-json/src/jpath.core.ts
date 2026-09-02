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


const DOT = "(?:^|\\.)(?<dot>\\w+)";
const NAME = "\\['(?<name>(?:[^']|\\\\.)*)']";
const INDEX = "\\[(?<index>\\d+)]";
const WILDCARD = "(?:^|\\.)\\*|\\[\\*]";

// sticky, so that each step is matched at the current position, while `^` still anchors at the start of the whole path

const STEP = new RegExp(`(?:^\\$)?(?:(?:${DOT})|(?:${NAME})|(?:${INDEX})|(?:${WILDCARD}))`, "y");


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
 * A leading `$` denotes the root value and may be omitted.
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

	if ( !path || path === "$" ) {

		return [value];

	} else {

		return walk([value], 0);

	}


	function walk(selection: readonly Value[], from: number): readonly Value[] {

		STEP.lastIndex = from;

		const step = STEP.exec(path);

		if ( !step ) {

			throw new Error(`malformed path <${path}>`);

		} else {

			const { dot, name, index } = step.groups ?? {};

			const to = STEP.lastIndex;

			const selected = dot !== undefined ? selection.flatMap(v => field(v, unescape(dot)))
				: name !== undefined ? selection.flatMap(v => field(v, unescape(name)))
					: index !== undefined ? selection.flatMap(v => item(v, Number(index)))
						: selection.flatMap(entries);

			return to < path.length ? walk(selected, to) : selected;

		}

	}


	function field(value: Value, name: string): readonly Value[] {

		return isObject(value) && name in value ? [value[name]] : [];

	}

	function item(value: Value, index: number): readonly Value[] {

		return isArray<Value>(value) && index < value.length ? [value[index]] : [];

	}

	function entries(value: Value): readonly Value[] {

		return isArray<Value>(value) || isObject(value) ? Object.values(value) : [];

	}

}
