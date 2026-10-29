export const CLIPBOARD_ICON_PATH =
	"M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9z";
export const CHECK_ICON_PATH = "m5 12 4 4L19 6";

export function setCodeCopyState(button: HTMLButtonElement, state: "ready" | "copied" | "failed") {
	const path = state === "copied" ? CHECK_ICON_PATH : CLIPBOARD_ICON_PATH;
	// Both paths are fixed application constants, never Markdown content.
	button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}" /></svg>`;
	const label =
		state === "copied" ? "Code copied" : state === "failed" ? "Copy failed. Retry copying code" : "Copy code";
	button.setAttribute("aria-label", label);
	button.title = label;
}

/** Copy without focusing a temporary input or changing the editor selection. */
export async function copyCode(button: HTMLButtonElement, text: string) {
	try {
		await navigator.clipboard.writeText(text);
		setCodeCopyState(button, "copied");
	} catch {
		setCodeCopyState(button, "failed");
	}
}

export function codeCopyButton(target: EventTarget | null) {
	return target instanceof Element ? target.closest<HTMLButtonElement>("button[data-copy-code]") : null;
}

export function handleCodeCopy(event: { target: EventTarget | null; preventDefault(): void; stopPropagation(): void }) {
	const button = codeCopyButton(event.target);
	if (!button) return false;
	event.preventDefault();
	event.stopPropagation();
	const code = button.parentElement?.querySelector("code");
	void copyCode(button, code?.textContent ?? "");
	return true;
}

export function preventCodeCopyFocus(event: {
	target: EventTarget | null;
	preventDefault(): void;
	stopPropagation(): void;
}) {
	if (!codeCopyButton(event.target)) return;
	event.preventDefault();
	event.stopPropagation();
}
