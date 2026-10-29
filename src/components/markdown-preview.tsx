"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeHref } from "@/lib/urls";
import type { NoteDetail } from "@/lib/client-types";
import { MarkdownCode } from "@/components/markdown-code";
import { handleCodeCopy, preventCodeCopyFocus } from "@/lib/copy-code";

interface MarkdownPreviewProps {
	content: string;
	wikilinks: NoteDetail["wikilinks"];
}

export function convertWikilinks(content: string, wikilinks: NoteDetail["wikilinks"]): string {
	const linksByTitle = new Map(wikilinks.map((link) => [link.rawTargetTitle, link]));
	return content.replace(/\[\[([^\]\r\n]+)\]\]/g, (_match, raw: string) => {
		const target = raw.trim();
		const resolved = linksByTitle.get(target);
		if (!target) return "\\[\\[\\]\\]";
		if (!resolved?.targetNoteId) {
			return `\`[[${target.replace(/`/g, "'")}]]\``;
		}
		const label = target.replace(/([\\[\]])/g, "\\$1");
		return `[${label}](/notes/${encodeURIComponent(resolved.targetNoteId)})`;
	});
}

export function MarkdownPreview({ content, wikilinks }: MarkdownPreviewProps) {
	const converted = convertWikilinks(content, wikilinks);

	return (
		<div
			className="preview-content"
			onPointerDown={preventCodeCopyFocus}
			onMouseDown={preventCodeCopyFocus}
			onClick={handleCodeCopy}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					code: MarkdownCode,
					a: ({ href, children }) =>
						href?.startsWith("/notes/") ? (
							<Link href={href}>{children}</Link>
						) : (
							<a
								href={href ? (normalizeHref(href) ?? undefined) : undefined}
								target="_blank"
								rel="noreferrer"
							>
								{children}
							</a>
						),
				}}
			>
				{converted}
			</ReactMarkdown>
		</div>
	);
}
