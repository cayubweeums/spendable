export type CategoryRule = {
  contains: string;
  category: string;
  tag?: string;
};

export function normalizeContains(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();
}

export function matchingRule(description: string, rules: CategoryRule[]): CategoryRule | null {
  const hay = description.toLowerCase();
  let best: CategoryRule | null = null;
  for (const rule of rules) {
    const needle = rule.contains.trim().toLowerCase();
    if (needle.length < 2 || !hay.includes(needle)) continue;
    if (!best || needle.length > best.contains.length) best = rule;
  }
  return best;
}

export function categoryFor(description: string, rules: CategoryRule[]): string | null {
  return matchingRule(description, rules)?.category ?? null;
}
