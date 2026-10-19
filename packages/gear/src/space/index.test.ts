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

import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { bind, executor, service } from "../index.js";
import { getPackage, getPath, getResource } from "./index.js";


describe("getPath", () => {

	it("constructs the working directory of the process", async () => {

		await executor()(() => {

			expect(service(getPath)).toBe(process.cwd());

		});

	});

	it("is replaceable by a binding", async () => {

		await executor(bind(getPath, () => "/base"))(() => {

			expect(service(getPath)).toBe("/base");

		});

	});

});

describe("getPackage", () => {

	it("returns the closest folder holding a manifest", async () => {

		expect(existsSync(join(getPackage(import.meta.dirname), "package.json"))).toBe(true);

	});

	it("returns a folder enclosing the given path", async () => {

		expect(import.meta.dirname.startsWith(getPackage(import.meta.dirname))).toBe(true);

	});

	it("returns the given path when it holds a manifest", async () => {

		const base = getPackage(import.meta.dirname);

		expect(getPackage(base)).toBe(base);

	});

	it("rejects a path with no manifest above it", async () => {

		const orphan = await mkdtemp(join(tmpdir(), "gear-space-"));

		try {

			expect(() => getPackage(orphan)).toThrow();

		} finally {

			await rm(orphan, { recursive: true, force: true });

		}

	});

});

describe("getResource", () => {

	async function withFolder(test: (folder: string) => Promise<void>): Promise<void> {

		const folder = await mkdtemp(join(tmpdir(), "gear-space-"));

		try {

			await test(folder);

		} finally {

			await rm(folder, { recursive: true, force: true });

		}

	}

	it("reads a file as UTF-8 text", async () => withFolder(async folder => {

		await writeFile(join(folder, "text.txt"), "àèì", "utf-8");

		expect(await getResource(pathToFileURL(join(folder, "text.txt")))).toBe("àèì");

	}));

	it("resolves a relative path against a base", async () => withFolder(async folder => {

		await writeFile(join(folder, "sibling.txt"), "sibling", "utf-8");

		expect(await getResource("sibling.txt", pathToFileURL(join(folder, "module.js")))).toBe("sibling");

	}));

	it("replaces the extensions of the base with an extension path", async () => withFolder(async folder => {

		await writeFile(join(folder, "module.sys.md"), "prompt", "utf-8");

		expect(await getResource(".sys.md", pathToFileURL(join(folder, "module.test.js")).href)).toBe("prompt");

	}));

	it("caches contents across reads", async () => withFolder(async folder => {

		const url = pathToFileURL(join(folder, "cached.txt"));

		await writeFile(url, "before", "utf-8");
		await getResource(url);
		await writeFile(url, "after", "utf-8");

		expect(await getResource(url)).toBe("before");

	}));

	it("rejects a missing file", async () => withFolder(async folder => {

		await expect(getResource(pathToFileURL(join(folder, "missing.txt")))).rejects.toThrow();

	}));

});
