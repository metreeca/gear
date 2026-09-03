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

/**
 * JSON processing tasks.
 *
 * Parses JSON payloads, addresses the values they hold by path, and narrows those values to the types a consumer
 * expects.
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8259 RFC 8259 JSON Data Interchange Format}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9535 RFC 9535 JSONPath Query Expressions for JSON}
 */

import { assert, isBoolean, isNumber, isString, type Value } from "@metreeca/core";
import { type IRI, isIRI } from "@metreeca/core/resource";

export * from "./json.js";
export * from "./jpath.js";


/**
 * Narrows a JSON value to a boolean.
 *
 * @param value The value to narrow
 *
 * @returns `value`, unchanged, typed as a boolean
 *
 * @throws {@link !TypeError TypeError} If `value` is not a boolean
 */
export function boolean(value: Value): boolean {
	return assert(value, isBoolean);
}

/**
 * Narrows a JSON value to a number.
 *
 * @param value The value to narrow
 *
 * @returns `value`, unchanged, typed as a number
 *
 * @throws {@link !TypeError TypeError} If `value` is not a number
 */
export function number(value: Value): number {
	return assert(value, isNumber);
}

/**
 * Narrows a JSON value to a string.
 *
 * @param value The value to narrow
 *
 * @returns `value`, unchanged, typed as a string
 *
 * @throws {@link !TypeError TypeError} If `value` is not a string
 */
export function string(value: Value): string {
	return assert(value, isString);
}

/**
 * Narrows a JSON value to a link.
 *
 * Accepts a relative reference as well as an absolute IRI, leaving resolution against a base to the consumer.
 *
 * @param value The value to narrow
 *
 * @returns `value`, unchanged, typed as an IRI
 *
 * @throws {@link !TypeError TypeError} If `value` is not a string holding an IRI or a relative reference
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3987 RFC 3987 Internationalized Resource Identifiers}
 */
export function link(value: Value): IRI {
	return assert(value, isIRI);
}
