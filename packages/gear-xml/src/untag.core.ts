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
import { escape } from "@metreeca/core/strings";
import type { AnyNode, Element, NodeWithChildren } from "domhandler";
import { hasChildren, isTag, isText } from "domhandler";
import { DomUtils } from "htmlparser2";
import { normalize, titled } from "./index.core.js";


/**
 * The indentation each enclosing list beyond the outermost adds to an item.
 */
const Indent = "  ";


/**
 * The text assembled from a tree.
 */
type Buffer = {

	/**
	 * The text assembled so far.
	 */
	readonly text: string;

	/**
	 * A space withheld until content is written after it, so that trailing whitespace never reaches the text.
	 */
	readonly space: boolean;

	/**
	 * The number of lists enclosing the content being written.
	 */
	readonly level: number;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Converts a markup tree to markdown text.
 *
 * Renders the content of an X/HTML tree as plain text, keeping as markdown the structure a reader relies on and
 * dropping the presentation the markup carries around it, so that a page is handed to a consumer reading text rather
 * than markup, a language model among them.
 *
 * Elements are rendered as follows, names matched as the tree carries them, case insensitively:
 *
 * - `h1`, `h2`, `h3` — a heading of the matching level, closed by a blank line
 * - `p`, `div`, `section`, `article` — the content, closed by a blank line
 * - `ul`, `ol` — a list set off from the surrounding content by a blank line, ordered lists marked as unordered ones
 * - `li` — an item marked with `-`, indented by two spaces for each enclosing list beyond the outermost
 * - `br` — a line break
 * - `hr` — a thematic break, closed by a blank line
 * - `a` — a link to the `href` stated, labelled by the content
 * - `img` — an image reference to the `src` stated, labelled by the `alt` text
 * - `strong`, `b` — strong emphasis
 * - `em`, `i` — emphasis
 * - `script` — a fenced `json` block, if the type is `application/ld+json`, closed by a blank line; nothing otherwise
 * - `head`, `style`, `title` — nothing, the title being stated by the frontmatter instead
 *
 * Every other element contributes its content, the `html` and `body` a page is wrapped in among them, so that the
 * wrappers a page is built from leave no trace of their own.
 *
 * Character data is rendered with runs of spaces, control characters and typographic separators, the no-break space
 * among them, collapsed to a single space, whatever the markup lays out; a run bordering a text node is kept, so that
 * emphasis misplaced with respect to the surrounding spaces doesn't run words together.
 *
 * Where the tree states a title, the rendering opens with a YAML frontmatter block stating it, so that a consumer
 * reads the page the text belongs to alongside the text itself. The title is the first `title` element the tree states
 * outside the framing a reader is not after, so that the caption of an embedded object is not mistaken for it, and it
 * is written as a quoted scalar, so that the punctuation a headline carries doesn't unsettle the block. Where the tree
 * states no title, or one carrying no text, the rendering opens with the content.
 *
 * @param node The root of the tree to convert; a document is converted as the sequence of the trees its children root
 *
 * @returns The markdown rendering of the content of the tree rooted at `node`, opened by a frontmatter block stating
 *          its title where it states one and stripped of leading and trailing whitespace; empty if the tree holds
 *          neither content nor a title
 *
 * @see {@link https://spec.commonmark.org/ CommonMark Spec}
 * @see {@link https://json-ld.org/ JSON-LD}
 */
export function process(node: AnyNode): Markdown {

	const title = titled(node);
	const body = format({ text: "", space: false, level: 0 }, node).text.trim();

	return title === undefined ? body : `---\ntitle: "${ escape(plain(title)) }"\n---\n\n${ body }`.trim();


	function format(buffer: Buffer, node: AnyNode): Buffer {
		return isTag(node) ? tag(buffer, node)
			: isText(node) ? append(buffer, normalize(node.data)) // bordering whitespace kept, lest words run together
				: hasChildren(node) ? children(buffer, node)
					: buffer; // comments, doctypes and processing instructions carry no content
	}

	function children(buffer: Buffer, node: NodeWithChildren): Buffer {
		return node.children.reduce(format, buffer);
	}

	function tag(buffer: Buffer, element: Element): Buffer {
		switch ( element.name.toLowerCase() ) {

			case "h1":

				return feed(append(buffer, "# ", plain(element)));

			case "h2":

				return feed(append(buffer, "## ", plain(element)));

			case "h3":

				return feed(append(buffer, "### ", plain(element)));

			case "p":
			case "div":
			case "section":
			case "article":

				return feed(children(buffer, element));

			case "ul":
			case "ol":

				return outdent(feed(children(indent(buffer), element)));

			case "li":

				return wrap(children(append(margin(wrap(buffer)), "- "), element));

			case "br":

				return wrap(buffer);

			case "hr":

				return feed(append(buffer, "---"));

			case "a":

				return append(children(append(buffer, "["), element), "](", attribute(element, "href"), ")");

			case "img":

				return append(buffer, "![", normalize(attribute(element, "alt").trim()), "](", attribute(element, "src"), ")");

			case "strong":
			case "b":

				return append(buffer, "**", plain(element), "**");

			case "em":
			case "i":

				return append(buffer, "*", plain(element), "*");

			case "script": // JSON-LD metadata is content, whatever else a script carries is not

				return attribute(element, "type") === "application/ld+json"
					? feed(append(buffer, "```json\n", plain(element), "\n```"))
					: buffer;

			case "head":
			case "style":
			case "title": // stated by the frontmatter instead

				return buffer;

			default:

				return children(buffer, element);

		}
	}


	function append(buffer: Buffer, ...strings: readonly string[]): Buffer {

		return [...strings.join("")].reduce(write, buffer);

		function write({ text, space, level }: Buffer, char: string): Buffer {
			return char === " " || char === "\t" ? { text, space: true, level } // withheld until content follows it
				: char === "\r" ? { text, space: false, level }
					: char === "\n" ? { text: `${text}\n`, space: false, level }
						: { text: space ? `${text} ${char}` : `${text}${char}`, space: false, level };
		}

	}

	function feed(buffer: Buffer): Buffer {

		// closed by a blank line, unless the text already ends with one

		const { text, level } = wrap(buffer);

		return { text: text.length > 2 && text.charAt(text.length - 2) !== "\n" ? `${text}\n` : text, space: false, level };

	}

	function wrap({ text, level }: Buffer): Buffer {
		return { text: text.length > 1 && !text.endsWith("\n") ? `${text}\n` : text, space: false, level };
	}

	function indent(buffer: Buffer): Buffer { // the outermost list opens a block of its own
		return { ...(buffer.level === 0 ? feed(buffer) : buffer), level: buffer.level + 1 };
	}

	function outdent(buffer: Buffer): Buffer {
		return { ...buffer, level: buffer.level - 1 };
	}

	function margin({ text, space, level }: Buffer): Buffer { // written as it is, as whitespace is otherwise withheld
		return { text: `${text}${Indent.repeat(Math.max(level - 1, 0))}`, space, level };
	}


	function plain(element: Element): string {
		return normalize(DomUtils.textContent(element).trim());
	}

	function attribute(element: Element, name: string): string {
		return element.attribs[name] ?? "";
	}

}
