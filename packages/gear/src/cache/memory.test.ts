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
import { createMemoryCache } from "./memory.js";


afterEach(() => {
	vi.useRealTimers();
});


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

describe("createMemoryCache", () => {

	it("returns an immutable bucket", async () => {

		expect(Object.isFrozen(createMemoryCache())).toBe(true);

	});

	it("retrieves a stored value", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));

		expect(await text(await cache.get("key"))).toBe("value");

	});

	it("yields no value for an unknown key", async () => {

		expect(await createMemoryCache().get("unknown")).toBeUndefined();

	});

	it("replaces the value stored under a key", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));
		await cache.put("key", stream("revised"));

		expect(await text(await cache.get("key"))).toBe("revised");

	});

	it("opens a fresh stream on every retrieval", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));

		expect(await text(await cache.get("key"))).toBe("value");
		expect(await text(await cache.get("key"))).toBe("value");

	});

	it("removes a stored value", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));
		await cache.delete("key");

		expect(await cache.get("key")).toBeUndefined();

	});

	it("removes an unknown key without failing", async () => {

		await expect(createMemoryCache().delete("unknown")).resolves.toBeUndefined();

	});

	it("holds content apart from another cache", async () => {

		await createMemoryCache().put("key", stream("value"));

		expect(await createMemoryCache().get("key")).toBeUndefined();

	});


	describe("ttl", () => {

		it("retains a value indefinitely by default", async () => {

			const cache = createMemoryCache();

			await cache.put("key", stream("value"));

			elapse(1_000_000);

			expect(await text(await cache.get("key"))).toBe("value");

		});

		it("retains a value indefinitely under a non-positive time to live", async () => {

			const cache = createMemoryCache({ ttl: 0 });

			await cache.put("key", stream("value"));

			elapse(1_000_000);

			expect(await text(await cache.get("key"))).toBe("value");

		});

		it("drops a value left unused for the time to live", async () => {

			const cache = createMemoryCache({ ttl: 1_000 });

			await cache.put("key", stream("value"));

			elapse(1_000);

			expect(await cache.get("key")).toBeUndefined();

		});

		it("retains a value used within the time to live", async () => {

			const cache = createMemoryCache({ ttl: 10_000 });

			await cache.put("key", stream("value"));

			elapse(1_000);

			expect(await text(await cache.get("key"))).toBe("value");

		});

		it("restarts the time to live on every use", async () => {

			const cache = createMemoryCache({ ttl: 10_000 });

			await cache.put("key", stream("value"));
			elapse(6_000);

			await cache.get("key");
			elapse(6_000);

			expect(await text(await cache.get("key"))).toBe("value");

		});

	});


	describe("bytes", () => {

		it("retains content without bound by default", async () => {

			const cache = createMemoryCache();

			await cache.put("one", stream("1111"));
			await cache.put("two", stream("2222"));
			await cache.put("three", stream("3333"));

			expect(await text(await cache.get("one"))).toBe("1111");

		});

		it("retains content without bound under a non-positive budget", async () => {

			const cache = createMemoryCache({ bytes: 0 });

			await cache.put("one", stream("1111"));
			await cache.put("two", stream("2222"));

			expect(await text(await cache.get("one"))).toBe("1111");

		});

		it("discards values beyond the byte budget", async () => {

			const cache = createMemoryCache({ bytes: 8 });

			await cache.put("one", stream("1111"));
			elapse(1_000);

			await cache.put("two", stream("2222"));
			elapse(1_000);

			await cache.put("three", stream("3333"));

			expect(await cache.get("one")).toBeUndefined();

		});

		it("retains the most recently used values", async () => {

			const cache = createMemoryCache({ bytes: 8 });

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
