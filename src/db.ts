import Dexie, { type Table } from 'dexie';
import type { CacheEntry, Entity, ManualEdge, Setting } from './types';

class ArbolDB extends Dexie {
  entities!: Table<Entity, string>;
  manualEdges!: Table<ManualEdge, string>;
  cache!: Table<CacheEntry, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('arbol-musical');
    this.version(1).stores({
      entities: 'id, kind, mbid, status, origin, addedAt, name',
      manualEdges: 'id, source, target',
      cache: 'key, fetchedAt',
      settings: 'key',
    });
    // fase 2: identificadores de varias fuentes y relaciones con clave genérica
    this.version(2)
      .stores({
        entities: 'id, kind, mbid, status, origin, addedAt, name',
        manualEdges: 'id, source, target',
        cache: 'key, fetchedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('entities')
          .toCollection()
          .modify((e: Entity) => {
            e.ids = e.ids ?? (e.mbid ? { mb: e.mbid } : {});
            e.data.relations = (e.data.relations ?? []).map((r) => ({ ...r, target: r.target ?? `mb:${r.targetMbid}` }));
            // se vuelven a enriquecer con las fuentes nuevas (MusicBrainz sale de la caché)
            e.status = 'pendiente';
          });
      });
  }
}

export const db = new ArbolDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
