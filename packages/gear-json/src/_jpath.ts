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

import { isNumber, isString, type Optional, type Value } from "@metreeca/core";
import { Task } from "@metreeca/flow";


const task: Task<Value, {

	value?: string;
	array: readonly number[]

}> = jpath(path => ({

	value: optional(path("json path").filter(isString).map(v => v.toUpperCase())),
	array: multiple((path("json path").filter(isNumber).map(v => 2*v)))

}));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type JPath = {

	(path: string): readonly Value[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function jpath(): Task<Value, JPath>; // without a mapper the accessor is reported as it is
function jpath<V>(mapper: (path: JPath) => V): Task<Value, V>;

function jpath(mapper: (path: JPath) => unknown = path => path): unknown {

	throw new Error(";( to be implemented"); // !!!

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function required<V>(values: readonly V[]): Optional<V> {
	throw new Error(";( to be implemented"); // !!!
}

function optional<V>(values: readonly V[]): Optional<V> {
	throw new Error(";( to be implemented"); // !!!
}

function multiple<V>(values: readonly V[]): ReadonlyArray<V> {
	throw new Error(";( to be implemented"); // !!!
}
