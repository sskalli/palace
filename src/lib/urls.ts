/** Resolves a user-written link target to something safe to open; scheme-less targets are external web URLs. */
export function normalizeHref(href: string): string | null {
	const value = href.trim();
	if (!value) return null;
	if (value.startsWith("/") || value.startsWith("#")) return value;
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
	if (scheme && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(value)) {
		return /^(https?|mailto):$/i.test(`${scheme[1]}:`) ? value : null;
	}
	return `https://${value}`;
}
