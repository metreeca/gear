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
 * Checks if a value supports synchronous disposal.
 *
 * Recognises the protocol by shape rather than by declaration, so that any value carrying a callable `Symbol.dispose`
 * member, own or inherited, is accepted, whether or not it was typed as `Disposable`.
 *
 * The two disposal protocols are independent: a value implementing both is accepted here and by
 * {@link isAsyncDisposable} alike, leaving the caller to decide which one takes precedence.
 *
 * @param value The value to be checked
 *
 * @returns true if `value` is an object or a function exposing a callable `Symbol.dispose` method; false otherwise
 *
 * @see {@link https://tc39.es/proposal-explicit-resource-management/ ECMAScript Explicit Resource Management}
 */
export function isDisposable(value: unknown): value is Disposable {

	return value instanceof Object
		&& Symbol.dispose in value
		&& typeof value[Symbol.dispose] === "function";

}

/**
 * Checks if a value supports asynchronous disposal.
 *
 * Recognises the protocol by shape rather than by declaration, so that any value carrying a callable
 * `Symbol.asyncDispose` member, own or inherited, is accepted, whether or not it was typed as `AsyncDisposable`.
 *
 * The two disposal protocols are independent: a value implementing both is accepted here and by {@link isDisposable}
 * alike, leaving the caller to decide which one takes precedence.
 *
 * @param value The value to be checked
 *
 * @returns true if `value` is an object or a function exposing a callable `Symbol.asyncDispose` method; false otherwise
 *
 * @see {@link https://tc39.es/proposal-explicit-resource-management/ ECMAScript Explicit Resource Management}
 */
export function isAsyncDisposable(value: unknown): value is AsyncDisposable {

	return value instanceof Object
		&& Symbol.asyncDispose in value
		&& typeof value[Symbol.asyncDispose] === "function";

}
