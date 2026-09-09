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

import type { Awaitable } from "@metreeca/core/async";
import type { Feed } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { bind, executor } from "@metreeca/gear";
import { createFetch, type Fetch, type Middleware } from "@metreeca/http";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { fetch } from "./fetch.js";


/**
 * Creates a feed carrying the given requests.
 */
function requests(...values: readonly (string | URL | Request)[]): Feed<string | URL | Request> {
	return items((async function* () { yield* values; })());
}

/**
 * Drains a feed into an array.
 *
 * Hand-rolled rather than delegating to `Array.fromAsync()`, which the `ES2022` library the project compiles against
 * doesn't provide.
 */
async function collect<V>(feed: AsyncIterable<V>): Promise<readonly V[]> {

	const collected: V[] = [];

	for await (const item of feed) { collected.push(item); } // draining a feed has no functional equivalent

	return collected;

}

/**
 * Decodes response bodies as text.
 */
async function text(responses: readonly Response[]): Promise<string> {
	return (await Promise.all(responses.map(response => response.text()))).join("");
}

/**
 * Creates a transport returning the response of `handler`, recording the exchanges routed through it.
 */
function transport(handler: (request: Request) => Awaitable<Response>) {

	const exchanges: Request[] = [];

	const stub: Fetch = async (input, init) => {

		const request = new Request(input, init);

		exchanges.push(request); // recording an exchange has no functional equivalent

		return handler(request);

	};

	return { exchanges, stub };

}

/**
 * Runs `task` under an execution routing exchanges through `stub`, draining the feed it yields.
 */
function run<V>(stub: Fetch, task: () => AsyncIterable<V>): Promise<readonly V[]> {
	return executor(bind(createFetch, () => stub))(() => collect(task()));
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("fetch", () => {

	describe("streaming", () => {

		it("emits the response of each request", async () => {

			const { stub } = transport(({ url }) => new Response(url.endsWith("/one") ? "alpha" : "beta"));

			const responses = await run(stub, () => fetch()(requests(
				"https://example.com/one",
				"https://example.com/two"
			)));

			expect(await text(responses)).toBe("alphabeta");

		});

		it("emits a response without a body", async () => {

			const { stub } = transport(() => new Response(null, { status: 204 }));

			const responses = await run(stub, () => fetch()(requests("https://example.com/")));

			expect(responses.map(({ status, body }) => ({ status, body }))).toEqual([{ status: 204, body: null }]);

		});

		it("emits a response with its body unread", async () => {

			const { stub } = transport(() => new Response("body"));

			const responses = await run(stub, () => fetch()(requests("https://example.com/")));

			expect(responses[0]?.bodyUsed).toBe(false);

		});

		it("draws one response at a time", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await executor(bind(createFetch, () => stub))(async () => {

				const responses = fetch()(requests(
					"https://example.com/one",
					"https://example.com/two"
				))[Symbol.asyncIterator]();

				await responses.next();

				expect(exchanges).toHaveLength(1);

				await responses.return?.();

			});

		});

		it("draws no further response when the consumer stops early", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await executor(bind(createFetch, () => stub))(async () => {

				const responses = fetch()(requests(
					"https://example.com/one",
					"https://example.com/two"
				))[Symbol.asyncIterator]();

				await responses.next();
				await responses.return?.(); // as a downstream take() would, once satisfied

			});

			await delay(10); // teardown propagates upstream asynchronously

			expect(exchanges).toHaveLength(1);

		});

	});

	describe("requests", () => {

		it("accepts URL strings, URL objects and requests", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch()(requests(
				"https://example.com/string",
				new URL("https://example.com/url"),
				new Request("https://example.com/request")
			)));

			expect(exchanges.map(({ url }) => url)).toEqual([
				"https://example.com/string",
				"https://example.com/url",
				"https://example.com/request"
			]);

		});

		it("exchanges each request on its own across applications", async () => {

			const { exchanges, stub } = transport(({ url }) => new Response(url.endsWith("/one") ? "alpha" : "beta"));

			const task = fetch();

			await executor(bind(createFetch, () => stub))(async () => {

				expect(await text(await collect(task(requests("https://example.com/one"))))).toBe("alpha");
				expect(await text(await collect(task(requests("https://example.com/two"))))).toBe("beta");

			});

			expect(exchanges).toHaveLength(2);

		});

		it("skips a request stating a malformed URL", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			const responses = await run(stub, () => fetch()(requests(
				"malformed",
				"https://example.com/"
			)));

			expect(exchanges.map(({ url }) => url)).toEqual(["https://example.com/"]);
			expect(responses.map(({ status }) => status)).toEqual([200]);

		});

	});

	describe("header fields", () => {

		it("sends desktop browser fields", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch()(requests("https://example.com/")));

			expect(exchanges[0]?.headers.get("User-Agent")).toMatch(/^Mozilla\/5\.0 .* Chrome\/\d/);
			expect(exchanges[0]?.headers.get("Accept")).toMatch(/^text\/html,/);

		});

		it("leaves the content coding to the transport", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch()(requests("https://example.com/")));

			// only the transport knows the codings it decodes: advertising others would leave a body compressed

			expect(exchanges[0]?.headers.get("Accept-Encoding")).toBeNull();

		});

		it("keeps a field already stated by the request", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch()(requests(
				new Request("https://example.com/", { headers: { "Accept": "text/csv" } })
			)));

			expect(exchanges[0]?.headers.get("Accept")).toBe("text/csv");

		});

	});

	describe("middlewares", () => {

		/**
		 * Creates a middleware appending `tag` to the `X-Tags` field of the request.
		 */
		function tagging(tag: string): Middleware {

			return fetcher => (input, init) => {

				const request = new Request(input, init);
				const tags = request.headers.get("X-Tags");

				request.headers.set("X-Tags", tags === null ? tag : `${tags},${tag}`);

				return fetcher(request);

			};

		}


		it("keeps a field stated by a middleware", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			const accepting: Middleware = fetcher => (input, init) => {

				const request = new Request(input, init);

				request.headers.set("Accept", "application/json");

				return fetcher(request);

			};

			await run(stub, () => fetch(accepting)(requests("https://example.com/")));

			expect(exchanges[0]?.headers.get("Accept")).toBe("application/json");

		});

		it("layers middlewares in request processing order", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch(tagging("first"), tagging("second"))(requests("https://example.com/")));

			expect(exchanges[0]?.headers.get("X-Tags")).toBe("first,second");

		});

	});

	describe("responses", () => {

		it("skips responses stating an unsuccessful status", async () => {

			const { stub } = transport(({ url }) => url.endsWith("/gone")
				? new Response(null, { status: 404 })
				: new Response("body")
			);

			const responses = await run(stub, () => fetch()(requests(
				"https://example.com/gone",
				"https://example.com/here"
			)));

			expect(responses.map(({ status }) => status)).toEqual([200]);

		});

	});

	describe("execution", () => {

		it("routes exchanges through the bound fetch client", async () => {

			const { exchanges, stub } = transport(() => new Response("body"));

			await run(stub, () => fetch()(requests("https://example.com/")));

			expect(exchanges).toHaveLength(1);

		});

		it("propagates a transport failure", async () => {

			const { stub } = transport(() => {
				throw new Error("broken transport"); // told apart from failures raised by the task by its message
			});

			const chunks = run(stub, () => fetch()(requests("https://example.com/")));

			await expect(chunks).rejects.toThrow("broken transport");

		});

		it("fails if no execution is running", async () => {

			await expect(collect(fetch()(requests("https://example.com/")))).rejects.toThrow(/missing executor/);

		});

	});

});
