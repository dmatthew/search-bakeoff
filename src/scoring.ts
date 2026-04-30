import type { SearchHit, SearchRecord } from "./types.js";

const EXACT_SCORE = 3_000_000_000;
const PREFIX_SCORE = 2_000_000_000;
const TOKEN_PREFIX_SCORE = 1_500_000_000;
const CONTAINS_SCORE = 1_000_000_000;
const FUZZY_SCORE = 750_000_000;

export function normalizeQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function recordToHit(record: SearchRecord): SearchHit {
  const hit: SearchHit = {
    id: record.id,
    displayName: record.displayName,
    primaryText: record.primaryText,
    secondaryText: record.secondaryText,
    kind: record.kind,
  };
  if (record.countryCode) hit.countryCode = record.countryCode;
  if (record.adminCode) hit.adminCode = record.adminCode;
  if (typeof record.latitude === "number") hit.latitude = record.latitude;
  if (typeof record.longitude === "number") hit.longitude = record.longitude;
  return hit;
}

function fuzzyDistanceLimit(token: string): number {
  if (token.length < 4) return 0;
  if (token.length <= 5) return 1;
  if (token.length <= 10) return 2;
  return 3;
}

function boundedEditDistance(left: string, right: string, max: number): number {
  if (Math.abs(left.length - right.length) > max) return max + 1;
  let previous: number[] = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const sub = left[i - 1] === right[j - 1] ? 0 : 1;
      const next = Math.min(
        (previous[j] ?? max + 1) + 1,
        (current[j - 1] ?? max + 1) + 1,
        (previous[j - 1] ?? max + 1) + sub,
      );
      current[j] = next;
      if (next < rowMin) rowMin = next;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[right.length] ?? max + 1;
}

function fuzzyTokenDistance(query: string, candidate: string, max: number): number {
  const full = boundedEditDistance(query, candidate, max);
  if (full <= max) return full;
  if (candidate.length <= query.length) return full;
  const minPrefix = Math.max(1, query.length - max);
  const maxPrefix = Math.min(candidate.length, query.length + max);
  let best = max + 1;
  for (let len = minPrefix; len <= maxPrefix; len += 1) {
    const distance = boundedEditDistance(query, candidate.slice(0, len), max);
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  return best;
}

function fuzzyTokenScore(record: SearchRecord, normalizedQuery: string): number {
  const max = fuzzyDistanceLimit(normalizedQuery);
  if (max === 0) return 0;
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const candidateTokens = Array.from(
    new Set(record.searchText.split(" ").filter(Boolean)),
  );
  let total = 0;
  for (const queryToken of queryTokens) {
    const tokenMax = fuzzyDistanceLimit(queryToken);
    if (tokenMax === 0) {
      const matched = candidateTokens.some((c) => c.startsWith(queryToken));
      if (!matched) return 0;
      continue;
    }
    let best = tokenMax + 1;
    for (const candidate of candidateTokens) {
      const distance = fuzzyTokenDistance(queryToken, candidate, tokenMax);
      if (distance < best) best = distance;
      if (best === 0) break;
    }
    if (best > tokenMax) return 0;
    total += best;
  }
  return FUZZY_SCORE - total * 10_000_000;
}

export function scoreRecord(record: SearchRecord, normalizedQuery: string): number {
  if (record.searchText === normalizedQuery) return EXACT_SCORE;
  if (record.searchText.startsWith(normalizedQuery)) return PREFIX_SCORE;
  const tokens = record.searchText.split(" ");
  if (tokens.some((token) => token.startsWith(normalizedQuery))) {
    return TOKEN_PREFIX_SCORE;
  }
  if (record.searchText.includes(normalizedQuery)) return CONTAINS_SCORE;
  return fuzzyTokenScore(record, normalizedQuery);
}

export function rerank(
  records: readonly SearchRecord[],
  query: string,
  limit: number,
): SearchHit[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  return records
    .map((record) => ({ record, score: scoreRecord(record, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.record.rank !== b.record.rank) return b.record.rank - a.record.rank;
      return a.record.displayName.localeCompare(b.record.displayName);
    })
    .slice(0, limit)
    .map((entry) => recordToHit(entry.record));
}
