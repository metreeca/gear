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

import { createThrottle, type Throttle } from "@metreeca/core/async";
import { pipe, type Task } from "@metreeca/flow";
import { items } from "@metreeca/flow/feeds";
import { toArray } from "@metreeca/flow/sinks";
import { concurrent, flatMap } from "@metreeca/flow/tasks";
import { crawl } from "./crawl.js";


/**
 * Retrieves the item pages of a paginated product catalogue.
 *
 * The crawl navigates the pagination graph alone, over URIs rather than over the pages they stand for, so that
 * converging links are rejected before a request is spent on them and cycles between index pages terminate. Listing
 * is not navigation and stays out of the crawl: item links fan out from each index page through a `flatMap`.
 *
 * `retrieve` caches by URI, so each page is requested once however many times the pipeline retrieves it.
 *
 * @returns A promise resolving to the retrieved item pages
 */
export function catalogue(): Promise<readonly Document[]> {

	// one budget and one cache for every request the pipeline issues: 32 in flight at most, no more than 4 a second

	const retrieve = concurrent(32, fetch(createThrottle({ minimum: 1000/4 })));

	return pipe(
		(items("https://example.com/products/"))

		(crawl(uri => pipe( // from an index page, the index pages it paginates to
			(items(uri))
			(retrieve)
			(flatMap(page => links(page, ".pagination a")))
		)))

		(retrieve) // the index pages again, from the cache
			(flatMap(page => links(page, ".entry a"))) // the item links it lists
			(retrieve) // every item page, requested once

			(toArray())
	);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a task retrieving the document at a URI, pacing requests through a throttle and caching them by URI.
 */
function fetch(throttle: Throttle): Task<string, Document> {
	throw new Error(";( to be implemented"); // !!!
}

/**
 * Extracts the absolute URIs the anchors matching a selector link to.
 */
function links(page: Document, selector: string): readonly string[] {
	return Array.from(page.querySelectorAll<HTMLAnchorElement>(selector), anchor => anchor.href);
}
