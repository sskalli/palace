/** Copy without focusing a temporary input or changing the editor selection. */
export async function copyCode(button: HTMLButtonElement, text: string) {
	try {
		await navigator.clipboard.writeText(text);
		button.textContent = "Copied";
		button.setAttribute("aria-label", "Code copied");
	} catch {
		button.textContent = "Retry copy";
		button.setAttribute("aria-label", "Copy failed. Retry copying code");
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
