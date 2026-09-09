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

import type { IRI } from "@metreeca/core/resource";
import { parseItem } from "@metreeca/http";
import { log } from "@metreeca/tape";
import type { AnyNode, Document } from "domhandler";
import { isTag } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";
import { isBase } from "./index.core.js";


/**
 * The media types an HTML document is served under.
 *
 * Matches the `text/html` HTML is served under and the `application/xhtml+xml` its XML serialisation is served under,
 * both read by the same forgiving parser.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.3 RFC 9110 § 8.3 - Content-Type}
 */
const HTMLType = /^(?:text\/html|application\/xhtml\+xml)$/i;

/**
 * The charset declaration opening an HTML document.
 *
 * Matches the `charset` parameter of a `meta` element, stated either on its own or inside the `content` field of a
 * `Content-Type` declaration, so that a document stating its own encoding is read under it.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/semantics.html#charset WHATWG HTML - Specifying the document
 * character encoding}
 */
const HTMLCharset = /<meta[^>]+\bcharset\s*=\s*["']?\s*([-\w]+)/i;

/**
 * The number of opening bytes a charset declaration is looked for in.
 *
 * States the limit the HTML encoding sniffing algorithm sets, so that a declaration buried further down is ignored as
 * browsers ignore it.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/parsing.html#prescan-a-byte-stream-to-determine-its-encoding
 * WHATWG HTML - Prescan a byte stream to determine its encoding}
 */
const HTMLPrescan = 1024;

/**
 * The elements opening a foreign content subtree.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign WHATWG HTML - Parsing tokens
 * in foreign content}
 */
const ForeignRoots = new Set(["svg", "math"]);

/**
 * The elements holding HTML content inside a foreign content subtree.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/parsing.html#html-integration-point WHATWG HTML - HTML integration
 * point}
 */
const ForeignHosts = new Set(["foreignObject", "desc", "title", "annotation-xml", "mi", "mo", "mn", "ms", "mtext"]);

/**
 * The camelCase attribute names SVG and MathML define, keyed by the folded form HTML parsing produces.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/parsing.html#adjust-svg-attributes WHATWG HTML - Adjust SVG
 * attributes}
 * @see {@link https://html.spec.whatwg.org/multipage/parsing.html#adjust-mathml-attributes WHATWG HTML - Adjust MathML
 * attributes}
 */
const ForeignAttributes = new Map([

	["attributename", "attributeName"],
	["attributetype", "attributeType"],
	["basefrequency", "baseFrequency"],
	["baseprofile", "baseProfile"],
	["calcmode", "calcMode"],
	["clippathunits", "clipPathUnits"],
	["definitionurl", "definitionURL"],
	["diffuseconstant", "diffuseConstant"],
	["edgemode", "edgeMode"],
	["filterunits", "filterUnits"],
	["glyphref", "glyphRef"],
	["gradienttransform", "gradientTransform"],
	["gradientunits", "gradientUnits"],
	["kernelmatrix", "kernelMatrix"],
	["kernelunitlength", "kernelUnitLength"],
	["keypoints", "keyPoints"],
	["keysplines", "keySplines"],
	["keytimes", "keyTimes"],
	["lengthadjust", "lengthAdjust"],
	["limitingconeangle", "limitingConeAngle"],
	["markerheight", "markerHeight"],
	["markerunits", "markerUnits"],
	["markerwidth", "markerWidth"],
	["maskcontentunits", "maskContentUnits"],
	["maskunits", "maskUnits"],
	["numoctaves", "numOctaves"],
	["pathlength", "pathLength"],
	["patterncontentunits", "patternContentUnits"],
	["patterntransform", "patternTransform"],
	["patternunits", "patternUnits"],
	["pointsatx", "pointsAtX"],
	["pointsaty", "pointsAtY"],
	["pointsatz", "pointsAtZ"],
	["preservealpha", "preserveAlpha"],
	["preserveaspectratio", "preserveAspectRatio"],
	["primitiveunits", "primitiveUnits"],
	["refx", "refX"],
	["refy", "refY"],
	["repeatcount", "repeatCount"],
	["repeatdur", "repeatDur"],
	["requiredextensions", "requiredExtensions"],
	["requiredfeatures", "requiredFeatures"],
	["specularconstant", "specularConstant"],
	["specularexponent", "specularExponent"],
	["spreadmethod", "spreadMethod"],
	["startoffset", "startOffset"],
	["stddeviation", "stdDeviation"],
	["stitchtiles", "stitchTiles"],
	["surfacescale", "surfaceScale"],
	["systemlanguage", "systemLanguage"],
	["tablevalues", "tableValues"],
	["targetx", "targetX"],
	["targety", "targetY"],
	["textlength", "textLength"],
	["viewbox", "viewBox"],
	["viewtarget", "viewTarget"],
	["xchannelselector", "xChannelSelector"],
	["ychannelselector", "yChannelSelector"],
	["zoomandpan", "zoomAndPan"]

]);


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Parses an HTML document.
 *
 * Helper backing the `html()` task, which states the parsing contract.
 */
export async function process(document: string | Response, base?: IRI): Promise<undefined | Document> {

	const text = (document instanceof Response ? await read(document) : document).trim();

	// a document holding nothing but whitespace, a byte order mark included, holds no content

	return text ? rebase(adjust(parseDocument(text)), locate(document, base)) : undefined;


	async function read(response: Response): Promise<string> {

		const [type, parameters] = parseItem(response.headers.get("Content-Type"));

		if ( type && !HTMLType.test(type) ) {
			logger.warn`unexpected <${type}> content type`;
		}

		const bytes = await response.arrayBuffer();

		return convert(bytes, parameters.get("charset") || declared(bytes) || "UTF-8");

	}

	function convert(bytes: ArrayBuffer, charset: string): string {

		const decoder = decode(charset);

		if ( decoder === undefined ) {
			logger.warn`unknown <${charset}> charset`;
		}

		return (decoder ?? new TextDecoder()).decode(bytes);

	}

	function declared(bytes: ArrayBuffer): undefined | string {

		// read as windows-1252, so that the opening bytes are scanned whatever the document is actually encoded in:
		// the charsets HTML is served under are ASCII compatible, so the declaration survives the mismatch

		const prescan = new TextDecoder("windows-1252").decode(bytes.slice(0, HTMLPrescan));

		return HTMLCharset.exec(prescan)?.[1];

	}

	function decode(charset: string): undefined | TextDecoder {

		try {

			return new TextDecoder(charset);

		} catch {

			return undefined;

		}

	}

	function adjust(document: Document): Document {

		// the parser restores the element names SVG and MathML define, but not their attribute names: the folded form
		// is renamed inside foreign subtrees, leaving the HTML content hosted by an integration point untouched

		restore(document.children, false);

		return document;

	}

	function restore(nodes: readonly AnyNode[], foreign: boolean): void {

		nodes.filter(isTag).forEach(element => {

			const own = foreign || ForeignRoots.has(element.name);

			if ( own ) {
				element.attribs = Object.fromEntries(Object.entries(element.attribs)
					.map(([name, value]): [string, string] => [ForeignAttributes.get(name) ?? name, value])
				);
			}

			// an integration point states its own name in the foreign language, but holds HTML content

			restore(element.children, own && !ForeignHosts.has(element.name));

		});

	}

	function locate(document: string | Response, base: undefined | IRI): undefined | URL {

		// a stated base is taken as it stands, so the retrieval URL never stands in as the one to resolve it against

		if ( base !== undefined ) {

			if ( !isBase(base) ) {
				throw new RangeError(`expected resolvable base URL <${base}>`);
			}

			return new URL(base);

		} else {

			return document instanceof Response && document.url ? new URL(document.url) : undefined;

		}

	}

	function rebase(document: Document, base: undefined | URL): Document {

		const target = resolve(document, base);

		if ( target === undefined ) {

			return document;

		} else {

			document.children.filter(isTag).forEach(root => {
				root.attribs["xml:base"] = new URL(root.attribs["xml:base"] ?? "", target).href;
			});

			return document;

		}

	}

	function resolve(document: Document, base: undefined | URL): undefined | URL {

		const href = DomUtils.findOne(
			element => element.name === "base" && element.attribs["href"] !== undefined,
			document.children,
			true
		)?.attribs["href"];

		// a base the document states is resolved against the retrieval URL, as the standard prescribes; one that
		// cannot be resolved on its own, a relative reference in a document given as text among them, is left out

		return href === undefined ? base : absolute(href, base) ?? base;

	}

	function absolute(href: string, base: undefined | URL): undefined | URL {

		try {

			return new URL(href, base);

		} catch {

			return undefined;

		}

	}

}
