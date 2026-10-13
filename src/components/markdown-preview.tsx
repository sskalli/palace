"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NoteDetail } from "@/lib/client-types";

interface MarkdownPreviewProps {
  content: string;
  wikilinks: NoteDetail["wikilinks"];
}

export function MarkdownPreview({ content, wikilinks }: MarkdownPreviewProps) {
  const linksByTitle = new Map(
    wikilinks.map((link) => [link.rawTargetTitle, link]),
  );
  const converted = content.replace(/\[\[([^\]\r\n]+)\]\]/g, (_match, raw: string) => {
    const target = raw.trim();
    const resolved = linksByTitle.get(target);
    if (!target) return "\\[\\[\\]\\]";
    if (!resolved?.targetNoteId) {
      return `\`[[${target.replace(/`/g, "'")}]]\``;
    }
    const label = target.replace(/([\\[\]])/g, "\\$1");
    return `[${label}](/notes/${encodeURIComponent(resolved.targetNoteId)})`;
  });

  return (
    <div className="preview-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("/notes/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">{children}</a>
            ),
        }}
      >
        {converted}
      </ReactMarkdown>
    </div>
  );
}
