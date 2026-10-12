export type LinkCandidate = {
  id: string;
  userId: string;
  title: string;
  archivedAt: Date | null;
};

export function parseWikilinks(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const title = match[1].trim();
    if (title) found.add(title);
  }
  return [...found];
}

export function resolveLinkTargets(
  userId: string,
  targets: string[],
  candidates: LinkCandidate[],
): Map<string, string> {
  const available = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (candidate.userId !== userId || candidate.archivedAt) continue;
    const key = candidate.title.trim().toLowerCase();
    if (!key) continue;
    available.set(key, [...(available.get(key) ?? []), candidate.id]);
  }

  const resolved = new Map<string, string>();
  for (const target of targets) {
    const ids = available.get(target.trim().toLowerCase()) ?? [];
    if (ids.length === 1) resolved.set(target, ids[0]);
  }
  return resolved;
}
