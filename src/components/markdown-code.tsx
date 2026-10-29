import type { ComponentProps } from "react";

/** Event delegation also works for the live editor's static Markdown markup. */
export function MarkdownCode({ children, className }: ComponentProps<"code">) {
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
				Copy
			</button>
		</span>
	);
}
