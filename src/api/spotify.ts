// Cliente de la Web API de Spotify (modo desarrollo, reglas de febrero de 2026):
// sin artistas relacionados, sin top tracks, sin popularidad ni seguidores, sin
// sello en los álbumes y búsqueda limitada a 10 resultados. Lo que sí da: identidad
// de artistas pequeños, imagen, géneros (cada vez menos), discografía con fechas y
// los textos de copyright (℗), de donde se puede sacar el sello.
//
// Autenticación, dos caminos:
//  · Client ID + Client Secret (client credentials): funciona incluso abriendo el
//    HTML con doble clic. El secreto queda guardado en este navegador.
//  · Solo Client ID (PKCE): inicias sesión una vez con Spotify. Necesita servir la
//    app desde http://127.0.0.1:PUERTO y registrar esa URL en el panel de Spotify.

import { cachedJson, HttpError, RateLimitedQueue } from './queue';
import { db } from '../db';
import { getKeys } from '../keys';
import { labelKey, norm } from '../normalize';
import type { SearchCandidate } from '../types';

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
export const spQueue = new RateLimitedQueue(250);

interface Token {
  access: string;
  expiresAt: number;
}
interface StoredAuth {
  refresh: string;
  clientId: string;
}

let token: Token | null = null;

export class SpotifyNotConfigured extends Error {}

export async function spotifyConfigured() {
  const k = await getKeys();
  if (!k.spotifyClientId) return false;
  if (k.spotifyClientSecret) return true;
  const auth = (await db.settings.get('spotifyAuth'))?.value as StoredAuth | undefined;
  return !!auth?.refresh && auth.clientId === k.spotifyClientId;
}

export function resetSpotifyToken() {
  token = null;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const why = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(why === 'invalid_client' ? 'Spotify rechaza las credenciales (invalid_client): revisa Client ID y Client Secret' : `Spotify: ${why}`);
  }
  return json;
}

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.access;
  const k = await getKeys();
  if (!k.spotifyClientId) throw new SpotifyNotConfigured('Falta el Client ID de Spotify');
  if (k.spotifyClientSecret) {
    const j = await tokenRequest({ grant_type: 'client_credentials', client_id: k.spotifyClientId, client_secret: k.spotifyClientSecret });
    token = { access: j.access_token!, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.access;
  }
  const auth = (await db.settings.get('spotifyAuth'))?.value as StoredAuth | undefined;
  if (!auth?.refresh || auth.clientId !== k.spotifyClientId) throw new SpotifyNotConfigured('Spotify sin conectar: añade el Client Secret o inicia sesión');
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh, client_id: k.spotifyClientId });
  token = { access: j.access_token!, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  if (j.refresh_token) await db.settings.put({ key: 'spotifyAuth', value: { refresh: j.refresh_token, clientId: k.spotifyClientId } });
  return token.access;
}

// ─── PKCE ───────────────────────────────────────────────────────────────────
export function redirectUri() {
  return location.protocol.startsWith('http') ? `${location.origin}${location.pathname}` : null;
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startSpotifyLogin() {
  const k = await getKeys();
  const uri = redirectUri();
  if (!k.spotifyClientId) throw new Error('Falta el Client ID');
  if (!uri) throw new Error('El inicio de sesión necesita abrir la app desde http://127.0.0.1 (npm run dev), no como archivo');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  try {
    localStorage.setItem('arbol.spotify.pkce', JSON.stringify({ verifier, state }));
  } catch {
    /* sin localStorage no hay forma de completar el login */
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: k.spotifyClientId,
    redirect_uri: uri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  location.assign(`${ACCOUNTS}/authorize?${params}`);
}

/** Completa el login si la página vuelve de Spotify con ?code= */
export async function handleSpotifyRedirect(): Promise<string | null> {
  const p = new URLSearchParams(location.search);
  const code = p.get('code');
  const err = p.get('error');
  if (!code && !err) return null;
  const clean = () => history.replaceState(null, '', location.pathname + location.hash);
  if (err) {
    clean();
    return `Spotify canceló el inicio de sesión (${err})`;
  }
  let saved: { verifier: string; state: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem('arbol.spotify.pkce') ?? 'null');
    localStorage.removeItem('arbol.spotify.pkce');
  } catch {
    /* nada */
  }
  clean();
  if (!saved || saved.state !== p.get('state')) return 'No se pudo verificar la respuesta de Spotify; vuelve a intentarlo';
  const k = await getKeys();
  const j = await tokenRequest({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: redirectUri()!,
    client_id: k.spotifyClientId!,
    code_verifier: saved.verifier,
  });
  token = { access: j.access_token!, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  await db.settings.put({ key: 'spotifyAuth', value: { refresh: j.refresh_token, clientId: k.spotifyClientId } });
  return 'ok';
}

export async function disconnectSpotify() {
  token = null;
  await db.settings.delete('spotifyAuth');
}

// ─── Peticiones ─────────────────────────────────────────────────────────────
async function api<T>(path: string, opts: { priority?: number; signal?: AbortSignal; ttlDays?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const access = await getToken();
    try {
      return await cachedJson<T>(spQueue, `${API}${path}`, {
        ...opts,
        cacheKey: `spotify:${path}`,
        init: { headers: { Authorization: `Bearer ${access}` } },
      });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401 && attempt === 0) {
        token = null;
        continue;
      }
      throw e;
    }
  }
}

interface SpImage {
  url: string;
  width?: number | null;
  height?: number | null;
}
export interface SpArtist {
  id: string;
  name: string;
  genres?: string[];
  images?: SpImage[];
  external_urls?: { spotify?: string };
}
interface SpAlbumSimple {
  id: string;
  name: string;
  album_type: string;
  release_date?: string;
  total_tracks?: number;
}
interface SpAlbum extends SpAlbumSimple {
  copyrights?: { text: string; type: string }[];
}

export function pickImage(images: SpImage[] = [], min = 160): string | undefined {
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= min) ?? sorted[sorted.length - 1])?.url;
}

