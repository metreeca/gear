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
import { process } from "./untag.core.js";


/**
 * Creates a markdown renderer.
 *
 * The generated task converts a feed of parsed X/HTML trees into a feed of markdown text, one rendering per tree, so
 * that a consumer reading prose, a language model among them, works on text rather than on markup.
 *
 * A tree holding neither content nor a title is converted to an empty string, so that renderings stay aligned with the
 * trees they were drawn from.
 *
 * Where a tree states a title, its rendering opens with a YAML frontmatter block stating it, so that a consumer reads
 * the page the text belongs to alongside the text itself. The title is the first `title` element the tree states
 * outside the framing a reader is not after, so that the caption of an embedded object is not mistaken for it, and it
 * is written as a quoted scalar, so that the punctuation a headline carries doesn't unsettle the block. Where a tree
 * states no title, or one carrying no text, its rendering opens with the content.
 *
 * Elements are rendered as follows, names matched as the tree carries them, case insensitively:
 *
 * - `h1`, `h2`, `h3` — a heading of the matching level, set off by a blank line, left out where it carries no text
 * - `p`, `section`, `article` — the content, set off by a blank line
 * - `div` — the content, set off by a blank line where the element states text of its own or wraps a lone element,
 *   whitespace aside, and closed by a line break otherwise, so that a field reads as a paragraph while the wrappers a
 *   page is laid out with don't split its content into blocks of their own
 * - `ul`, `ol` — a list set off from the surrounding content by a blank line, ordered lists marked as unordered ones
 * - `li` — an item marked with `-`, indented by two spaces for each enclosing list beyond the outermost, its content
 *   opening on the line the marker is written on, however the item lays it out, left out where it carries neither text
 *   nor an image
 * - `br` — a line break, two of them laying down the blank line a paragraph is often split with, a longer run
 *   saturating at that blank line and a run opening the text dropped
 * - `hr` — a thematic break, set off by a blank line
 * - `a` — a link to the `href` stated, labelled by the content, left out where it carries neither text nor an image
 * - `img` — an image reference to the `src` stated, labelled by the `alt` text
 * - `strong`, `b` — strong emphasis, the whitespace bordering the content written outside the markers, as markers
 *   padded with it read as text rather than as emphasis, left out where it carries no text, though the space it holds
 *   is kept
 * - `em`, `i` — emphasis, laid out as strong emphasis is
 * - `script` — a fenced `json` block, if the type is `application/ld+json`, set off by a blank line; nothing
 *   otherwise
 * - `head`, `style`, `title` — nothing, the title being stated by the frontmatter instead
 *
 * Every other element contributes its content, the `html` and `body` a page is wrapped in among them, so that the
 * wrappers a page is built from leave no trace of their own. A link or an item is kept for the content a reader is
 * shown, the caption a graphic states inside its own markup counting for nothing, so that a decorative link leaves no
 * empty label behind.
 *
 * Character data is rendered with runs of spaces, control characters and typographic separators, the no-break space
 * among them, collapsed to a single space, whatever the markup lays out; a run bordering a text node is kept, so that
 * emphasis misplaced with respect to the surrounding spaces doesn't run words together. A comment carries no text but
 * counts as a space, so that the markers a framework leaves between elements keep the words on either side apart, as
 * do the fields a page lays out side by side. Text bordering an element runs into it as stated, so that a word split
 * across an element and the text beside it is not broken apart. A space never opens a line or closes a link label, so
 * that the whitespace a page is laid out with doesn't reach the text; leading and trailing whitespace is stripped from
 * each rendering.
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
 *
 * @group Factories
 */
export function untag(): Task<AnyNode, Markdown> {

	return map(process);

}
