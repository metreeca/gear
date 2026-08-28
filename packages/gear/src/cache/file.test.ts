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

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { bind, executor, service } from "../index.js";
import { getPath } from "../space/index.js";
import { createFileCache } from "./file.js";


const base = await mkdtemp(join(tmpdir(), "gear-cache-"));


afterAll(async () => {
	await rm(base, { recursive: true, force: true });
});

afterEach(() => {
	vi.useRealTimers();
});


/**
 * Executes a task against a dedicated working space path.
 */
async function within<T>(task: () => Promise<T>): Promise<T> {

	const home = await mkdtemp(join(base, "case-"));

	return executor(bind(getPath, () => home))(task);

}

/**
 * Opens a stream over a text value.
 */
function stream(value: string): ReadableStream<Uint8Array<ArrayBuffer>> {

	return new ReadableStream({

		start(controller) {

			controller.enqueue(new TextEncoder().encode(value));
			controller.close();

		}

	});

}

/**
 * Reads a possibly absent value as text.
 */
async function text(value: undefined | ReadableStream<Uint8Array<ArrayBuffer>>): Promise<undefined | string> {

	return value === undefined ? undefined : new Response(value).text();

}

/**
 * Advances the wall clock.
 */
function elapse(millis: number): void {

	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now()+millis);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("createFileCache", () => {

	it("reports an immutable bucket", async () => {

		await within(async () => {

			expect(Object.isFrozen(createFileCache())).toBeTruthy();

		});

	});

	it("retrieves a stored value", async () => {

		await within(async () => {

			const cache = createFileCache();

			await cache.put("key", stream("value"));

			expect(await text(await cache.get("key"))).toBe("value");

		});

	});

	it("reports an unknown key as absent", async () => {

		await within(async () => {

			expect(await createFileCache().get("unknown")).toBeUndefined();

		});

	});

	it("replaces the value stored under a key", async () => {

		await within(async () => {

			const cache = createFileCache();

			await cache.put("key", stream("value"));
			await cache.put("key", stream("revised"));

			expect(await text(await cache.get("key"))).toBe("revised");

		});

	});

	it("opens a fresh stream on every retrieval", async () => {

		await within(async () => {

			const cache = createFileCache();

			await cache.put("key", stream("value"));

			expect(await text(await cache.get("key"))).toBe("value");
			expect(await text(await cache.get("key"))).toBe("value");

		});

	});

	it("removes a stored value", async () => {

		await within(async () => {

			const cache = createFileCache();

			await cache.put("key", stream("value"));
			await cache.delete("key");

			expect(await cache.get("key")).toBeUndefined();

		});

	});

	it("removes an unknown key without failing", async () => {

		await within(async () => {

			await expect(createFileCache().delete("unknown")).resolves.toBeUndefined();

		});

	});

	it("shares content with a cache over the same path", async () => {

		await within(async () => {

			await createFileCache().put("key", stream("value"));

			expect(await text(await createFileCache().get("key"))).toBe("value");

		});

	});


	describe("path", () => {

		it("holds values under the stated path", async () => {

			await within(async () => {

				await createFileCache({ path: "custom" }).put("key", stream("value"));

				expect(await createFileCache().get("key")).toBeUndefined();

			});

		});

		it("reports a path taken by a plain file", async () => {

			await within(async () => {

				await writeFile(join(service(getPath), "cache"), "");

				await expect(createFileCache().put("key", stream("value"))).rejects.toThrow(Error);

			});

		});

	});


	describe("ttl", () => {

		it("retains a value indefinitely by default", async () => {

			await within(async () => {

				const cache = createFileCache();

				await cache.put("key", stream("value"));

				elapse(1_000_000);

				expect(await text(await cache.get("key"))).toBe("value");

			});

		});

		it("reports a value left unused for the time to live as absent", async () => {

			await within(async () => {

				const cache = createFileCache({ ttl: 1_000 });

				await cache.put("key", stream("value"));

				elapse(1_000);

				expect(await cache.get("key")).toBeUndefined();

			});

		});

		it("retains a value used within the time to live", async () => {

			await within(async () => {

				const cache = createFileCache({ ttl: 10_000 });

				await cache.put("key", stream("value"));

				elapse(1_000);

				expect(await text(await cache.get("key"))).toBe("value");

			});

		});

		it("restarts the time to live on every use", async () => {

			await within(async () => {

				const cache = createFileCache({ ttl: 10_000 });

				await cache.put("key", stream("value"));
				elapse(6_000);

				await cache.get("key");
				elapse(6_000);

				expect(await text(await cache.get("key"))).toBe("value");

			});

		});

		it("drops an expired value on an access addressing another key", async () => {

			await within(async () => {

				const cache = createFileCache({ ttl: 1_000 });

				await cache.put("key", stream("value"));

				elapse(1_000);

				expect(await cache.get("other")).toBeUndefined();
				expect(await readdir(join(service(getPath), "cache"))).toEqual([]);

			});

		});

	});


	describe("bytes", () => {

		it("retains content without bound by default", async () => {

			await within(async () => {

				const cache = createFileCache();

				await cache.put("one", stream("1111"));
				await cache.put("two", stream("2222"));
				await cache.put("three", stream("3333"));

				expect(await text(await cache.get("one"))).toBe("1111");

			});

		});

		it("discards a value exceeding the budget on its own", async () => {

			await within(async () => {

				const cache = createFileCache({ bytes: 4 });

				await cache.put("key", stream("12345678"));

				expect(await cache.get("key")).toBeUndefined();

			});

		});

		it("discards values beyond the byte budget", async () => {

			await within(async () => {

				const cache = createFileCache({ bytes: 8 });

				await cache.put("one", stream("1111"));
				elapse(1_000);

				await cache.put("two", stream("2222"));
				elapse(1_000);

				await cache.put("three", stream("3333"));

				expect(await cache.get("one")).toBeUndefined();

			});

		});

		it("retains the most recently used values", async () => {

			await within(async () => {

				const cache = createFileCache({ bytes: 8 });

				await cache.put("one", stream("1111"));
				elapse(1_000);

				await cache.put("two", stream("2222"));
				elapse(1_000);

				await cache.get("one");
				elapse(1_000);

				await cache.put("three", stream("3333"));

				expect(await cache.get("two")).toBeUndefined();
				expect(await text(await cache.get("one"))).toBe("1111");

			});

		});

	});

});