export async function searchSpotifyArtists(q: string, opts: { signal?: AbortSignal; limit?: number; priority?: number } = {}): Promise<SearchCandidate[]> {
  const json = await api<{ artists?: { items: SpArtist[] } }>(`/search?type=artist&limit=${Math.min(opts.limit ?? 6, 10)}&q=${encodeURIComponent(q)}`, {
    signal: opts.signal,
    priority: opts.priority ?? 10,
    ttlDays: 3,
  });
  const n = norm(q);
  return (json.artists?.items ?? []).map((a, i) => ({
    kind: 'artist' as const,
    source: 'spotify' as const,
    id: a.id,
    name: a.name,
    image: pickImage(a.images, 64),
    genres: a.genres?.slice(0, 3),
    topTag: a.genres?.[0],
    // Spotify no da puntuación: la aproximamos con la posición y el nombre exacto
    score: (norm(a.name) === n ? 100 : 80) - i * 3,
  }));
}

export function getSpotifyArtist(id: string, priority = 0) {
  return api<SpArtist>(`/artists/${id}`, { priority, ttlDays: 14 });
}

/** Discografía resumida: primer y último año y los álbumes para leer el ℗ */
export async function getSpotifyDiscography(id: string, priority = 0) {
  const page = (offset: number) =>
    api<{ items: SpAlbumSimple[]; total: number }>(`/artists/${id}/albums?include_groups=album,single&limit=10&offset=${offset}`, { priority, ttlDays: 14 });
  const first = await page(0);
  let items = [...first.items];
  if (first.total > 10) {
    const last = await page(Math.max(0, first.total - 10));
    items = items.concat(last.items);
  }
  const years = items.map((a) => parseInt(a.release_date?.slice(0, 4) ?? '', 10)).filter((y) => y > 1900);
  // álbumes primero, luego singles; como mucho tres para no gastar peticiones
  const forCopyright = [...first.items].sort((a, b) => (a.album_type === 'album' ? 0 : 1) - (b.album_type === 'album' ? 0 : 1)).slice(0, 3);
  return { total: first.total, firstYear: years.length ? Math.min(...years) : undefined, lastYear: years.length ? Math.max(...years) : undefined, forCopyright };
}

export function getSpotifyAlbum(id: string, priority = 0) {
  return api<SpAlbum>(`/albums/${id}`, { priority, ttlDays: 60 });
}

const DISTRIBUTORS = /^(distrokid|cd ?baby|tunecore|believe|amuse|ditto|routenote|onerpm|symphonic|awal|stem|unitedmasters|repost network|vydia|record union|spinnup|bandcamp)/i;

/** "℗ 2019 Warp Records Limited, under exclusive license to X" → "X" */
export function labelFromCopyright(text: string, artistName: string): string | undefined {
  let t = text.replace(/^\s*(℗|©|\(p\)|\(c\)|p|c)\s*/i, '').replace(/^(19|20)\d{2}(\s*[-–]\s*(19|20)\d{2})?[,.]?\s*/, '');
  const lic = t.match(/(?:under (?:exclusive )?licen[cs]e to|distributed by|bajo licencia (?:exclusiva )?(?:a|de))\s+(.+)$/i);
  if (lic) t = lic[1];
  t = t.split(/\s*[,;]\s*(?:a division|a member|an? \w+ company|all rights)/i)[0].replace(/\.$/, '').trim();
  if (!t || t.length > 60 || DISTRIBUTORS.test(t)) return undefined;
  if (labelKey(t) === labelKey(artistName) || norm(t).includes(norm(artistName))) return undefined;
  return t;
}
