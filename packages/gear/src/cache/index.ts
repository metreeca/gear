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

/**
 * Bulk content caching.
 *
 * Holds bulk content under opaque keys, so that a job stores and retrieves whole values without committing to where
 * they live, whether in memory, on the file system or in a remote object storage service.
 *
 * @module
 *
 * @groupDescription Implementations
 *
 * Ready-made caches to be {@link index.bind bound} to {@link createCache} in place of the default one.
 */

import type { Bucket } from "@metreeca/core/bucket";
import { createMemoryCache } from "./memory.js";


/**
 * Creates the default cache.
 *
 * @returns A fresh, immutable {@link Bucket} holding content in the process heap, as {@link createMemoryCache} defines
 */
export function createCache(): Bucket {

	return createMemoryCache();

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export * from "./file.js";
export * from "./memory.js";
