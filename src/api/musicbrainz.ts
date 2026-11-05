// Cliente de MusicBrainz (sin clave). Todas las peticiones pasan por una cola de
// 1 petición/segundo y por la caché local.

import { cachedJson, RateLimitedQueue } from './queue';
import type { ExternalUrls, LabelFact, RelationFact, SearchCandidate } from '../types';
import { isMajor, labelKey } from '../normalize';

const BASE = 'https://musicbrainz.org/ws/2';
export const mbQueue = new RateLimitedQueue(1100);

export const NO_LABEL_MBID = '157afde4-4bf5-4039-8ad2-5a15acc85176';

// ─── Tipos mínimos de la respuesta ──────────────────────────────────────────
interface MbArea {
  id: string;
  name: string;
  type?: string | null;
  'iso-3166-1-codes'?: string[];
}
interface MbLifeSpan {
  begin?: string | null;
  end?: string | null;
  ended?: boolean | null;
}
interface MbTag {
  name: string;
  count: number;
}
interface MbRelation {
  type: string;
  direction: 'forward' | 'backward';
  'target-type': string;
  artist?: { id: string; name: string; type?: string };
  label?: { id: string; name: string };
  url?: { resource: string };
  attributes?: string[];
  ended?: boolean;
}
export interface MbArtist {
  id: string;
  name: string;
  'sort-name'?: string;
  type?: string | null;
  score?: number;
  country?: string | null;
  area?: MbArea | null;
  'begin-area'?: MbArea | null;
  'begin_area'?: MbArea | null;
  disambiguation?: string;
  'life-span'?: MbLifeSpan;
  tags?: MbTag[];
  genres?: MbTag[];
  relations?: MbRelation[];
}
export interface MbLabel {
  id: string;
  name: string;
  type?: string | null;
  score?: number;
  country?: string | null;
  area?: MbArea | null;
  disambiguation?: string;
  'life-span'?: MbLifeSpan;
  tags?: MbTag[];
  genres?: MbTag[];
  relations?: MbRelation[];
}
interface MbRelease {
  id: string;
  date?: string;
  status?: string;
  'label-info'?: { label?: { id: string; name: string } | null }[];
}

// ─── Búsqueda ───────────────────────────────────────────────────────────────
function luceneEscape(s: string) {
  return s.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1');
}

function buildQuery(name: string) {
  const q = luceneEscape(name.trim());
  // nombre exacto (boost) + alias + búsqueda difusa para el autocompletado
  return `artist:"${q}"^3 OR alias:"${q}"^2 OR ${q}`;
}

export async function searchArtists(name: string, opts: { signal?: AbortSignal; limit?: number; priority?: number } = {}): Promise<SearchCandidate[]> {
  const url = `${BASE}/artist?query=${encodeURIComponent(buildQuery(name))}&limit=${opts.limit ?? 8}&fmt=json`;
  const json = await cachedJson<{ artists: MbArtist[] }>(mbQueue, url, { priority: opts.priority ?? 10, signal: opts.signal, ttlDays: 7 });
  return (json.artists ?? []).map((a) => ({
    kind: 'artist' as const,
    source: 'musicbrainz' as const,
    id: a.id,
    name: a.name,
    disambiguation: a.disambiguation || undefined,
    type: a.type ?? undefined,
    country: a.country ?? undefined,
    area: a.area?.name,
    begin: a['life-span']?.begin ?? undefined,
    end: a['life-span']?.end ?? undefined,
    topTag: [...(a.tags ?? [])].sort((x, y) => y.count - x.count)[0]?.name,
    score: a.score ?? 0,
  }));
}

