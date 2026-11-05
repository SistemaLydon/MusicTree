// Claves de API. Se guardan solo en este navegador (IndexedDB) y nunca van en el código.
import { db } from './db';

export interface ApiKeys {
  discogsToken?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  lastfmKey?: string;
}

let cache: ApiKeys | null = null;

export async function getKeys(): Promise<ApiKeys> {
  if (cache) return cache;
  cache = ((await db.settings.get('keys'))?.value as ApiKeys) ?? {};
  return cache;
}

export async function saveKeys(k: ApiKeys) {
  const clean: ApiKeys = {};
  for (const [name, v] of Object.entries(k)) {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) clean[name as keyof ApiKeys] = t;
  }
  cache = clean;
  await db.settings.put({ key: 'keys', value: clean });
}
