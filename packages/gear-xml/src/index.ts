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
 * XML and HTML processing tasks.
 *
 * Parses XML and HTML payloads, addresses the nodes they hold by XPath expression, and reads the selected values as
 * the types a consumer expects.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/xml/ Extensible Markup Language (XML) 1.0}
 * @see {@link https://html.spec.whatwg.org/multipage/ WHATWG HTML Living Standard}
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/ XML Path Language (XPath) 1.0}
 */

import { assert, isBoolean, isNumber } from "@metreeca/core";
import { type IRI, isIRI } from "@metreeca/core/resource";
import { tidy } from "@metreeca/core/strings";
import { base, content, type Target } from "./xpath.core.js";

export * from "./xml.js";
export * from "./html.js";
export * from "./xpath.js";
export * from "./focus.js";
export * from "./untag.js";


/**
 * Reads a selected value as a boolean.
 *
 * Accepts the two forms XPath itself writes a boolean in, so that a boolean an expression computed is read back
 * unchanged and anything else is refused rather than guessed at.
 *
 * @param node The {@link Target} to read, either a node a selection reached or a value an expression computed
 *
 * @returns `true` if the text `node` is written as is `true`; `false` if it is `false`
 *
 * @throws {@link !TypeError TypeError} If the text `node` is written as is neither `true` nor `false`
 */
export function boolean(node: Target): boolean {

	const text = string(node);

	return assert(text === "true" ? true : text === "false" ? false : undefined, isBoolean);

}

/**
 * Reads a selected value as a number.
 *
 * A value holding no text names no number, rather than standing for zero, so that a missing figure is refused rather
 * than passed downstream as a plausible one.
 *
 * @param node The {@link Target} to read, either a node a selection reached or a value an expression computed
 *
 * @returns The number the text `node` is written as names
 *
 * @throws {@link !TypeError TypeError} If the text `node` is written as doesn't name a finite number
 */
export function number(node: Target): number {

	const text = string(node);

	return assert(text ? Number(text) : NaN, isNumber); // empty text reads as 0, which a node holding none doesn't name

}

/**
 * Reads a selected value as text.
 *
 * Takes the text a value is written as, as the XPath `string()` function converts it: the value of an attribute, the
 * character data held by the tree rooted at any other node, the comments within it contributing none, and the written
 * form of a computed string, number or boolean.
 *
 * @param node The {@link Target} to read, either a node a selection reached or a value an expression computed
 *
 * @returns The text `node` is written as, with every run of whitespace replaced by a single space and the outer
 *          whitespace dropped, so that content laid out across several lines reads as the evenly spaced text a label
 *          expects
 *
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/#function-string XML Path Language (XPath) 1.0 - string()}
 */
export function string(node: Target): string {
	return tidy(content(node));
}

/**
 * Reads a selected value as a link.
 *
 * Resolves the reference against the base URL in scope where it was drawn from, as the {@link xml} and {@link html}
 * parsers record it, so that a consumer works on an absolute IRI however deeply the reference sat in the document it
 * came from. A tree stating no base URL, as one parsed from text under no stated base does, leaves the reference as it
 * stands, as does a value an expression computed.
 *
 * @param node The {@link Target} to read, either a node a selection reached or a value an expression computed
 *
 * @returns The IRI the text `node` is written as names, resolved against the base URL in scope of `node` where the
 *          tree states one
 *
 * @throws {@link !TypeError TypeError} If the text `node` is written as names neither an IRI nor a relative reference
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3987 RFC 3987 Internationalized Resource Identifiers}
 * @see {@link https://www.w3.org/TR/xmlbase/ XML Base}
 */
export function link(node: Target): IRI {

	const reference = string(node);
	const url = base(node);

	return assert(url === undefined ? reference : resolved(url), isIRI);


	function resolved(url: URL): string {

		try {

			return new URL(reference, url).href;

		} catch { // a malformed reference is reported as it stands // !!! review leniency

			return reference;

		}

	}

}
