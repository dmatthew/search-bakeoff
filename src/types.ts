export type SearchRecord = {
  id: string;
  displayName: string;
  primaryText: string;
  secondaryText: string;
  searchText: string;
  kind: string;
  rank: number;
  countryCode?: string;
  adminCode?: string;
  latitude?: number;
  longitude?: number;
  population?: number;
};

export type SearchHit = {
  id: string;
  displayName: string;
  primaryText: string;
  secondaryText: string;
  kind: string;
  countryCode?: string;
  adminCode?: string;
  latitude?: number;
  longitude?: number;
};

export type SearchOptions = {
  limit: number;
};

export type EngineSearchResult = {
  ms: number;
  hits: SearchHit[];
  error?: string;
};

export type DatasetManifest = {
  id: string;
  displayName: string;
  description: string;
  source: string;
  license: string;
  recordCount: number;
  path: string;
};
