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

// !!! link resolution mechanics
//
// relative references extracted from a document resolve against its base URL, which is not the URL that was
// requested:
//
// - after a redirect, the document is the one the request landed on, so `Response.url` is the base, not the
//   requested URL; `Response.redirected` reports that the two differ, and only `redirect: "manual"` exposes the
//   intermediate hops
// - `Response.url` is empty for a synthesised `Response`, and resolving against an empty base throws rather than
//   yielding a wrong URL
// - in HTML, the first `<base href>` in tree order overrides the document URL, and is itself resolved against it;
//   ignoring it produces plausible but wrong absolute URLs rather than failures
// - in XML, `xml:base` overrides per element and inherits down the tree, so the base depends on where the
//   reference sits rather than being one document-wide value
