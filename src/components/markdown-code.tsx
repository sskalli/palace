import type { ComponentProps } from "react";
import { CLIPBOARD_ICON_PATH } from "@/lib/copy-code";

/** Event delegation also works for the live editor's static Markdown markup. */
export function MarkdownCode({
	children,
	className,
	copyable = true,
}: ComponentProps<"code"> & { copyable?: boolean }) {
	if (!copyable) return <code className={className}>{children}</code>;
	return (
		<span className="code-snippet">
			<code className={className}>{children}</code>
			<button
				type="button"
				className="code-copy-button"
				data-copy-code=""
				aria-label="Copy code"
				title="Copy code"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.8}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					focusable="false"
				>
					<path d={CLIPBOARD_ICON_PATH} />
				</svg>
			</button>
		</span>
	);
}
