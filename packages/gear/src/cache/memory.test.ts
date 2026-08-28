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

	it("reports an immutable bucket", async () => {

		expect(Object.isFrozen(createMemoryCache())).toBeTruthy();

	});

	it("retrieves a stored value", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));

		expect(await text(await cache.get("key"))).toBe("value");

	});

	it("reports an unknown key as absent", async () => {

		expect(await createMemoryCache().get("unknown")).toBeUndefined();

	});

	it("removes a stored value", async () => {

		const cache = createMemoryCache();

		await cache.put("key", stream("value"));
		await cache.delete("key");

		expect(await cache.get("key")).toBeUndefined();

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

		it("reports a value left unused for the time to live as absent", async () => {

			const cache = createMemoryCache({ ttl: 1_000 });

			await cache.put("key", stream("value"));

			elapse(1_000);

			expect(await cache.get("key")).toBeUndefined();

		});

	});


	describe("bytes", () => {

		it("retains content without bound by default", async () => {

			const cache = createMemoryCache();

			await cache.put("one", stream("1111"));
			await cache.put("two", stream("2222"));

			expect(await text(await cache.get("one"))).toBe("1111");

		});

		it("discards values beyond the byte budget", async () => {

			const cache = createMemoryCache({ bytes: 4 });

			await cache.put("one", stream("1111"));
			await cache.put("two", stream("2222"));

			expect(await cache.get("one")).toBeUndefined();

		});

	});

});
