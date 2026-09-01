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

import type { Bucket } from "@metreeca/core/bucket";
import { immutable } from "@metreeca/core/structures";
import { createHash, randomUUID } from "node:crypto";
import { openAsBlob, type Stats } from "node:fs";
import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { service } from "../index.js";
import { getPath } from "../space/index.js";


/**
 * The path of the folder holding the stored values, unless the cache states one of its own.
 */
const DefaultPath = "cache";

/**
 * The name of a file holding a stored value.
 */
const EntryPattern = /^[\da-f]{64}$/;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a file cache.
 *
 * Values are held as files under a folder of the {@link space working space}, so that content outlives the process
 * that stored it and is shared by every job anchored to the same space: a run repeated over the same keys is served
 * from the file system rather than from the source the content was taken from.
 *
 * Called with no options, the cache retains every value until it is removed; given a time to live, values left unused
 * for longer are dropped; given a byte budget, values beyond it are dropped in least recently used order, so that a
 * cache left in place neither keeps serving content the source has since moved on from nor grows without bound.
 *
 * Every `get` and `put` counts as a use, restarting the time to live of the value and making it the most recently
 * used one: a value is dropped only once left untouched for a whole time to live, or once every other retained value
 * has been used more recently. Retention is enforced on access rather than on a timer, so an expired value is never
 * handed out, and the room it held, like the room freed by a removal, is reclaimed on the next `get` or `put` under
 * any key.
 *
 * @param options The cache options, all optional
 * @param options.path The path of the folder holding the stored values, resolved against the base path of the
 *                     execution the cache is created in, as {@link getPath} defines; defaults to `cache`
 * @param options.ttl The number of milliseconds a value is retained for after its last use, dropping it once they
 *                    elapse; a value less than or equal to `0` retains values indefinitely, as the default does
 * @param options.bytes The total number of value bytes to be retained, dropping the least recently used values beyond
 *                      that, a value exceeding the budget on its own included; a value less than or equal to `0`
 *                      leaves the cache unbounded, as the default does
 *
 * @returns A fresh, immutable {@link Bucket} holding values as files under `options.path`
 *
 * @throws {Error} If created outside an execution, as {@link service} defines
 *
 * @throws {Error} While storing or retrieving a value, if the folder holding the cache is not accessible or is a
 *                 plain file
 *
 * @see {@link https://nodejs.org/api/fs.html Node.js `fs`}
 *
 * @group Implementations
 */
export function createFileCache({

	path,

	ttl,
	bytes

}: {

	readonly path?: string

	readonly ttl?: number
	readonly bytes?: number

} = {}): Bucket {

	/**
	 * A stored value, as found by a scan of the cache folder.
	 */
	type Entry = {

		readonly target: string
		readonly size: number
		readonly used: number

	};


	const home = service(getPath);

	const folder = resolve(home, path ?? DefaultPath);
	const lease = ttl ?? 0; // a non-positive time to live retains values indefinitely
	const budget = bytes ?? 0; // a non-positive budget leaves the cache unbounded

	// the earliest moment a retained value may expire, standing in for the scan that would look for one: a deadline
	// only moves later behind our back, as a value added after the last scan is younger than the ones it saw and a
	// use pushes its own deadline forward, so nothing expires while the clock is short of it

	let deadline = 0;


	return immutable({

		async get(key) {

			await purge();

			const target = entry(key);
			const stats = await status(target);

			if ( stats === undefined ) {

				return undefined;

			} else {

				const now = new Date();

				await utimes(target, now, stats.mtime); // count the retrieval as a use, restarting the time to live

				return (await openAsBlob(target)).stream();

			}

		},

		async put(key, value) {

			await mkdir(folder, { recursive: true });

			const target = entry(key);
			const staging = `${target}.${randomUUID()}`;

			try {

				await writeFile(staging, value);
				await rename(staging, target);

				const now = new Date();

				await utimes(target, now, now);

				deadline = Math.min(deadline, now.getTime()+lease); // the stored value may expire before the others

			} catch ( error ) {

				await rm(staging, { force: true });

				throw error;

			}

			await evict();

		},

		async delete(key) {

			await rm(entry(key), { force: true });

		}

	});


	function entry(key: string): string {

		return join(folder, createHash("sha256").update(key).digest("hex"));

	}


	async function purge(): Promise<void> {

		const now = Date.now();

		if ( lease > 0 && now >= deadline ) { // scan only once a retained value may have expired

			const entries = await scan();

			const expired = entries.filter(({ used }) => now-used >= lease);
			const retained = entries.filter(({ used }) => now-used < lease);

			await Promise.all(expired.map(({ target }) => rm(target, { force: true })));

			deadline = retained.reduce((earliest, { used }) => Math.min(earliest, used), Infinity)+lease;

		}

	}

	async function evict(): Promise<void> {

		await purge(); // free the room held by expired values before charging live ones against the budget

		if ( budget > 0 ) {

			const initial: { readonly retained: number, readonly doomed: readonly string[] } = {
				retained: 0, doomed: []
			};

			const { doomed } = [...await scan()]

				.sort((x, y) => y.used-x.used) // scan in most recently used order

				.reduce(({ retained, doomed }, { target, size }) => {

					const running = retained+size;

					return running > budget
						? { retained: running, doomed: [...doomed, target] }
						: { retained: running, doomed };

				}, initial);

			await Promise.all(doomed.map(target => rm(target, { force: true })));

		}

	}


	async function scan(): Promise<readonly Entry[]> {

		const names = await list();

		const entries = await Promise.all(names.filter(name => EntryPattern.test(name)).map(async name => {

			const target = join(folder, name);
			const stats = await status(target);

			return stats === undefined ? undefined : { target, size: stats.size, used: stats.atimeMs };

		}));

		return entries.filter(entry => entry !== undefined);

	}

	async function list(): Promise<readonly string[]> {

		try {

			return await readdir(folder);

		} catch ( error ) {

			if ( missing(error) ) {

				return []; // a cache that was never written to holds nothing

			} else {

				throw error;

			}

		}

	}

	async function status(target: string): Promise<undefined | Stats> {

		try {

			return await stat(target);

		} catch ( error ) {

			if ( missing(error) ) {

				return undefined;

			} else {

				throw error;

			}

		}

	}


	function missing(error: unknown): boolean {

		return error instanceof Error && "code" in error && error.code === "ENOENT";

	}

}
