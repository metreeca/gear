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

import { existsSync } from "fs";
import { join } from "path";
import { defineConfig } from "vitest/config";

const packages = join(import.meta.dirname, "packages");

export default defineConfig({

	test: {

		/**
		 * Allows workspace packages without test files to pass cleanly during `npm run check --workspaces`.
		 */
		passWithNoTests: true,

		typecheck: {
			include: ["**/src/*.test-d.ts"],
			tsconfig: "tsconfig.json"
		}

	},

	plugins: [{

		name: "gear-resolver",
		enforce: "pre",

		/**
		 * Resolves `@metreeca/gear*` workspace imports to TypeScript source for build-free testing.
		 *
		 * - `@metreeca/gear-pkg` → `packages/gear-pkg/src/index.ts`
		 * - `@metreeca/gear-pkg/module` → `packages/gear-pkg/src/module.ts` or `packages/gear-pkg/src/module/index.ts`
		 *
		 * @param id - The module specifier to resolve
		 *
		 * @returns The resolved file path, or `null` if the specifier does not match
		 */
		resolveId(id: string) {

			const bare = id.match(/^@metreeca\/(gear[^/]*)$/);

			if ( bare ) { // bare package import

				const index = join(packages, bare[1], "src", "index.ts");

				return existsSync(index) ? index : null;

			} else { // subpath import

				const module = id.match(/^@metreeca\/(gear[^/]*)\/(.+)$/);

				if ( module ) {

					const source = join(packages, module[1], "src");

					const named = join(source, `${module[2]}.ts`);
					const index = join(source, module[2], "index.ts");

					return existsSync(named) ? named
						: existsSync(index) ? index
							: null;

				} else {

					return null;

				}

			}

		}

	}]

});
