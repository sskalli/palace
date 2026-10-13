/** Calls the app's JSON API. Throws an Error carrying the server message (or `fallback`) on failure. */
export async function api<T = unknown>(
	url: string,
	options: { method?: string; body?: unknown; fallback?: string } = {},
): Promise<T> {
	const { method = "GET", body, fallback = "The request could not be completed." } = options;
	const response = await fetch(url, {
		method,
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
				? payload.error
				: fallback;
		throw new Error(message);
	}
	return payload as T;
}

export function errorText(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/** Tells the sidebar to reload folders and tags. */
export function notifyNavigationChanged(): void {
	window.dispatchEvent(new CustomEvent("palace:navigation-changed"));
}

/** Asks the app shell to create a note. */
export function requestNewNote(): void {
	window.dispatchEvent(new CustomEvent("palace:new-note"));
}
