export function normalizeTagName(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTagNames(values: string[]): string[] {
	const names = new Map<string, string>();

	for (const value of values) {
		const name = value.trim().replace(/\s+/g, " ");
		const normalizedName = normalizeTagName(name);
		if (normalizedName && !names.has(normalizedName)) {
			names.set(normalizedName, name);
		}
	}

	return [...names.values()];
}
