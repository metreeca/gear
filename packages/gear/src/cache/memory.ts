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

import { type Bucket, createMemoryBucket } from "@metreeca/core/bucket";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a memory cache.
 *
 * Values are held in the process heap, so that content is cached with no external service and no setup, at the price
 * of being confined to the process that stored it and lost when that process exits: caches created apart hold their
 * content apart, however alike they were set up.
 *
 * Called with no options, the cache retains every value for the life of the process; given a time to live, values left
 * unused for longer are dropped; given a byte budget, values beyond it are dropped in least recently used order, so
 * that a long-running job neither keeps serving content the source has since moved on from nor exhausts the heap.
 *
 * @param options The cache options, all optional
 * @param options.ttl The number of milliseconds a value is retained for after its last use, dropping it once they
 *                    elapse; a value less than or equal to `0` retains values indefinitely, as the default does
 * @param options.bytes The total number of value bytes to be retained, dropping the least recently used values beyond
 *                      that; a value less than or equal to `0` leaves the cache unbounded, as the default does
 *
 * @returns A fresh, immutable {@link Bucket} holding values in the process heap, as {@link createMemoryBucket} defines
 *
 * @group Implementations
 */
export function createMemoryCache(options?: {

	readonly ttl?: number
	readonly bytes?: number

}): Bucket {

	return createMemoryBucket(options);

}
