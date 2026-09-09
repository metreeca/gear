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
 * Sensitive parameter lookup.
 *
 * Looks up credentials, API keys and other sensitive configuration parameters by name, so that they never appear in
 * source code or in the configuration a job carries with it.
 *
 * @module
 *
 * @groupDescription Implementations
 *
 * Ready-made vaults to be {@link index.bind bound} to {@link createVault} in place of the default one.
 */

import { Awaitable } from "@metreeca/core/async";
import { createEnvVault } from "./env.js";


/**
 * Secret vault.
 *
 * Retrieves sensitive configuration parameters from safe storage.
 */
export type Vault = {

	/**
	 * Retrieves a sensitive configuration parameter.
	 *
	 * A parameter defined as empty yields an empty value.
	 *
	 * @param key The unique key identifying the parameter to be retrieved
	 *
	 * @returns The value of the parameter identified by `key`, possibly resolved asynchronously, as remote storage
	 *          requires
	 *
	 * @throws {@link !Error Error} If no parameter is identified by `key`; vaults resolving lookups asynchronously
	 *                              report the failure as a rejected promise
	 */
	(key: string): Awaitable<string>

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates the default vault.
 *
 * @returns A vault retrieving parameters from the environment of the process, as {@link createEnvVault} defines
 */
export function createVault(): Vault {

	return createEnvVault();

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export * from "./env.js";
export * from "./dot.js";
