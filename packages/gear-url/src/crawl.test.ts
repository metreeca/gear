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

import type { Optional } from "@metreeca/core";
import type { Awaitable, Awaitables } from "@metreeca/core/async";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import { take } from "@metreeca/flow/tasks";
import { describe, expect, it } from "vitest";
import { crawl, type Source } from "./crawl.js";


/**
 * The base the test URLs are resolved against.
 */
const base = "https://example.com/";

/**
 * A directed graph as an adjacency map of paths, converging on `/d` and leaving `/z` unreachable from `/a`.
 */
const graph: Record<string, readonly string[]> = {
	"/a": ["/b", "/c"],
	"/b": ["/d"],
	"/c": ["/d", "/e"],
	"/d": [],
	"/e": [],
	"/z": []
};


/**
 * Resolves a path against the test base.
 */
function href(path: string): string {
	return new URL(path, base).href;
}

/**
 * Lists crawled URLs in string form.
 */
function hrefs(urls: readonly URL[]): readonly string[] {
	return urls.map(String);
}

/**
 * Creates a walker resolving the links an adjacency map lists for a crawled path.
 */
function walker(map: Record<string, readonly string[]>): (url: URL) => Optional<readonly URL[]> {
	return url => map[url.pathname]?.map(path => new URL(path, url));
}


/**
 * A retrieved page, as the intermediate representation the three-step crawl is driven and harvested from.
 */
interface Page {

	readonly path: string;
	readonly title: string;

}

/**
 * The links of the test site, converging on `/d`.
 */
const site: Record<string, readonly string[]> = {
	"/a": ["/b", "/c"],
	"/b": ["/d"],
	"/c": ["/d"],
	"/d": []
};


/**
 * States the page a crawled URL stands for, none if the site doesn't include it.
 */
function feeder(url: URL): Optional<Page> {
	return site[url.pathname] && { path: url.pathname, title: url.pathname.slice(1).toUpperCase() };
}

/**
 * States the URLs a page links to.
 */
function links({ path }: Page): Optional<readonly URL[]> {
	return site[path]?.map(linked => new URL(linked, base));
}

/**
 * States the title a page contributes.
 */
function title({ title }: Page): string {
	return title;
}


