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
import { hasChildren, isComment, isTag, isText } from "domhandler";
import { DomUtils } from "htmlparser2";
import { name, normalize, titled } from "./index.core.js";
import { base } from "./xpath.core.js";


/**
 * The indentation each enclosing list beyond the outermost adds to an item.
 */
const Indent = "  ";

/**
 * The elements standing for none of the content a link or an item is read by.
 *
 * Lists the elements rendered as nothing, alongside the scripts a JSON-LD block is drawn from, which state metadata
 * rather than the label a reader sees.
 */
const Unseen = new Set([ "head", "style", "title", "script" ]);


/**
 * The text assembled from a tree.
 */
type Buffer = {

	/**
	 * The text assembled so far.
	 */
	readonly text: string;

	/**
	 * A space withheld until content is written after it on the same line, so that whitespace neither trails the
	 * content nor opens a line.
	 */
	readonly space: boolean;

	/**
	 * The number of lists enclosing the content being written.
	 */
	readonly level: number;

	/**
	 * Whether the line holds the marker of an item and no content yet, so that the content of an item opens on the
	 * line its marker was written on, however the item lays it out.
	 */
	readonly item: boolean;

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
 * that the whitespace a page is laid out with doesn't reach the text.
 *
 * Where the tree states a title or a base URL, the rendering opens with a YAML frontmatter block stating them as
 * `title` and `url`, so that a consumer reads the page the text belongs to alongside the text itself. Each is written
 * as a quoted scalar, so that the punctuation a headline or a query string carries doesn't unsettle the block, and a
 * field is omitted where the tree states no value for it, so that nothing is guessed at.
 *
 * The title is the first `title` element the tree states outside the framing a reader is not after, so that the
 * caption of an embedded object is not mistaken for it; one carrying no text counts as none. The base URL is the one
 * recorded by the root of the tree, that is by the root element the tree is converted from or by the first one a
 * document holds; a base resolving to no absolute URL, as a relative reference standing on its own does, counts as
 * none.
 *
 * @param node The root of the tree to convert; a document is converted as the sequence of the trees its children root
 *
 * @returns The markdown rendering of the content of the tree rooted at `node`, opened by a frontmatter block stating
 *          its title and base URL where it states them and stripped of leading and trailing whitespace; empty if the
 *          tree holds neither content nor either of them
 *
 * @see {@link https://spec.commonmark.org/ CommonMark Spec}
 * @see {@link https://json-ld.org/ JSON-LD}
 * @see {@link https://www.w3.org/TR/xmlbase/ XML Base}
 */
export function process(node: AnyNode): Markdown {

	const title = titled(node);
	const url = located(node);
	const body = format({ text: "", space: false, level: 0, item: false }, node).text.trim();

	const front = [
		...(title === undefined ? [] : [ `title: "${ escape(plain(title)) }"` ]),
		...(url === undefined ? [] : [ `url: "${ escape(url.href) }"` ])
	];

	return front.length === 0 ? body : `---\n${ front.join("\n") }\n---\n\n${ body }`.trim();


	function located(node: AnyNode): undefined | URL { // the base recorded by the root of the tree
		return isTag(node) ? base(node)
			: hasChildren(node) ? node.children.filter(isTag).map(base).find(url => url !== undefined)
				: undefined;
	}

	function format(buffer: Buffer, node: AnyNode): Buffer {
		return isTag(node) ? tag(buffer, node)
			: isText(node) ? append(buffer, normalize(node.data)) // bordering whitespace kept, lest words run together
				: isComment(node) ? { ...buffer, space: true } // a boundary stated by the markup, likewise
					: hasChildren(node) ? children(buffer, node)
						: buffer; // doctypes and processing instructions carry no content
	}

	function children(buffer: Buffer, node: NodeWithChildren): Buffer {
		return node.children.reduce((buffer, child, index) => {

			const previous = node.children[index-1];

			// elements stated side by side are kept apart, as a comment between them would; text bordering an element
			// is left as it stands, lest a word split across the two be broken apart

			return format(previous !== undefined && isTag(previous) && isTag(child)
				? { ...buffer, space: true }
				: buffer, child
			);

		}, buffer);
	}

	function tag(buffer: Buffer, element: Element): Buffer {
		switch ( element.name.toLowerCase() ) {

			case "h1":

				return heading(buffer, element, "#");

			case "h2":

				return heading(buffer, element, "##");

			case "h3":

				return heading(buffer, element, "###");

			case "p":
			case "section":
			case "article":

				return block(buffer, buffer => children(buffer, element));

			case "div":

				return paragraph(element)
					? block(buffer, buffer => children(buffer, element))
					: wrap(children(buffer, element));

			case "ul":
			case "ol":

				return list(buffer, buffer => children(buffer, element));

			case "li":

				return rendered(element)
					? wrap(children({ ...append(margin(wrap(buffer)), "- "), item: true }, element))
					: buffer;

			case "br":

				return split(buffer);

			case "hr":

				return block(buffer, buffer => append(buffer, "---"));

			case "a":

				return rendered(element)
					? append(clip(children(append(buffer, "["), element)), "](", attribute(element, "href"), ")")
					: buffer;

			case "img":

				return append(buffer, "![", normalize(attribute(element, "alt").trim()), "](", attribute(element, "src"), ")");

			case "strong":
			case "b":

				return emphasis(buffer, element, "**");

			case "em":
			case "i":

				return emphasis(buffer, element, "*");

			case "script": // JSON-LD metadata is content, whatever else a script carries is not

				return attribute(element, "type") === "application/ld+json"
					? block(buffer, buffer => append(buffer, "```json\n", plain(element), "\n```"))
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

		function write(buffer: Buffer, char: string): Buffer {

			const { text, space } = buffer;

			return char === " " || char === "\t" ? { ...buffer, space: true } // withheld until content follows it
				: char === "\r" ? { ...buffer, space: false }
					: char === "\n" ? { ...buffer, text: `${text}\n`, space: false }
						: {
							...buffer,
							text: space && !opening(text) ? `${text} ${char}` : `${text}${char}`,
							space: false,
							item: false // the line has taken the content its marker opened it for
						};

		}

		function opening(text: string): boolean { // no space is written where a line has yet to take content
			const last = text.charAt(text.length - 1);
			return last === "" || last === "\n" || last === " ";
		}

	}

	function block(buffer: Buffer, content: (buffer: Buffer) => Buffer): Buffer { // set off on both sides
		return feed(content(feed(buffer)));
	}

	function clip(buffer: Buffer): Buffer { // a space trailing the content is dropped, not written before its close
		return { ...buffer, space: false };
	}

	// a line opening an item is left as it stands, so that the content of the item lands on it rather than below it

	function feed(buffer: Buffer): Buffer { // closed by a blank line, unless the text already ends with one
		return buffer.item ? buffer : padded(wrap(buffer));
	}

	function padded(buffer: Buffer): Buffer {

		const { text } = buffer;

		return { ...buffer, text: text.length > 2 && text.charAt(text.length - 2) !== "\n" ? `${text}\n` : text };

	}

	function wrap(buffer: Buffer): Buffer {

		const { text } = buffer;

		return buffer.item ? buffer
			: { ...buffer, text: text.length > 1 && !text.endsWith("\n") ? `${text}\n` : text, space: false };

	}

	function split(buffer: Buffer): Buffer { // saturating at the blank line two breaks lay down

		const { text } = buffer;

		return buffer.item ? buffer
			: { ...buffer, text: text.length > 0 && !text.endsWith("\n\n") ? `${text}\n` : text, space: false };

	}

	function list(buffer: Buffer, content: (buffer: Buffer) => Buffer): Buffer {

		const { level } = buffer;

		// the outermost list opens a block of its own

		const opened = { ...(level === 0 ? feed(buffer) : buffer), level: level + 1 };

		return { ...feed(content(opened)), level };

	}

	function margin(buffer: Buffer): Buffer { // written as it is, as whitespace is otherwise withheld

		const { text, level } = buffer;

		return buffer.item ? buffer : { ...buffer, text: `${text}${Indent.repeat(Math.max(level - 1, 0))}` };

	}


	function paragraph(element: Element): boolean { // a field of its own, rather than a wrapper laying other fields out

		const content = element.children.filter(node => !isText(node) || node.data.trim().length > 0);

		return content.some(isText) // text of its own, mixed with elements or not
			|| content.length === 1 && content.every(isTag); // a lone element standing in for the text

	}

	function heading(buffer: Buffer, element: Element, marker: string): Buffer {

		const content = plain(element);

		// a heading carrying no text leaves no marker behind

		return content === "" ? buffer : block(buffer, buffer => append(buffer, marker, " ", content));

	}

	function emphasis(buffer: Buffer, element: Element, marker: string): Buffer {

		const text = normalize(DomUtils.textContent(element));
		const content = text.trim();

		// whitespace bordering the content is written outside the markers, as CommonMark reads no emphasis from
		// markers padded with it; emphasis carrying no text leaves no markers behind, but stands for the space it holds

		return content === "" ? { ...buffer, space: buffer.space || text.length > 0 }
			: append(buffer,
				text.startsWith(" ") ? " " : "", marker, content, marker, text.endsWith(" ") ? " " : ""
			);

	}

	function rendered(element: Element): boolean {
		return element.children.some(function shown(node: AnyNode): boolean { // text and images are seen
			return isText(node) ? node.data.trim() !== ""
				: !isTag(node) ? false
					: name(node) === "img" ? true
						: Unseen.has(name(node)) ? false
							: node.children.some(shown);
		});
	}

	function plain(element: Element): string {
		return normalize(DomUtils.textContent(element).trim());
	}

	function attribute(element: Element, name: string): string {
		return element.attribs[name] ?? "";
	}

}
