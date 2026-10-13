/**
 * Pure relevance scoring for public product search. Kept free of Prisma
 * so it can be unit-tested without a database.
 */

export interface SearchCandidate {
  name: string;
  brandName: string;
  skus: string[];
  description: string;
  isPopular: boolean;
  createdAt: Date;
}

const WEIGHTS = {
  nameExact: 100,
  namePrefix: 80,
  nameWordPrefix: 60,
  nameContains: 40,
  nameFuzzyToken: 30,
  skuExact: 70,
  skuPrefix: 50,
  brandExact: 45,
  brandContains: 25,
  descriptionContains: 10,
} as const;

export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function tokenize(s: string): string[] {
  const normalized = normalize(s);
  if (!normalized) return [];
  return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Levenshtein distance <= 1, bounded to single words. Tokens shorter than
 * 4 characters require an exact match — fuzz on short tokens produces too
 * many false positives (e.g. "ipd" fuzzy-matching "ipad").
 */
export function isFuzzyTokenMatch(token: string, word: string): boolean {
  if (token.length < 4) return token === word;
  if (token === word) return true;
  if (Math.abs(token.length - word.length) > 1) return false;

  const [shorter, longer] = token.length <= word.length ? [token, word] : [word, token];

  if (shorter.length === longer.length) {
    let mismatches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) mismatches++;
      if (mismatches > 1) return false;
    }
    return mismatches <= 1;
  }

  // longer has exactly one extra character — check if deleting one char from
  // longer aligns it with shorter.
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j++;
  }
  return true;
}

function nameBracketScore(query: string, name: string): number {
  if (name === query) return WEIGHTS.nameExact;
  if (name.startsWith(query)) return WEIGHTS.namePrefix;

  const words = name.split(' ');
  if (words.some((w) => w.startsWith(query))) return WEIGHTS.nameWordPrefix;
  if (name.includes(query)) return WEIGHTS.nameContains;
  return 0;
}

function tokenCoverageScore(queryTokens: string[], nameWords: string[]): number {
  if (queryTokens.length === 0) return 0;

  let matched = 0;
  for (const qt of queryTokens) {
    const hit = nameWords.some(
      (w) => w === qt || w.startsWith(qt) || isFuzzyTokenMatch(qt, w),
    );
    if (hit) matched++;
  }
  if (matched === 0) return 0;

  const coverage = matched / queryTokens.length;
  return WEIGHTS.nameFuzzyToken * coverage;
}

export function scoreProduct(query: string, candidate: SearchCandidate): number {
  const q = normalize(query);
  if (!q) return 0;

  const name = normalize(candidate.name);
  const brand = normalize(candidate.brandName);
  const description = normalize(candidate.description);
  const skus = candidate.skus.map((s) => normalize(s));
  const queryTokens = tokenize(q);
  const nameWords = name.split(' ').filter(Boolean);

  let score = 0;

  score += Math.max(nameBracketScore(q, name), tokenCoverageScore(queryTokens, nameWords));

  if (skus.some((sku) => sku === q)) {
    score += WEIGHTS.skuExact;
  } else if (skus.some((sku) => sku.startsWith(q))) {
    score += WEIGHTS.skuPrefix;
  }

  if (brand === q) {
    score += WEIGHTS.brandExact;
  } else if (brand.includes(q)) {
    score += WEIGHTS.brandContains;
  }

  if (description.includes(q)) {
    score += WEIGHTS.descriptionContains;
  }

  return score;
}

export function compareScored<T extends { score: number; isPopular: boolean; createdAt: Date }>(
  a: T,
  b: T,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}
