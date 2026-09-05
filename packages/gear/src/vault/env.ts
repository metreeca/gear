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

import type { Vault } from "./index.js";


/**
 * Creates an environment vault.
 *
 * Parameters are looked up among the environment variables of the process as each request is served, so that a
 * variable defined after the vault was constructed is retrieved as well.
 *
 * Keys may be prefixed, so that parameters are namespaced within a shared environment: `prefix` is prepended as
 * given, without a separator of its own.
 *
 * @param prefix The string to be prepended to the key of each parameter to be retrieved; defaults to the empty string,
 *               looking keys up as they are given
 *
 * @returns A {@link Vault} retrieving parameters from the environment variables of the process
 *
 * @throws {@link !Error Error} While retrieving a parameter, if no variable is defined under its key
 *
 * @see {@link https://nodejs.org/api/process.html#processenv Node.js `process.env`}
 *
 * @group Implementations
 */
export function createEnvVault(prefix: string = ""): Vault {

	return key => {

		const value = process.env[`${prefix}${key}`];

		if ( value === undefined ) {

			throw new Error(`undefined secret <${key}>`);

		} else {

			return value;

		}

	};

}