describe("crawl()", () => {

	it("should emit the seed URLs", async () => {

		const values = await items([href("/a"), href("/b")])(crawl(() => undefined))(toArray());

		expect(hrefs(values)).toEqual([href("/a"), href("/b")]);

	});

	it("should emit URLs as parsed objects", async () => {

		const values = await items([href("/a")])(crawl(() => undefined))(toArray());

		expect(values.every(value => value instanceof URL)).toBe(true);

	});

	it("should emit nothing for an empty source", async () => {

		const values = await items<string>([])(crawl(() => undefined))(toArray());

		expect(values).toEqual([]);

	});

	it("should crawl reachable URLs breadth-first in level order", async () => {

		// depth-first pre-order would emit ["/a", "/b", "/d", "/c", "/e"]; `/z` is unreachable from `/a`

		const values = await items([href("/a")])(crawl(walker(graph)))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b", "/c", "/d", "/e"].map(href));

	});

	it("should crawl converging URLs once, at their shallowest level", async () => {

		// `/f` is linked both from the seed and from `/e`; the first arrival is the shallowest one

		const converging = { "/a": ["/b", "/f"], "/b": ["/e"], "/e": ["/f"], "/f": [] };

		const values = await items([href("/a")])(crawl(walker(converging)))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b", "/f", "/e"].map(href));

	});

	it("should terminate on cyclic graphs", async () => {

		const cyclic = { "/a": ["/b"], "/b": ["/a"] };

		const values = await items([href("/a")])(crawl(walker(cyclic)))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b"].map(href));

	});

	it("should share crawled URLs across seeds", async () => {

		const shared = { "/a": ["/d"], "/c": ["/d"], "/d": [] };

		const values = await items([href("/a"), href("/c")])(crawl(walker(shared)))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/c", "/d"].map(href));

	});

	it("should crawl repeated seeds once", async () => {

		const values = await items([href("/a"), href("/a")])(crawl(() => undefined))(toArray());

		expect(hrefs(values)).toEqual([href("/a")]);

	});

	it("should crawl seeds and links stated as strings and as URLs alike", async () => {

		const seed = href("/a");

		const values = await items([seed, new URL(seed)])(crawl(url => url.href === seed ? [new URL(seed)] : undefined))
		(toArray());

		expect(hrefs(values)).toEqual([seed]);

	});

	it("should crawl URLs differing only in canonical form once", async () => {

		// the parser lowercases the host and supplies the empty path

		const values = await items(["https://example.com", "HTTPS://EXAMPLE.COM/"])(crawl(() => undefined))(toArray());

		expect(hrefs(values)).toEqual(["https://example.com/"]);

	});

	it("should report malformed URLs", async () => {

		await expect(items(["/relative"])(crawl(() => undefined))(toArray())).rejects.toThrow(TypeError);

	});

	it("should drain the seeds before descending", async () => {

		// descending eagerly would emit ["/a", "/p", "/x"]

		const values = await items([href("/a"), href("/x")])(crawl(walker({ "/a": ["/p"] })))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/x", "/p"].map(href));

	});

	it("should emit the seeds before the source is drained", async () => {

		let walks = 0;

		const seeds = items((async function* () {
			for (let i = 0; true; i++) { yield href(`/s${i}`); }
		})());

		const values = await seeds(crawl(() => {

			walks++;

			return undefined;

		}))(take(2))(toArray());

		expect(hrefs(values)).toEqual(["/s0", "/s1"].map(href));
		expect(walks).toBe(0); // the descent never starts, as the source is never exhausted

	});

	it("should treat an undefined walk as a leaf", async () => {

		const values = await items([href("/a")])(crawl(walker({ "/a": ["/b"] })))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b"].map(href));

	});

	it("should expand every data shape the walker returns", async () => {

		const shapes: Record<string, Source<Awaitables<string | URL>>> = {
			"/a": [href("/b")],
			"/b": new Set([new URL(href("/c"))]),
			"/c": items([href("/d")]),
			"/d": (async function* () { yield href("/e"); })(),
			"/e": Promise.resolve([href("/f")]),
			"/f": undefined
		};

		const values = await items([href("/a")])(crawl(url => shapes[url.pathname]))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b", "/c", "/d", "/e", "/f"].map(href));

	});

	it("should support asynchronous walkers", async () => {

		const values = await items([href("/a")])(crawl(async url => walker(graph)(url)))(toArray());

		expect(hrefs(values)).toEqual(["/a", "/b", "/c", "/d", "/e"].map(href));

	});

	it("should close the source when the stream is closed early", async () => {

		let closed = false;

		const seeds = items((async function* () {
			try {
				yield href("/a");
				yield href("/b");
			} finally {
				closed = true;
			}
		})());

		const values = await seeds(crawl(() => undefined))(take(1))(toArray());

		expect(hrefs(values)).toEqual([href("/a")]);
		expect(closed).toBe(true);

	});


	describe("with a feeder and a mapper", () => {

		it("should emit the mapped results in level order", async () => {

			const values = await items([href("/a")])(crawl(feeder, links, title))(toArray());

			expect(values).toEqual(["A", "B", "C", "D"]);

		});

		it("should feed every crawled URL once", async () => {

			const fed: string[] = [];

			const values = await items([href("/a")])(crawl(url => {

				fed.push(url.pathname);

				return feeder(url);

			}, links, title))(toArray());

			expect(fed).toEqual(["/a", "/b", "/c", "/d"]); // `/d` converges from `/b` and `/c`, but is fed once
			expect(values).toEqual(["A", "B", "C", "D"]);

		});

		it("should skip URLs the feeder states nothing for", async () => {

			const values = await items([href("/a"), href("/missing")])(crawl(feeder, links, title))(toArray());

			expect(values).toEqual(["A", "B", "C", "D"]);

		});

		it("should emit the seed results before descending", async () => {

			// descending eagerly would emit ["A", "B", "C", "D"]

			const values = await items([href("/a"), href("/d")])(crawl(feeder, links, title))(toArray());

			expect(values).toEqual(["A", "D", "B", "C"]);

		});

		it("should expand every data shape the mapper returns", async () => {

			const shapes: Record<string, Source<string | Awaitables<string>>> = {
				"/a": "A",
				"/b": ["B"],
				"/c": Promise.resolve(new Set(["C"])),
				"/d": undefined
			};

			const values = await items([href("/a")])(crawl(feeder, links, page => shapes[page.path]))(toArray());

			expect(values).toEqual(["A", "B", "C"]);

		});

		it("should crawl URLs contributing no result", async () => {

			const values = await items([href("/a")])(crawl(feeder, links, page => page.path === "/d" ? "D" : undefined))
			(toArray());

			expect(values).toEqual(["D"]);

		});

		it("should support asynchronous steps", async () => {

			const values = await items([href("/a")])(crawl(
				async url => feeder(url),
				async page => links(page),
				async page => title(page)
			))(toArray());

			expect(values).toEqual(["A", "B", "C", "D"]);

		});

	});

});
