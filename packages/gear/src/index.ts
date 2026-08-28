/*
 * Copyright © 2020-2026 EC2U Alliance
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
 * Job executor and service locator.
 *
 * Provides the runtime for executing jobs, together with the shared services they rely on.
 *
 * Service location keeps a job independent of the facilities it uses: a job names a facility by its default
 * {@link Service service} rather than importing a concrete implementation, and a binding substitutes another one for
 * the duration of an execution, leaving unbound facilities to fall back on their own default; custom facilities
 * honouring the same contracts plug in interchangeably.
 *
 * > [!IMPORTANT]
 * >
 * > Service instances are constructed on first use, shared across the job, and, where they implement a disposal
 * > protocol, disposed as it ends. Concurrent or repeated runs share nothing.
 *
 * @module index
 *
 * @example
 *
 * ```ts
 * await executor(
 *
 *     bind(createVault, createEnvVault)
 *
 * )(async () => {
 *
 *     console.log(await service(createVault)("key"));
 *
 * });
 * ```
 */

import type { Defined } from "@metreeca/core";
import { unique } from "@metreeca/core/arrays";
import type { Awaitable } from "@metreeca/core/async";
import { report } from "@metreeca/tape";
import { AsyncLocalStorage } from "node:async_hooks";
import { isAsyncDisposable, isDisposable } from "./index.core.js";


