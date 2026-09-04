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
 * > Bound implementations are constructed as the execution opens, unbound defaults on first use; either way the
 * > instance is shared across the job and, where it implements a disposal protocol, disposed as the job ends.
 * > Concurrent or repeated runs share nothing.
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


/**
 * Enclosing service locator.
 *
 * Follows a job across the asynchronous continuations it spawns, so that a lookup made anywhere within it is resolved
 * against the execution it runs in without the job carrying the locator along. An empty store marks code running
 * outside any execution, disposal and work that escaped a settled job included.
 */
const locators = new AsyncLocalStorage<<T extends Defined>(service: Service<T>) => T>();


/**
 * Unprepared binding.
 *
 * Unwinds a synchronous lookup reaching a bound service before the preparation pass has constructed it, naming the
 * binding the pass is to prepare before running the abandoned construction again.
 */
class Pending extends Error {

	constructor(
		readonly service: Service<Defined>,
		readonly factory: (locator: Locator) => Awaitable<Defined>
	) {

		super(`pending service <${report(service)}>`);

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Job executor.
 *
 * Opens an execution for a job, resolves the service lookups the job makes against the bindings it was created with,
 * and disposes the instances constructed along the way once the job settles.
 *
 * Every invocation stands on its own, sharing no service instance with another. The promise handed back resolves to
 * the value the job produces, settling only after disposal has completed, and rejects if the executor is invoked from
 * within a running execution.
 *
 * Bound implementations are constructed as the execution opens, before the job is handed control: an implementation
 * may therefore await whatever it needs and still leave the job a ready instance on a synchronous lookup, at the cost
 * of being constructed even where the job never resolves it. An execution failing to prepare its bindings rejects
 * without running the job, disposing whatever it had already constructed.
 *
 * > [!IMPORTANT]
 * >
 * > Bindings are declared in any order: an implementation reaching another through the {@link Locator locator} it is
 * > handed has it prepared on the spot, so it is constructed exactly once however the list is arranged, and an
 * > implementation acquiring a resource or awaiting an expensive call is never made to repeat it. Implementations
 * > requiring each other are rejected as circular. Independent bindings are prepared in declaration order.
 * >
 * > Reaching another service through the ambient {@link service} lookup instead is rejected where that service is
 * > bound and not yet prepared, as a synchronous lookup is unable to wait for it. Unbound defaults stay resolvable
 * > that way, and one of them reaching an unprepared binding is run again once it is ready, under the all-or-nothing
 * > requirement stated at {@link Service}; the implementation that required it is not repeated.
 *
 * > [!IMPORTANT]
 * >
 * > Services implementing {@link https://tc39.es/proposal-explicit-resource-management/ AsyncDisposable} or
 * > {@link https://tc39.es/proposal-explicit-resource-management/ Disposable} are disposed in reverse construction
 * > order, whether the job succeeded or failed, the asynchronous protocol taking precedence where both are implemented;
 * > instances implementing neither are left as they are, which is not an error. Disposal runs outside the execution,
 * > so a disposer resolving a service is rejected rather than constructing an instance nothing would dispose. Every
 * > disposer is run even if an earlier one failed: if the job and a disposal both fail, or several disposals fail, the
 * > errors are collected into an
 * > {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/AggregateError AggregateError},
 * > in the order they were raised.
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
 * Service locator.
 *
 * Resolves a service for a bound implementation under construction, waiting for whatever the execution has to do to
 * make it available: a binding not yet prepared is prepared on the spot, so bindings are declared in any order and no
 * implementation is constructed twice.
 *
 * This is the way a bound implementation reaches another service, the ambient {@link service} lookup being unable to
 * wait for a binding that is not ready.
 *
 * @typeParam T The type of the resolved service
 *
 * @param service The service to be resolved
 *
 * @returns A promise resolving to the instance of `service` for the enclosing execution
 *
 * @throws {Error} If `service` requires itself, either directly or through other services, reporting the dependency
 *                 chain
 */
export type Locator =
	<T extends Defined>(service: Service<T>) => Promise<T>;

/**
 * Service binding.
 *
 * Pairs a service with the factory standing in for it, so that every lookup of the service within an execution created
 * with the pair yields the substitute's instance.
 *
 * The substitute may await whatever it needs to construct that instance, as it is constructed when the execution opens
 * rather than on first lookup, drawing the services it depends on from the {@link Locator locator} it is handed, under
 * the terms detailed at {@link Executor}.
 *
 * @typeParam T The type of the bound service
 */
export type Binding<T extends Defined> =
	readonly [service: Service<T>, factory: (locator: Locator) => Awaitable<T>];

/**
 * Service factory.
 *
 * Constructs the instance backing a facility and identifies that facility across lookups and bindings.
 *
 * Doubling as the identity means services are looked up and bound by reference, so a service must be declared in a
 * single module and re-exported by reference only, as wrapping it in a new function forks the identity and silently
 * declares a second service.
 *
 * Construction must be synchronous and free of I/O, deferring such work to the instance's own methods; an
 * implementation {@link bind bound} to a service is exempt, as it is constructed ahead of the job.
 *
 * > [!IMPORTANT]
 * >
 * > Construction is all or nothing, as a transaction is: a run either records an instance or rolls back, leaving
 * > nothing of what it had already done. A factory letting an error through must first release whatever it holds and
 * > undo whatever it has changed, then rethrow that same error, never replacing it or swallowing it in favour of an
 * > alternative, as it may be the signal unwinding the construction: a default reaching a bound service the execution
 * > is not yet ready to hand over is abandoned where it stands and run again from the start once it is. Nothing tells
 * > such a run from a first one, so a second must be indistinguishable from a first. Being synchronous and free of
 * > I/O, a default has little to roll back, and one performing its lookups before it constructs anything has nothing
 * > at all. A bound implementation is exempt, drawing what it needs from the {@link Locator locator} it is handed and
 * > never being repeated.
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
 * @returns An {@link Executor} running a job under `bindings`, rejecting as described there if a bound implementation
 *          fails to construct, if the job fails, if the disposal of a service fails, or if it is invoked from within a
 *          running execution; the returned value holds no service instances of its own and may be reused for
 *          independent executions
 *
 * @throws {Error} If `bindings` includes more than one binding for the same service, reporting the services bound
 *                 more than once
 */
export function executor(...bindings: readonly Binding<Defined>[]): Executor {

	const duplicates = unique(bindings
		.map(([service]) => service)
		.filter((service, index, services) => services.indexOf(service) !== index)
	);

	if ( duplicates.length > 0 ) {
		throw new Error(`duplicate service bindings ${duplicates
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

		return locators.run(locate, async () => {

			await prepareBindings();

			return job();

		}).then(fulfilled, rejected);


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

			// a bound implementation is constructed by the preparation pass, which alone is able to await it

			const alias = aliases.get(service);

			if ( alias !== undefined ) {
				throw new Pending(service, alias);
			}

			instances.set(service, undefined);

			try {

				const instance = service();

				instances.set(service, instance);

				return instance;

			} catch ( error ) {

				instances.delete(service);

				throw error;

			}

		}

		async function prepareBindings(): Promise<void> {

			return [...aliases].reduce(async (previous, [ service, factory ]) => {

				await previous;

				// a binding reached out of turn is prepared by the construction reaching it, and skipped here

				return instances.has(service) ? undefined : prepare(service, factory);

			}, Promise.resolve());


			async function prepare(
				service: Service<Defined>,
				factory: (locator: Locator) => Awaitable<Defined>
			): Promise<void> {

				// the placeholder is retained across the whole preparation, so that a construction reaching back here
				// while it is under way is reported as circular

				instances.set(service, undefined);

				try {

					instances.set(service, await factory(locator));

				} catch ( error ) {

					instances.delete(service);

					// an unwinding signal escaping the factory comes from a synchronous lookup in its own body, which
					// no repeat would make waitable

					throw error instanceof Pending
						? new Error(`unprepared service <${report(error.service)}> resolved`
							+ ` through the ambient lookup rather than the locator`)
						: error;

				}

			}

			async function locator<T extends Defined>(target: Service<T>): Promise<T> {

				try {

					return locate(target);

				} catch ( error ) {

					if ( error instanceof Pending ) {

						// only the construction reaching the unprepared binding is unwound: the implementation
						// waiting here is handed the instance once that one is ready

						await prepare(error.service, error.factory);

						return locator(target);

					} else {

						throw error;

					}

				}

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

					return suppressed === undefined ? error
						: new AggregateError([ suppressed, error ], "disposal failed");

				}

			}, Promise.resolve(undefined));

		}

	};

}

/**
 * Binds an implementation to a service.
 *
 * The implementation may be asynchronous, so that a facility whose construction depends on a value only another
 * service can supply, such as a client keyed from a secret vault, is still resolved by a synchronous lookup: bound
 * implementations are constructed and awaited as the execution opens, under the terms detailed at {@link Executor}.
 *
 * > [!IMPORTANT]
 * >
 * > The services the implementation depends on are resolved through the {@link Locator locator} it is handed, not
 * > through the ambient {@link service} lookup, which is unable to wait for a binding the execution has yet to
 * > prepare. Naming the parameter `service` shadows the ambient lookup, so a stray call is caught as a missing
 * > `await` rather than at run time.
 *
 * @typeParam T The type of the bound service
 *
 * @param service The service to be bound
 * @param factory The implementation to be used in its place, handed a locator resolving the services it depends on
 *                and awaited before the job runs where it is asynchronous
 *
 * @returns An immutable binding pairing `service` with `factory`
 *
 * @example
 *
 * ```ts
 * bind(createClient, async service => {
 *
 *     const vault = await service(createVault);
 *
 *     return new Client(await vault("api.key"));
 *
 * });
 * ```
 */
export function bind<T extends Defined>(
	service: Service<T>,
	factory: NoInfer<(locator: Locator) => Awaitable<T>>
): Binding<T> {

	return Object.freeze([service, factory]);

}


/**
 * Resolves a service.
 *
 * Returns the instance produced by the implementation bound to `service` in the enclosing execution, or by `service`
 * itself if unbound: a bound implementation is ready before the job is handed control, an unbound default is
 * constructed on first lookup, and either way every later lookup in the same execution is handed the same instance.
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
 *                 counts as outside, as does a callback invoked from work that escaped the execution, such as a timer
 *
 * @throws {Error} If the service depends on itself, either directly or through other services, reporting the
 *                 dependency chain
 *
 * @throws {Error} If `service` is bound and looked up from a bound implementation the execution is preparing,
 *                 reporting `service`: an implementation resolves what it depends on through the
 *                 {@link Locator locator} it is handed
 *
 * @throws {Error} If `service` is bound and looked up from an unbound default the execution is constructing before
 *                 that binding is ready, unwinding the default to be run again as detailed at {@link Executor}; a
 *                 default must let this error through unchanged rather than replacing or swallowing it
 */
export function service<T extends Defined>(service: Service<T>): T {

	const locator = locators.getStore();

	if ( locator === undefined ) {
		throw new Error(`missing executor for service <${report(service)}>`);
	}

	return locator(service);

}
