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


import { assert } from "@metreeca/core";
import type { IRI } from "@metreeca/core/resource";

// !!! boolean/number/string/object/array
// !!! optional/required/multiple

export interface JPath {

	get(path: string): JPath;

	split(): readonly JPath[];

	boolean(): readonly boolean[];

	number(): readonly number[];

	string(): readonly string[];

	iri(): readonly IRI[];

}


function required<V>(values: readonly V[]): V {
	return assert(values, values => values.length === 1, "expected exactly one value")[0];
}

function optional<V>(values: readonly V[]): undefined | V {
	return assert(values, values => values.length <= 1, "expected at most one value").at(0);
}

function multiple<V>(values: readonly V[]): readonly V[] {
	return values;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const o = (json: JPath) => {

	return ({

		x: optional(json.get("path").string().map(v => v.toLowerCase()))

	});

};