const locators = new AsyncLocalStorage<<T extends Defined>(service: Service<T>) => T>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Job executor.
 *
 * Opens an execution for a job, resolves the service lookups the job makes against the bindings it was created with,
 * and disposes the instances constructed along the way once the job settles.
 *
 * Every invocation stands on its own: services are constructed on demand, shared within that invocation alone, and
 * disposed when it ends. Concurrent invocations share no instances. The promise handed back resolves to the value the
 * job produces, settling only after disposal has completed, and rejects if the executor is invoked from within a
 * running execution.
 *
 * > [!IMPORTANT]
 * >
 * > Services implementing {@link AsyncDisposable} or {@link Disposable} are disposed in reverse construction order,
 * > whether the job succeeded or failed, the asynchronous protocol taking precedence where both are implemented;
 * > instances implementing neither are left as they are, which is not an error. Disposal runs outside the execution,
 * > so a disposer resolving a service is rejected rather than constructing an instance nothing would dispose. Every
 * > disposer is run even if an earlier one failed: if the job and a disposal both fail, or several disposals fail, the
 * > errors are collected into an {@link AggregateError}, in the order they were raised.
 *
 * @see {@link https://tc39.es/proposal-explicit-resource-management/ ECMAScript Explicit Resource Management}
 */
export type Executor =
	<T>(job: Executable<T>) => Promise<T>;

/**
 * Executable job.
 *
 * Carries out the work of a run and resolves to the value it produces, drawing whatever it needs from the services of
 * the execution it runs in rather than from arguments, so that the same job runs under any set of bindings.
 *
 * Work started but left unawaited escapes the execution, as the value the job resolves to marks it as complete.
 *
 * @typeParam T The type of the value produced by the job
 */
export type Executable<T> =
	() => Awaitable<T>;

/**
 * Service binding.
 *
 * Pairs a service with the factory standing in for it, so that every lookup of the service within an execution created
 * with the pair yields the substitute's instance.
 *
 * @typeParam T The type of the bound service
 */
export type Binding<T extends Defined> =
	readonly [service: Service<T>, factory: Service<T>];

/**
 * Service factory.
 *
 * Constructs the instance backing a facility and identifies that facility across lookups and bindings.
 *
 * Doubling as the identity means services are looked up and bound by reference, so a service must be declared in a
 * single module and re-exported by reference only, as wrapping it in a new function forks the identity and silently
 * declares a second service.
 *
 * Construction must be synchronous and free of I/O, deferring such work to the instance's own methods. A service that
 * throws must undo whatever it has already done, as a failed lookup records nothing and a later lookup runs it again.
 *
 * Releasing whatever the instance holds is opt-in: an instance exposing a callable `Symbol.asyncDispose` or
 * `Symbol.dispose` member, either its own or inherited, is disposed as the execution ends, as detailed under
 * {@link Executor}; any other instance is left as it is.
 *
 * > [!IMPORTANT]
 * >
 * > Because the constructing function carries the identity, naming a service links its default implementation: the
 * > module declaring a service must stay import-light, requiring heavy clients lazily inside the default
 * > implementation rather than at module level.
 *
 * @typeParam T The type of the constructed instance, `undefined` excepted, as it marks a service under construction
 */
export type Service<T extends Defined> =
	() => T;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a job executor.
 *
 * @param bindings The implementations to be substituted for the duration of each execution
 *
 * @returns An {@link Executor} running a job under `bindings`, rejecting as described there if the job fails, if the
 * disposal of a service fails, or if it is invoked from within a running execution; the returned value holds no
 * service instances of its own and may be reused for independent executions
 *
 * @throws {Error} If `bindings` includes more than one binding for the same service, reporting the services bound
 * more than once
 */
export function executor(...bindings: readonly Binding<Defined>[]): Executor {

	const duplicates = unique(bindings
		.map(([service]) => service)
		.filter((service, index, services) => services.indexOf(service) !== index)
	);

	if ( duplicates.length > 0 ) {
		throw new Error(`duplicate service bindings <${duplicates
			.map(v => report(v))
			.map(v => `<${v}>`)
			.join(", ")
		}`);
	}

	const aliases = new Map(bindings);

	return async job => {

		if ( locators.getStore() !== undefined ) {
			throw new Error("nested job executions");
		}

		const instances = new Map<Service<Defined>, undefined | Defined>();

		// the job is wrapped, so that a synchronous throw is reported as a rejection; disposal is handled outside the
		// execution, so that a disposer resolving a service is rejected

		return locators.run(locate, async () => job()).then(fulfilled, rejected);


		function locate<T extends Defined>(service: Service<T>): T {

			const instance = instances.get(service) as undefined | T; // ;(cast) instances erase the service type

			return instance === undefined ? construct(service) : instance; // ;(??) `null` is a legal instance

		}

		function construct<T extends Defined>(service: Service<T>): T {

			// a placeholder recorded by an outer construction marks a service depending on itself

			if ( instances.has(service) ) {

				const chain = [...instances]
					.filter(([, pending]) => pending === undefined)
					.map(([pending]) => pending)
					.concat(service);

				throw new Error(`circular dependency across services ${chain
					.map(v => report(v))
					.map(v => `<${v}>`)
					.join(" => ")
				}`);

			}

			instances.set(service, undefined);

			try {

				const factory = aliases.get(service) ?? service;
				const instance = factory() as T; // ;(cast) aliases erase the service type

				instances.set(service, instance);

				return instance;

			} catch ( error ) {

				instances.delete(service);

				throw error;

			}

		}

		async function fulfilled<T>(value: T): Promise<T> {

			const failure = await release();

			if ( failure === undefined ) {

				return value;

			} else {

				throw failure;

			}

		}

		async function rejected(error: unknown): Promise<never> {

			const failure = await release();

			throw failure === undefined ? error : new AggregateError([ error, failure ], "execution failed");

		}

		async function release(): Promise<unknown> {

			return [...instances.values()].reduceRight(async (previous, value) => {

				const suppressed = await previous;

				try {

					// as `await using` does, preferring `@@asyncDispose` and falling back to `@@dispose`
					// https://tc39.es/proposal-explicit-resource-management/#sec-getdisposemethod

					await (isAsyncDisposable(value) ? value[Symbol.asyncDispose]()
						: isDisposable(value) ? value[Symbol.dispose]()
							: undefined);

					return suppressed;

				} catch ( error ) {

					return suppressed === undefined ? error : new AggregateError([ suppressed, error ], "disposal failed");

				}

			}, Promise.resolve(undefined));

		}

	};

}

/**
 * Binds an implementation to a service.
 *
 * @typeParam T The type of the bound service
 *
 * @param service The service to be bound
 * @param factory The implementation to be used in its place
 *
 * @returns An immutable binding pairing `service` with `factory`
 */
export function bind<T extends Defined>(service: Service<T>, factory: NoInfer<Service<T>>): Binding<T> {

	return Object.freeze([service, factory]);

}


/**
 * Resolves a service.
 *
 * Returns the instance produced by the implementation bound to `service` in the enclosing execution, or by `service`
 * itself if unbound, constructing it on first lookup and sharing it with every later lookup in the same execution.
 *
 * > [!WARNING]
 * >
 * > A job must await the work it starts. A promise chain left unawaited keeps the execution around it, so a lookup in
 * > one of its continuations resolves after disposal has run, into an instance nothing will dispose.
 *
 * @typeParam T The type of the resolved service
 *
 * @param service The service to be resolved
 *
 * @returns The service instance for the enclosing execution
 *
 * @throws {Error} If called outside an execution, reporting `service`; disposal of the execution's own services
 * counts as outside, as does a callback invoked from work that escaped the execution, such as a timer
 *
 * @throws {Error} If the service depends on itself, either directly or through other services, reporting the
 * dependency chain
 */
export function service<T extends Defined>(service: Service<T>): T {

	const locator = locators.getStore();

	if ( locator === undefined ) {
		throw new Error(`missing executor for service <${report(service)}>`);
	}

	return locator(service);

}
