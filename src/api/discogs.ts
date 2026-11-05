// Cliente de Discogs (token personal). Es la mejor fuente para sellos y estilos de
// electrónica. Límite: 60 peticiones/minuto con token, de ahí la cola de 1,1 s.
// El token va como parámetro de la URL (no como cabecera) para evitar la petición
// previa de CORS; la caché lo excluye de la clave.

import { cachedJson, RateLimitedQueue } from './queue';
import { getKeys } from '../keys';
import { labelKey, norm } from '../normalize';
import type { SearchCandidate } from '../types';

const API = 'https://api.discogs.com';
export const dgQueue = new RateLimitedQueue(1100);

export class DiscogsNotConfigured extends Error {}

async function dg<T>(path: string, params: Record<string, string | number>, opts: { priority?: number; signal?: AbortSignal; ttlDays?: number } = {}): Promise<T> {
  const { discogsToken } = await getKeys();
  if (!discogsToken) throw new DiscogsNotConfigured('Falta el token de Discogs');
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const cacheKey = `discogs:${path}?${qs}`;
  qs.set('token', discogsToken);
  return cachedJson<T>(dgQueue, `${API}${path}?${qs}`, { ...opts, cacheKey });
}

/** "Burial (4)" → "Burial" */
export const stripDiscogsNumber = (s: string) => s.replace(/\s\(\d+\)$/, '');

interface DgSearchResult {
  id: number;
  type: string;
  title: string;
  thumb?: string;
  cover_image?: string;
  year?: string;
  label?: string[];
  genre?: string[];
  style?: string[];
  country?: string;
}
export interface DgArtist {
  id: number;
  name: string;
  realname?: string;
  profile?: string;
  urls?: string[];
  images?: { type: string; uri: string; uri150: string }[];
  members?: { id: number; name: string; active: boolean }[];
  groups?: { id: number; name: string; active: boolean }[];
  aliases?: { id: number; name: string }[];
}

export async function searchDiscogsArtists(q: string, opts: { signal?: AbortSignal; limit?: number; priority?: number } = {}): Promise<SearchCandidate[]> {
  const json = await dg<{ results: DgSearchResult[] }>('/database/search', { q, type: 'artist', per_page: opts.limit ?? 5 }, { ...opts, priority: opts.priority ?? 9, ttlDays: 7 });
  const n = norm(q);
  return (json.results ?? []).map((r, i) => {
    const clean = stripDiscogsNumber(r.title);
    const numbered = clean !== r.title;
    return {
      kind: 'artist' as const,
      source: 'discogs' as const,
      id: String(r.id),
      name: clean,
      disambiguation: numbered ? `Discogs: ${r.title}` : undefined,
      image: r.thumb && !r.thumb.includes('spacer.gif') ? r.thumb : undefined,
      score: (norm(clean) === n ? 100 : 75) - i * 3,
    };
  });
}

export function getDiscogsArtist(id: string | number, priority = 0) {
  return dg<DgArtist>(`/artists/${id}`, {}, { priority, ttlDays: 30 });
}

/**
 * Masters (y, si hay pocos, lanzamientos sueltos) donde el artista figura como
 * principal. Discogs numera los homónimos en los títulos ("Burial (13) - …"), así
 * que filtrar por el nombre completo con número descarta a los demás.
 */
export async function getDiscogsWorks(discogsName: string, priority = 0) {
  const clean = stripDiscogsNumber(discogsName);
  const masters = await dg<{ results: DgSearchResult[] }>('/database/search', { artist: clean, type: 'master', per_page: 100 }, { priority, ttlDays: 30 });
  let results = (masters.results ?? []).filter((r) => isByArtist(r.title, discogsName));
  if (results.length < 4) {
    // artistas pequeños: muchos discos no tienen "master"
    const rel = await dg<{ results: DgSearchResult[] }>('/database/search', { artist: clean, type: 'release', per_page: 100 }, { priority, ttlDays: 30 });
    const seen = new Set(results.map((r) => norm(r.title)));
    results = results.concat((rel.results ?? []).filter((r) => isByArtist(r.title, discogsName) && !seen.has(norm(r.title))));
  }
  return results;
}

function isByArtist(title: string, name: string) {
  const who = title.split(' - ')[0].replace(/\*/g, '').trim();
  const n = norm(name);
  const w = norm(who);
  return w === n || w.startsWith(`${n} &`) || w.startsWith(`${n} and `) || w.startsWith(`${n} feat`) || w.startsWith(`${n},`);
}

const SERVICE_RE = /master(ing|ed)|pressing|pressed|studios\b|recording studio|manufactur|distribut|optimal media|gz media|\bmpo\b|sonopress|record industry|cargo|printed by|lacquer|cutting|publishing|copyright/i;

const GENRE_FAMILY: Record<string, string> = {
  electronic: 'electronica',
  rock: 'rock',
  'hip hop': 'hiphop',
  jazz: 'jazz',
  'funk / soul': 'jazz',
  blues: 'jazz',
  pop: 'pop',
  'folk, world, & country': 'folk',
  latin: 'folk',
  reggae: 'folk',
  classical: 'clasica',
  'stage & screen': 'clasica',
};
export const discogsGenreFamily = (g: string) => GENRE_FAMILY[norm(g)];

/** Cuenta sellos, estilos y géneros en las obras del artista */
export function summarizeDiscogs(results: DgSearchResult[], artistName: string) {
  const labels = new Map<string, { name: string; n: number }>();
  const styles = new Map<string, number>();
  const genres = new Map<string, number>();
  const countries = new Map<string, number>();
  const years: number[] = [];
  for (const r of results) {
    // El primer sello es el del catálogo; los siguientes suelen ser estudios de
    // masterización, fábricas o distribuidoras ("Transition Mastering Studios").
    const l = (r.label ?? []).find((x) => !SERVICE_RE.test(x));
    const k = l ? labelKey(l) : '';
    if (l && k && !/^not on label|self[- ]released|^none$/i.test(l) && k !== labelKey(stripDiscogsNumber(artistName))) {
      const c = labels.get(k) ?? { name: l, n: 0 };
      c.n++;
      labels.set(k, c);
    }
    for (const s of new Set(r.style ?? [])) styles.set(s, (styles.get(s) ?? 0) + 1);
    for (const g of new Set(r.genre ?? [])) genres.set(g, (genres.get(g) ?? 0) + 1);
    if (r.country) countries.set(r.country, (countries.get(r.country) ?? 0) + 1);
    const y = parseInt(r.year ?? '', 10);
    if (y > 1900) years.push(y);
  }
  return {
    labels: [...labels.values()].sort((a, b) => b.n - a.n),
    styles: [...styles.entries()].map(([name, count]) => ({ name, count })),
    genres: [...genres.entries()].map(([name, count]) => ({ name, count })),
    country: [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    firstYear: years.length ? Math.min(...years) : undefined,
    lastYear: years.length ? Math.max(...years) : undefined,
    works: results.length,
  };
}
