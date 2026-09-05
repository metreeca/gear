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

import { isFunction } from "@metreeca/core";
import type { Task } from "@metreeca/flow";
import { map } from "@metreeca/flow/tasks";
import type { AnyNode } from "domhandler";
import { select, type Target } from "./xpath.core.js";

export type { Attribute, Target } from "./xpath.core.js";


/**
 * XPath selector over parsed X/HTML trees.
 *
 * Selects the values held by a fixed set of {@link Target} nodes, addressing them with XPath 1.0 expressions. The
 * target set is settled when the selector is created and cannot be changed afterwards.
 *
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/ XML Path Language (XPath) 1.0}
 */
export type XPath = {

	/**
	 * Selects values.
	 *
	 * A single selection reaches across the whole target set: the values retrieved from each target are merged into one
	 * list, sparing the caller a loop of its own. Every axis, node test, predicate, operator and core function XPath
	 * 1.0 defines is available, each target taken in its turn as the context node.
	 *
	 * An expression computing a string, a number or a boolean, `count(//item)` among them, reports the value it
	 * computed for each target, so that whatever the language can express is reached the same way. A value an
	 * expression computed holds no tree of its own, and so selects nothing in its turn.
	 *
	 * Names are matched as the tree holds them, case sensitively, prefixes compared as written and no `xmlns`
	 * declaration read, so that a single set of expressions serves both the XML trees and the HTML ones, whose names
	 * are folded to lower case as they are parsed:
	 *
	 * - an unprefixed name test matches an unprefixed name alone, so `item` addresses `<item>` however the document
	 *   declares a default namespace, and leaves `<d:item>` out
	 * - a prefixed name test matches the prefix as written, so `d:b` addresses `<d:b>` whatever URI the document binds
	 *   `d` to, and nothing at all where the same element is written under another prefix
	 * - `local-name()` reports a name without its prefix and `name()` reports it whole, so `<d:b>` answers to
	 *   `local-name()='b'` and to `name()='d:b'` alike
	 * - `namespace-uri()` reports the prefix a name carries rather than the URI a declaration binds it to, as no
	 *   declaration is read; the `xml` prefix is the exception, bound by definition, so `@xml:base` and `lang()` read
	 *   what they are meant to
	 * - the `xmlns` declarations themselves are ordinary attributes, reported by an attribute step like any other
	 *
	 * The XML declaration and the document type declaration are not nodes, as the language prescribes, and a processing
	 * instruction is not one either, so `processing-instruction()` selects nothing; `namespace::` selects nothing in
	 * its turn, as no namespace node is held. A `CDATA` section is a text node holding what it wraps, rather than a
	 * node of its own.
	 *
	 * @param path The selection expression
	 *
	 * @returns An immutable list of the values selected by `path`, ordered by target and, within each target, in
	 *          document order, each node reported once; empty if `path` selects no value
	 *
	 * @throws {@link !SyntaxError SyntaxError} If `path` is malformed
	 */
	(path: string): readonly Target[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an XPath selector task.
 *
 * The generated task converts a feed of parsed X/HTML trees into a feed of {@link XPath} selectors, one selector per
 * tree, so that a consumer addresses what a tree holds by expression rather than walking it.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each selector is emitted as soon as its tree is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: trees are drawn one at a time and none retained, so the length of the feed weighs on memory no
 * >   more than a single tree does; a selector keeps the tree it targets for as long as a consumer holds it.
 * > - **Stateless**: every tree is targeted on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @returns A task converting a feed of parsed X/HTML trees into a feed of XPath selectors
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing trees
 *
 * @group Factories
 */
export function xpath(): Task<AnyNode, XPath>; // without a mapper the selector is emitted as it is

/**
 * Creates an XPath mapping task.
 *
 * The generated task converts a feed of parsed X/HTML trees into a feed of mapped results, one result per tree, so that
 * a consumer works on the shape it is after rather than on the one the markup states.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each result is emitted as soon as its tree is drawn, so the feed produced runs dry as the feed
 * >   drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: trees are drawn one at a time and released as soon as their result is assembled, so the length of
 * >   the feed weighs on memory no more than a single tree does.
 * > - **Stateless**: every tree is mapped on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @typeParam V The type of the result mapped from each incoming tree
 *
 * @param mapper The mapping function, applied to an {@link XPath} selector targeting the tree being processed
 *
 * @returns A task converting a feed of parsed X/HTML trees into a feed of mapped results
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing trees, or
 *                              whatever `mapper` reports while mapping a tree, including a {@link !SyntaxError
 *                              SyntaxError} for a malformed expression
 *
 * @example
 *
 * ```typescript
 * const events = xpath(path => ({
 *
 *     title: path("//h1").map(string),
 *     links: path("//a/@href").map(link)
 *
 * }));
 * ```
 *
 * @group Factories
 */
export function xpath<V>(mapper: (path: XPath) => V): Task<AnyNode, V>;

/**
 * Creates an XPath selector over given nodes.
 *
 * Targets nodes already at hand, outside a feed, so that a consumer addressing a node it holds does so exactly as one
 * addressing a tree drawn from a source.
 *
 * > [!IMPORTANT]
 * >
 * > A call with no node, spreading an empty list included, creates a task over a feed of trees rather than a selector
 * > with an empty target set.
 *
 * @param nodes The target nodes, in the order they are to be selected from
 *
 * @returns An immutable selector targeting `nodes`
 *
 * @group Factories
 */
export function xpath(...nodes: readonly Target[]): XPath;

/**
 * Creates an XPath selector.
 */
export function xpath(...args: readonly Target[] | readonly [mapper: (path: XPath) => unknown]): unknown {

	return isMapper(args) ? map((node: AnyNode) => args[0](selector([ node ])))
		: args.length === 0 ? map((node: AnyNode) => selector([ node ]))
			: selector(args);


	function isMapper(args: readonly unknown[]): args is readonly [mapper: (path: XPath) => unknown] {
		return isFunction(args[0]);
	}

	function selector(nodes: readonly Target[]): XPath {
		return Object.freeze((path: string) => nodes.flatMap(node => select(node, path)));
	}

}
