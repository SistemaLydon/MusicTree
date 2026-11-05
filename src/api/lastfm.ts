// Last.fm (API key gratuita): tags para completar estilos y artistas similares,
// que se guardan ya para las sugerencias de la fase 3.

import { cachedJson, RateLimitedQueue } from './queue';
import { getKeys } from '../keys';

const API = 'https://ws.audioscrobbler.com/2.0/';
export const lfQueue = new RateLimitedQueue(260);

export class LastfmNotConfigured extends Error {}

async function lf<T>(params: Record<string, string>, priority = 0): Promise<T> {
  const { lastfmKey } = await getKeys();
  if (!lastfmKey) throw new LastfmNotConfigured('Falta la API key de Last.fm');
  const qs = new URLSearchParams({ ...params, format: 'json', autocorrect: '1' });
  const cacheKey = `lastfm:${qs}`;
  qs.set('api_key', lastfmKey);
  const json = await cachedJson<T & { error?: number; message?: string }>(lfQueue, `${API}?${qs}`, { priority, ttlDays: 30, cacheKey });
  if (json.error) throw new Error(`Last.fm: ${json.message ?? json.error}`);
  return json;
}

const who = (name: string, mbid?: string): Record<string, string> => (mbid ? { mbid } : { artist: name });

export async function lastfmTopTags(name: string, mbid?: string, priority = 0) {
  const j = await lf<{ toptags?: { tag: { name: string; count: number }[] } }>({ method: 'artist.gettoptags', ...who(name, mbid) }, priority).catch((e) => {
    // muchas fichas de MusicBrainz no están enlazadas en Last.fm: reintento por nombre
    if (mbid) return lf<{ toptags?: { tag: { name: string; count: number }[] } }>({ method: 'artist.gettoptags', artist: name }, priority);
    throw e;
  });
  return (j.toptags?.tag ?? []).slice(0, 15).map((t) => ({ name: t.name, count: Number(t.count) }));
}

export async function lastfmSimilar(name: string, priority = 0) {
  const j = await lf<{ similarartists?: { artist: { name: string; mbid?: string; match: string }[] } }>({ method: 'artist.getsimilar', artist: name, limit: '30' }, priority);
  return (j.similarartists?.artist ?? []).map((a) => ({ name: a.name, mbid: a.mbid || undefined, match: Number(a.match) }));
}
