export interface LinkCandidate {
	id: string;
	userId: string;
	title: string;
	archivedAt: Date | null;
}

export interface ResolvedLink {
	rawTargetTitle: string;
	targetNoteId: string | null;
}

export function parseWikilinkTargets(markdown: string): string[] {
	const targets = new Map<string, string>();
	const expression = /\[\[([^\]\r\n]+)\]\]/g;

	for (const match of markdown.matchAll(expression)) {
		const target = match[1].trim();
		if (target && !targets.has(target)) {
			targets.set(target, target);
		}
	}

	return [...targets.values()];
}

export function resolveWikilinkTargets(userId: string, targets: string[], candidates: LinkCandidate[]): ResolvedLink[] {
	return targets.map((rawTargetTitle) => {
		const matches = candidates.filter(
			(candidate) =>
				candidate.userId === userId && candidate.archivedAt === null && candidate.title === rawTargetTitle,
		);

		return {
			rawTargetTitle,
			targetNoteId: matches.length === 1 ? matches[0].id : null,
		};
	});
}