export async function searchLabels(name: string, opts: { signal?: AbortSignal; limit?: number; priority?: number } = {}): Promise<SearchCandidate[]> {
  const q = luceneEscape(name.trim());
  const query = `label:"${q}"^3 OR alias:"${q}"^2 OR ${q}`;
  const url = `${BASE}/label?query=${encodeURIComponent(query)}&limit=${opts.limit ?? 5}&fmt=json`;
  const json = await cachedJson<{ labels: MbLabel[] }>(mbQueue, url, { priority: opts.priority ?? 10, signal: opts.signal, ttlDays: 7 });
  return (json.labels ?? []).map((l) => ({
    kind: 'label' as const,
    source: 'musicbrainz' as const,
    id: l.id,
    name: l.name,
    disambiguation: l.disambiguation || undefined,
    type: l.type ?? undefined,
    country: l.country ?? undefined,
    area: l.area?.name,
    begin: l['life-span']?.begin ?? undefined,
    end: l['life-span']?.end ?? undefined,
    topTag: [...(l.tags ?? [])].sort((x, y) => y.count - x.count)[0]?.name,
    score: l.score ?? 0,
  }));
}

// ─── Fichas completas ───────────────────────────────────────────────────────
export function lookupArtist(mbid: string, priority = 0) {
  const url = `${BASE}/artist/${mbid}?inc=aliases+genres+tags+url-rels+artist-rels+label-rels&fmt=json`;
  return cachedJson<MbArtist>(mbQueue, url, { priority });
}

export function lookupLabel(mbid: string, priority = 0) {
  const url = `${BASE}/label/${mbid}?inc=genres+tags+url-rels+artist-rels&fmt=json`;
  return cachedJson<MbLabel>(mbQueue, url, { priority });
}

/** Busca el artista de MusicBrainz enlazado a una URL (Spotify, Discogs...) */
export async function lookupByUrl(resource: string, priority = 0): Promise<string | undefined> {
  const url = `${BASE}/url?resource=${encodeURIComponent(resource)}&inc=artist-rels&fmt=json`;
  try {
    const json = await cachedJson<{ relations?: MbRelation[] }>(mbQueue, url, { priority, ttlDays: 30 });
    return json.relations?.find((r) => r['target-type'] === 'artist' && r.artist)?.artist?.id;
  } catch (e) {
    // 404 = ninguna ficha enlaza esa URL
    if (e instanceof Error && /HTTP 404/.test(e.message)) return undefined;
    throw e;
  }
}

export function browseReleases(artistMbid: string, priority = 0) {
  const url = `${BASE}/release?artist=${artistMbid}&status=official&inc=labels&limit=100&fmt=json`;
  return cachedJson<{ releases: MbRelease[]; 'release-count': number }>(mbQueue, url, { priority });
}

// ─── Extracción de hechos ───────────────────────────────────────────────────
export function extractUrls(rels: MbRelation[] = []): ExternalUrls {
  const out: ExternalUrls = {};
  for (const r of rels) {
    const u = r.url?.resource;
    if (!u || r.ended) continue;
    let host = '';
    try {
      host = new URL(u).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (host === 'open.spotify.com' && u.includes('/artist/')) out.spotify ??= u;
    else if (host.endsWith('bandcamp.com')) out.bandcamp ??= u;
    else if (host === 'youtube.com' || host === 'music.youtube.com') out.youtube ??= u;
    else if (host === 'discogs.com') out.discogs ??= u;
    else if (host === 'wikidata.org') out.wikidata ??= u;
    else if (host.endsWith('last.fm')) out.lastfm ??= u;
    else if (host === 'soundcloud.com') out.soundcloud ??= u;
    else if (host.endsWith('allmusic.com')) out.allmusic ??= u;
    else if (host.endsWith('wikipedia.org')) out.wikipedia ??= u;
    else if (r.type === 'official homepage') out.official ??= u;
  }
  return out;
}

export function spotifyIdFromUrl(u?: string): string | undefined {
  return u?.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]+)/)?.[1];
}
export function discogsIdFromUrl(u?: string): string | undefined {
  return u?.match(/discogs\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/)?.[1];
}
export function wikidataIdFromUrl(u?: string): string | undefined {
  return u?.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/)?.[1];
}

const REL_MAP: Record<string, RelationFact['type']> = {
  'member of band': 'member_of',
  founder: 'member_of',
  collaboration: 'collaboration',
  'is person': 'alter_ego',
  subgroup: 'side_project',
  'supporting musician': 'collaboration',
  'vocal supporting musician': 'collaboration',
  'instrumental supporting musician': 'collaboration',
  married: 'family',
  sibling: 'family',
  parent: 'family',
};

