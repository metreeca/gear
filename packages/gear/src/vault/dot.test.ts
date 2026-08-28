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

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bind, executor, service } from "../index.js";
import { getPath } from "../space/index.js";
import { createDotVault } from "./dot.js";


const base = await mkdtemp(join(tmpdir(), "gear-vault-"));


afterAll(async () => {
	await rm(base, { recursive: true, force: true });
});


/**
 * Executes a task against a base path holding a dotenv document.
 */
async function within<T>(file: string, content: string, task: () => Promise<T>): Promise<T> {

	const home = await mkdtemp(join(base, "case-"));

	await writeFile(join(home, file), content);

	return executor(bind(getPath, () => home))(task);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("createDotVault", () => {

	it("retrieves the value of a defined parameter", async () => {

		await within(".env", "PARAMETER=secret\n", async () => {

			expect(await createDotVault()("PARAMETER")).toBe("secret");

		});

	});

	it("rejects an undefined parameter", async () => {

		await within(".env", "PARAMETER=secret\n", async () => {

			await expect(createDotVault()("UNDEFINED")).rejects.toThrow(Error);

		});

	});

	it("reports a missing document", async () => {

		await within("other.env", "PARAMETER=secret\n", async () => {

			await expect(createDotVault()("PARAMETER")).rejects.toThrow(/ENOENT/);

		});

	});

	it("reads the document stated on construction", async () => {

		await within("custom.env", "PARAMETER=secret\n", async () => {

			expect(await createDotVault("custom.env")("PARAMETER")).toBe("secret");

		});

	});

	it("reports parameters as they were read on the first request", async () => {

		await within(".env", "PARAMETER=secret\n", async () => {

			const vault = createDotVault();

			expect(await vault("PARAMETER")).toBe("secret");

			await writeFile(join(service(getPath), ".env"), "PARAMETER=revised\n");

			expect(await vault("PARAMETER")).toBe("secret");

		});

	});

});
