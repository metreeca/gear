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

import { lazy } from "@metreeca/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { service } from "../index.js";
import { getPath } from "../space/index.js";
import type { Vault } from "./index.js";


/**
 * Creates a dotenv vault.
 *
 * Parameters are read from `file` and parsed as a dotenv document.
 *
 * The document is read as the first request is served and the following ones are served from what it held then, so
 * that edits made while the vault is in use are not seen for its lifetime.
 *
 * @param file The path of the dotenv document to be read, resolved against the base path of the execution the vault
 *             is created in, as {@link getPath} defines; defaults to `.env`
 *
 * @returns A {@link Vault} retrieving parameters from `file`
 *
 * @throws {Error} If created outside an execution, as {@link service} defines
 *
 * @throws {Error} While retrieving a parameter, if the document defines no value under its key
 *
 * @throws {Error} While retrieving a parameter, whatever reading `file` reports, a missing document included
 *
 * @see {@link https://nodejs.org/api/util.html#utilparseenvcontent Node.js `util.parseEnv()`}
 *
 * @group Implementations
 */
export function createDotVault(file: string = ".env"): Vault {

	const path = service(getPath);

	const parameters = lazy(async () => parseEnv(await readFile(resolve(path, file), "utf-8")));

	return async key => {

		const value = (await parameters())[key];

		if ( value === undefined ) {

			throw new Error(`undefined secret <${key}>`);

		} else {

			return value;

		}

	};

}
