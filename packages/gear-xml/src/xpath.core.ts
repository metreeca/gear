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

import type { AnyNode, ChildNode, Element, ParentNode } from "domhandler";
import { hasChildren, isCDATA, isComment, isDirective, isDocument, isTag, isText } from "domhandler";
import { type Adapter, createEvaluator, type Resolver, type Result, XPathResult } from "xpathway";


/**
 * A value an expression is evaluated against or reports.
 *
 * Covers the four value types XPath 1.0 defines: the nodes a parsed tree holds, the attributes a selection reaches, and
 * the strings, numbers and booleans an expression computes. Whatever a selection reports is thus the target of a
 * further selection in its turn, a computed value selecting nothing, as one holds no tree to select from.
 *
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/#section-Introduction XML Path Language (XPath) 1.0 -
 * Introduction}
 */
export type Target = AnyNode | Attribute | string | number | boolean;

/**
 * A node a tree holds, or an attribute of one.
 */
type Node = AnyNode | Attribute;

/**
 * An attribute of an element, as a node.
 *
 * Selected by an attribute step and usable as the target of a further selection, so that an attribute is addressed
 * exactly as an element is. The same attribute of the same element is always handed over as the same object, so that a
 * selection reaching it twice reports it once.
 */
export type Attribute = {

	/**
	 * The name of the attribute, as the tree holds it, prefix included.
	 */
	readonly name: string;

	/**
	 * The value of the attribute.
	 */
	readonly value: string;

	/**
	 * The element stating the attribute.
	 */
	readonly parent: Element;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The namespace the `xml` prefix stands for, bound by definition rather than by declaration.
 */
const XMLNamespace = "http://www.w3.org/XML/1998/namespace";

/**
 * The attribute recording the URL relative references resolve against.
 */
const XMLBase = "xml:base";


/**
 * The attributes projected for an element.
 *
 * Attributes are held by a tree as a plain record rather than as nodes, so a node-set holding one holds a handle
 * projected for it; projecting a fresh handle on every step would break the identity a selection is deduplicated and
 * ordered by, so the handles of an element are projected once and kept.
 */
const handles = new WeakMap<Element, readonly Attribute[]>();

/**
 * The children a node states, less the directives.
 *
 * Kept alongside the handles, and for the same reason: a step reads the children of a node many times over, and a tree
 * is not modified while it is selected from.
 */
const contents = new WeakMap<ParentNode, readonly ChildNode[]>();

/**
 * Binds every prefix to itself, so that a prefixed name test is matched as the tree holds it.
 */
const resolver: Resolver = { lookupNamespaceURI: prefix => prefix };


/**
 * Reports a parsed tree to the engine, which imports no node type of its own.
 */
const adapter: Adapter<Node> = {

	nodeType: node => isAttribute(node) ? 2
		: isTag(node) ? 1
			: isText(node) || isCDATA(node) ? 3
				: isComment(node) ? 8
					: isDocument(node) ? 9
						: 0, // a directive, reachable only as the node a selection is evaluated against

	parent: node => node.parent,

	childNodes: node => isAttribute(node) ? [] : stated(node),

	ownerDocument: node => owner(node),

	localName: node => local(qualified(node)),

	namespaceURI: node => namespace(prefixed(qualified(node))),

	nodeName: node => qualified(node),

	attributes: node => isAttribute(node) ? [] : isTag(node) ? projected(node) : [],

	getAttribute: (node, uri, name) => isAttribute(node) || !isTag(node) ? null
		: node.attribs[qualify(uri, name)] ?? null,

	stringValue: node => content(node),

	compareDocumentPosition: (x, y) => order(x, y),

	getElementById: (root, id) => isAttribute(root) ? null : identified(root, id) ?? null,

	isHtmlDocument: () => false, // names are matched as the tree holds them, whatever the format

	nextSibling: node => isAttribute(node) ? null : following(node),

	previousSibling: node => isAttribute(node) ? null : preceding(node)

};

/**
 * Parses every expression once and keeps it, so that an expression repeated across the nodes of a feed is read as a
 * lookup rather than as a parse.
 */
const evaluator = createEvaluator(adapter);


function kept<K extends WeakKey, V>(cache: WeakMap<K, V>, key: K, project: (key: K) => V): V {

	const cached = cache.get(key);

	if ( cached === undefined ) {

		const value = project(key);

		cache.set(key, value);

		return value;

	} else {

		return cached;

	}

}

function stated(node: AnyNode): readonly ChildNode[] {

	// a CDATA section stands for the text it wraps, whose nodes the tree doesn't hold; the XML declaration, the
	// document type declaration and the processing instructions are no nodes

	return isCDATA(node) || !hasChildren(node) ? []
		: kept(contents, node, parent => parent.children.filter(child => !isDirective(child)));

}

function projected(element: Element): readonly Attribute[] {
	return kept(handles, element, stating => Object.entries(stating.attribs)
		.map(([ name, value ]) => Object.freeze({ name, value, parent: stating }))
	);
}

function following(node: AnyNode): null | ChildNode {

	const next = node.next;

	return next === null ? null : isDirective(next) ? following(next) : next;

}

function preceding(node: AnyNode): null | ChildNode {

	const previous = node.prev;

	return previous === null ? null : isDirective(previous) ? preceding(previous) : previous;

}

function outermost(node: Node): Node {
	return node.parent === null ? node : outermost(node.parent);
}

function owner(node: Node): null | Node {

	const root = outermost(node);

	return !isAttribute(root) && isDocument(root) ? root : null;

}

function identified(node: AnyNode, id: string): undefined | Element {

	return stated(node).filter(isTag).reduce<undefined | Element>((found, element) =>
			found ?? (element.attribs["id"] === id ? element : identified(element, id)),
		undefined
	);

}

function qualified(node: Node): string {
	return isAttribute(node) || isTag(node) ? node.name : "";
}

function local(name: string): string {
	return name.slice(name.lastIndexOf(":") + 1);
}

function prefixed(name: string): undefined | string {

	const colon = name.lastIndexOf(":");

	return colon < 0 ? undefined : name.slice(0, colon);

}

function namespace(prefix: undefined | string): null | string {
	return prefix === undefined ? null : prefix === "xml" ? XMLNamespace : prefix;
}

function qualify(namespace: null | string, name: string): string {
	return namespace === null ? name
		: namespace === XMLNamespace ? `xml:${name}`
			: `${namespace}:${name}`;
}

function text(node: ParentNode): string {
	return node.children
		.map(child => isText(child) ? child.data : hasChildren(child) ? text(child) : "")
		.join("");
}

function order(x: Node, y: Node): number {

	return compare(chain(x), chain(y));


	function chain(node: Node): readonly Node[] {
		return node.parent === null ? [ node ] : [ ...chain(node.parent), node ];
	}

	function compare(xs: readonly Node[], ys: readonly Node[]): number {

		const [ x, ...xt ] = xs;
		const [ y, ...yt ] = ys;

		return x === undefined || y === undefined ? xs.length - ys.length // one node holds the other
			: x === y ? compare(xt, yt)
				: position(x) - position(y);

	}

	function position(node: Node): number {

		if ( isAttribute(node) ) {

			// attributes precede the children of their element, in the order the element states them

			const attributes = projected(node.parent);

			return attributes.indexOf(node) - attributes.length;

		} else if ( node.parent === null ) {

			return 0; // a root, or a node of a tree the other node doesn't belong to

		} else {

			return stated(node.parent).indexOf(node);

		}

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a node.
 *
 * @param value The value to check
 *
 * @returns `true` if `value` is a node held by a tree, or an attribute of one; `false` if it is a value an expression
 *          computed
 */
export function isNode(value: Target): value is Node {
	return typeof value === "object";
}

/**
 * Checks whether a value is an attribute.
 *
 * @param value The value to check
 *
 * @returns `true` if `value` is an attribute of an element; `false` otherwise
 */
export function isAttribute(value: Target): value is Attribute {
	return isNode(value) && "value" in value; // no node a tree holds carries a value of its own
}

/**
 * Checks whether a value is an element.
 *
 * @param value The value to check
 *
 * @returns `true` if `value` is an element; `false` otherwise
 */
export function isElement(value: Target): value is Element {
	return isNode(value) && !isAttribute(value) && isTag(value);
}

/**
 * Reads the text a value holds.
 *
 * @param value The value to read
 *
 * @returns The text `value` is written as, as the XPath `string()` function converts it: the value of an attribute, the
 *          text a comment carries, the character data held by the tree rooted at any other node, the comments and
 *          directives within it contributing none, and the written form of a computed string, number or boolean
 *
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/#function-string XML Path Language (XPath) 1.0 - string()}
 */
export function content(value: Target): string {
	return !isNode(value) ? String(value)
		: isAttribute(value) ? value.value
			: isText(value) || isComment(value) ? value.data
				: hasChildren(value) ? text(value)
					: "";
}

/**
 * Draws the URL the relative references held by a value resolve against.
 *
 * Reads the base URL a tree records as it is parsed, so that a reference is resolved by the standard rules wherever it
 * sits in the tree, without the request the tree was drawn from being tracked alongside it.
 *
 * The base is the one stated by the nearest `xml:base` attribute in scope of the value, that is on the value itself, if
 * it is an element, or on its closest ancestor stating one, each value resolved against the ones stated further up. A
 * tree that states none, as one parsed from text under no stated base does, and one whose outermost `xml:base` is
 * itself a relative reference state no base, as does a value an expression computed, which holds no tree.
 *
 * @param value The value whose base URL is to be drawn
 *
 * @returns The absolute URL relative references held by `value` resolve against; `undefined` if the tree holding
 *          `value` states none
 *
 * @see {@link https://www.w3.org/TR/xmlbase/ XML Base}
 */
export function base(value: Target): undefined | URL {

	return isNode(value)
		? scoped(value).reduce<undefined | URL>((base, stated) => located(stated, base), undefined)
		: undefined;


	function scoped(node: Node): readonly string[] {

		const outer = node.parent === null ? [] : scoped(node.parent);
		const stated = isElement(node) ? node.attribs[XMLBase] : undefined;

		return stated === undefined ? outer : [ ...outer, stated ];

	}

	function located(value: string, base: undefined | URL): undefined | URL {

		try {

			return new URL(value, base);

		} catch { // a relative reference resolving against no base locates nothing

			return undefined;

		}

	}

}

/**
 * Selects values from a value.
 *
 * Helper backing the `XPath` selector, which states the selection contract.
 */
export function select(value: Target, path: string): readonly Target[] {

	if ( !isNode(value) ) {

		return []; // a computed value holds no tree to select from

	} else {

		const selection = evaluator.evaluate(path, value, resolver);

		return selection.resultType === XPathResult.NUMBER_TYPE ? [ selection.numberValue ]
			: selection.resultType === XPathResult.STRING_TYPE ? [ selection.stringValue ]
				: selection.resultType === XPathResult.BOOLEAN_TYPE ? [ selection.booleanValue ]
					: [ ...drawn(selection) ];

	}


	/**
	 * Draws the nodes of a selection.
	 *
	 * The engine reports a set of nodes as a cursor stating no length, so they are drawn one at a time; recursion would
	 * grow the stack with the size of the set, which a page places no bound on.
	 */
	function* drawn(selection: Result<Node>): Generator<Node> {
		for ( let node = selection.iterateNext(); node !== null; node = selection.iterateNext() ) {
			yield node;
		}
	}

}
