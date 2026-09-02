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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bind, executor, service } from "../index.js";
import { getPackage, getPath } from "./index.js";


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
