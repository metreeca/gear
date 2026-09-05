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
 * XPath 1.0 evaluation over a caller-supplied tree.
 *
 * Types the engine expressions are evaluated with, which publishes no declarations of its own: an evaluator is bound to
 * an {@link Adapter} reading whatever structure a parser produced, and the nodes handed over to it reach every result
 * as they are, so that a selection is typed end to end without a cast.
 *
 * These declarations stand only until the engine ships its own, and are dropped as it does.
 *
 * @see {@link https://www.w3.org/TR/1999/REC-xpath-19991116/ XML Path Language (XPath) 1.0}
 * @see {@link https://github.com/ursm/xpathway/issues/5 xpathway - Ship TypeScript declarations}
 */
declare module "xpathway" {

	export type Adapter<N> = {

		nodeType(node: N): number;

		parent(node: N): null | N;
		childNodes(node: N): readonly N[];
		ownerDocument(node: N): null | N;

		localName(node: N): string;
		namespaceURI(node: N): null | string;
		nodeName(node: N): string;

		attributes(node: N): readonly N[];
		getAttribute(node: N, namespace: null | string, name: string): null | string;

		stringValue(node: N): string;
		compareDocumentPosition(x: N, y: N): number;

		getElementById(document: N, id: string): null | N;
		isHtmlDocument(document: N): boolean;

		nextSibling?(node: N): null | N;
		previousSibling?(node: N): null | N;

	}

	export type Resolver = {

		lookupNamespaceURI(prefix: string): null | string;

	}

	export type Result<N> = {

		readonly resultType: number;

		readonly numberValue: number;
		readonly stringValue: string;
		readonly booleanValue: boolean;

		readonly singleNodeValue: null | N;
		readonly snapshotLength: number;
		readonly invalidIteratorState: boolean;

		snapshotItem(index: number): null | N;
		iterateNext(): null | N;

	}

	export type Expression<N> = {

		evaluate(node: N, type?: number): Result<N>;

	}

	export type Evaluator<N> = {

		evaluate(expression: string, node: N, resolver: null | Resolver, type?: number): Result<N>;

		createExpression(expression: string, resolver: null | Resolver): Expression<N>;

		createNSResolver(node: N): Resolver;

	}

	export const XPathResult: {

		readonly ANY_TYPE: 0;
		readonly NUMBER_TYPE: 1;
		readonly STRING_TYPE: 2;
		readonly BOOLEAN_TYPE: 3;
		readonly UNORDERED_NODE_ITERATOR_TYPE: 4;
		readonly ORDERED_NODE_ITERATOR_TYPE: 5;
		readonly UNORDERED_NODE_SNAPSHOT_TYPE: 6;
		readonly ORDERED_NODE_SNAPSHOT_TYPE: 7;
		readonly ANY_UNORDERED_NODE_TYPE: 8;
		readonly FIRST_ORDERED_NODE_TYPE: 9;

	};

	export function createEvaluator<N>(adapter: Adapter<N>, options?: {

		readonly exceptions?: {
			syntaxError?(message: string): unknown;
			typeError?(message: string): unknown;
		};

		readonly cacheSize?: number;

	}): Evaluator<N>;

}
