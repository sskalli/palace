export function normalizeTagName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function normalizeTagNames(names: string[]): string[] {
  return [...new Set(names.map(normalizeTagName).filter(Boolean))];
}
