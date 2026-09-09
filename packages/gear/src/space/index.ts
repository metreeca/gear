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
 * Working space access.
 *
 * Gives a job the surroundings it works within, such as the base paths its file access is anchored to, without reading
 * them directly from the process.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";

/**
 * The name of the file marking the base folder of a package.
 */
const Manifest = "package.json";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves the default base path.
 *
 * @returns The absolute path of the working directory of the process
 */
export function getPath(): string {

	return process.cwd();

}


/**
 * Retrieves the base path of an enclosing package.
 *
 * Locates the package a path belongs to by its manifest, rather than by the folder the process happens to be started
 * from, so that a path anchored to it is the same however the code is launched, whether from a shell, an IDE run
 * configuration or a deployed workload.
 *
 * @param path The absolute path the package is looked up from, typically the folder of the calling module, as given
 *             by `import.meta.dirname`
 *
 * @returns The absolute path of the closest folder holding a `package.json` file, at or above `path`
 *
 * @throws {@link !Error Error} If neither `path` nor any folder above it holds a `package.json` file
 */
export function getPackage(path: string): string {

	const base = path.split(sep)
		.reduce(chain => [...chain, dirname(chain[chain.length-1])], [path])
		.find(folder => existsSync(join(folder, Manifest)));

	if ( base === undefined ) {

		throw new Error(`missing <${Manifest}> above <${path}>`);

	} else {

		return base;

	}

}
