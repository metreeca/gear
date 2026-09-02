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

import type { Markdown } from "@metreeca/core/strings";
import type { Task } from "@metreeca/flow";
import { map } from "@metreeca/flow/tasks";
import type { AnyNode } from "domhandler";
import { markdown } from "./untag.core.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a markup converter.
 *
 * The generated task reads a feed of parsed X/HTML trees as a feed of markdown text, converting each tree on its own
 * and emitting the single rendering it yields, so that pages retrieved and parsed upstream are handed to a consumer
 * reading text rather than markup, a language model among them.
 *
 * A tree holding no content is converted to an empty string, so that renderings stay aligned with the trees they were
 * drawn from.
 *
 * Elements are rendered as follows, names matched as the tree carries them, case insensitively:
 *
 * - `h1`, `h2`, `h3` — a heading of the matching level, closed by a blank line
 * - `p`, `div`, `section` — the content, closed by a blank line
 * - `ul`, `ol` — a list set off from the surrounding content by a blank line, ordered lists marked as unordered ones
 * - `li` — an item marked with `-`, indented by two spaces for each enclosing list beyond the outermost
 * - `br` — a line break
 * - `hr` — a thematic break, closed by a blank line
 * - `a` — a link to the `href` stated, labelled by the content
 * - `img` — an image reference to the `src` stated, labelled by the `alt` text
 * - `strong`, `b` — strong emphasis
 * - `em`, `i` — emphasis
 * - `script` — a fenced `json` block, if the type is `application/ld+json`, closed by a blank line; nothing otherwise
 * - `head`, `style` — nothing
 *
 * Every other element contributes its content, so that the wrappers a page is built from leave no trace of their own.
 *
 * Character data is rendered with runs of spaces and control characters collapsed to a single space, whatever the
 * markup lays out; a run bordering a text node is kept, so that emphasis misplaced with respect to the surrounding
 * spaces doesn't run words together. Leading and trailing whitespace is stripped from each rendering.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each rendering is emitted as soon as its tree is drawn, so the feed produced runs dry as the
 * >   feed drawn from does and an endless source is read as long as it is consumed.
 * > - **Materialising**: a rendering is assembled in memory as its tree is walked, so peak memory use is about the
 * >   size of the largest tree rather than of the feed.
 * > - **Stateless**: every tree is converted on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * @returns A task converting a feed of parsed X/HTML trees into a feed of markdown text
 *
 * @throws {Error} While the feed is consumed, whatever the source reports while producing trees
 *
 * @see {@link https://spec.commonmark.org/ CommonMark Spec}
 * @see {@link https://json-ld.org/ JSON-LD}
 */
export function untag(): Task<AnyNode, Markdown> {

	return map((node: AnyNode) => markdown(node));

}
