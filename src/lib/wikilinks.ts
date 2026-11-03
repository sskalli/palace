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

export interface WikilinkMatch {
	index: number;
	end: number;
	raw: string;
}

/**
 * Matches the original [[([^\]\r\n]+)]] grammar without backtracking.
 * A failed opener and all nested openers before its first ], CR or LF share
 * the same failing terminator, so they can be skipped together. Each source
 * character is inspected at most twice, including malformed runs of '['.
 */
export function* scanWikilinks(markdown: string): Generator<WikilinkMatch> {
	let cursor = 0;
	while (cursor < markdown.length) {
		const index = markdown.indexOf("[[", cursor);
		if (index < 0) return;
		const start = index + 2;
		let end = start;
		while (end < markdown.length && markdown[end] !== "]" && markdown[end] !== "\r" && markdown[end] !== "\n")
			end++;
		if (end === markdown.length) return;
		if (end > start && markdown[end] === "]" && markdown[end + 1] === "]") {
			yield { index, end: end + 2, raw: markdown.slice(start, end) };
			cursor = end + 2;
		} else {
			cursor = end + 1;
		}
	}
}

export function replaceWikilinks(markdown: string, replace: (raw: string) => string): string {
	const chunks: string[] = [];
	let cursor = 0;
	for (const match of scanWikilinks(markdown)) {
		chunks.push(markdown.slice(cursor, match.index), replace(match.raw));
		cursor = match.end;
	}
	chunks.push(markdown.slice(cursor));
	return chunks.join("");
}

export function parseWikilinkTargets(markdown: string): string[] {
	const targets = new Set<string>();
	for (const { raw } of scanWikilinks(markdown)) {
		const target = raw.trim();
		if (target) targets.add(target);
	}
	return [...targets];
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