export function extractRelations(rels: MbRelation[] = []): RelationFact[] {
  const out: RelationFact[] = [];
  const seen = new Set<string>();
  for (const r of rels) {
    if (r['target-type'] !== 'artist' || !r.artist) continue;
    const type = REL_MAP[r.type];
    if (!type) continue;
    const key = `${type}|${r.artist.id}|${r.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, target: `mb:${r.artist.id}`, targetName: r.artist.name, direction: r.direction, source: 'musicbrainz' });
  }
  return out;
}

/** Sellos con relación explícita (contrato, fundador...) en la ficha del artista */
export function extractLabelRels(rels: MbRelation[] = []): LabelFact[] {
  const out: LabelFact[] = [];
  for (const r of rels) {
    if (r['target-type'] !== 'label' || !r.label) continue;
    if (!['recording contract', 'label founder', 'owner', 'personal label'].includes(r.type)) continue;
    out.push({ mbid: r.label.id, name: r.label.name, releases: 3, source: 'musicbrainz' });
  }
  return out;
}

/**
 * A partir de los lanzamientos oficiales calcula los sellos principales y el
 * rango de años de publicación.
 */
export function summarizeReleases(releases: MbRelease[], maxLabels = 4) {
  // se agrupan por nombre normalizado ("Factory" y "Factory Records" son el mismo sello)
  const counts = new Map<string, { mbid: string; name: string; n: number; best: number }>();
  const perId = new Map<string, number>();
  let first: number | undefined;
  let last: number | undefined;
  for (const rel of releases) {
    const y = rel.date ? parseInt(rel.date.slice(0, 4), 10) : NaN;
    if (!Number.isNaN(y) && y > 1900) {
      first = first === undefined ? y : Math.min(first, y);
      last = last === undefined ? y : Math.max(last, y);
    }
    const seenInRelease = new Set<string>();
    for (const li of rel['label-info'] ?? []) {
      const l = li.label;
      if (!l || l.id === NO_LABEL_MBID || /^\[?no label\]?$|not on label|self[- ]released/i.test(l.name)) continue;
      const key = labelKey(l.name);
      if (!key || seenInRelease.has(key)) continue;
      seenInRelease.add(key);
      perId.set(l.id, (perId.get(l.id) ?? 0) + 1);
      const c = counts.get(key) ?? { mbid: l.id, name: l.name, n: 0, best: 0 };
      c.n++;
      // el MBID representativo es el más usado dentro del grupo
      if (perId.get(l.id)! > c.best) {
        c.best = perId.get(l.id)!;
        c.mbid = l.id;
        c.name = l.name;
      }
      counts.set(key, c);
    }
  }
  // las majors y distribuidoras puntúan la mitad: crean puentes poco significativos
  const rank = (c: { name: string; n: number }) => (isMajor(c.name) ? c.n / 2 : c.n);
  const labels: LabelFact[] = [...counts.values()]
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, maxLabels)
    .filter((c, i) => i === 0 || c.n >= 2)
    .map((c) => ({ mbid: c.mbid, name: c.name, releases: c.n, source: 'musicbrainz' as const }));
  return { labels, first, last };
}

export function areaBits(a?: MbArea | null) {
  if (!a) return undefined;
  const iso = a['iso-3166-1-codes']?.[0];
  return { name: iso ? regionName(iso, a.name) : a.name, mbid: a.id, type: a.type ?? undefined, isCountry: !!iso, iso };
}

export function beginAreaOf(a: MbArtist) {
  return a['begin-area'] ?? a.begin_area ?? null;
}

let regionNames: Intl.DisplayNames | undefined;
/** Nombre del país en español a partir del código ISO ("US" → "Estados Unidos") */
export function regionName(iso: string, fallback: string) {
  try {
    regionNames ??= new Intl.DisplayNames(['es'], { type: 'region' });
    return regionNames.of(iso) ?? fallback;
  } catch {
    return fallback;
  }
}
