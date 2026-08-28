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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvVault } from "./env.js";


const Key = "GEAR_TEST_PARAMETER";
const Prefix = "GEAR_TEST_";


afterEach(() => {
	vi.unstubAllEnvs();
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("createEnvVault", () => {

	it("retrieves the value of a defined variable", async () => {

		vi.stubEnv(Key, "secret");

		expect(await createEnvVault()(Key)).toBe("secret");

	});

	it("retrieves the empty value of a variable defined as empty", async () => {

		vi.stubEnv(Key, "");

		expect(await createEnvVault()(Key)).toBe("");

	});

	it("rejects an undefined variable", async () => {

		expect(() => createEnvVault()(Key)).toThrow(Error);

	});

	it("retrieves variables defined after construction", async () => {

		const vault = createEnvVault();

		vi.stubEnv(Key, "secret");

		expect(await vault(Key)).toBe("secret");

	});


	it("looks keys up under the prefix", async () => {

		vi.stubEnv(`${ Prefix }PARAMETER`, "secret");

		expect(await createEnvVault(Prefix)("PARAMETER")).toBe("secret");

	});

	it("rejects a key defined outside the prefix", async () => {

		vi.stubEnv("PARAMETER", "secret");

		expect(() => createEnvVault(Prefix)("PARAMETER")).toThrow(Error);

	});

});
