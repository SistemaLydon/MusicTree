// Wikidata vía SPARQL (sin clave). Aporta sello (P264), género (P136), lugar de
// formación (P740), inicio (P571), movimiento (P135) y, sobre todo, los
// identificadores cruzados: MusicBrainz (P434), Spotify (P1902), Discogs (P1953).

import { cachedJson, RateLimitedQueue } from './queue';
import type { ExternalIds } from '../types';

export const wdQueue = new RateLimitedQueue(600);
const ENDPOINT = 'https://query.wikidata.org/sparql';

export interface WikidataFacts {
  qid: string;
  ids: ExternalIds;
  labels: { name: string; mbid?: string }[];
  genres: string[];
  formation?: { id: string; name: string };
  inception?: number;
  movements: { id: string; name: string }[];
}

const lit = (s: string) => `"${s.replace(/["\\]/g, '')}"`;

export async function wikidataLookup(ids: ExternalIds, priority = 0): Promise<WikidataFacts | null> {
  const parts: string[] = [];
  if (ids.wikidata && /^Q\d+$/.test(ids.wikidata)) parts.push(`{ BIND(wd:${ids.wikidata} AS ?item) }`);
  if (ids.mb) parts.push(`{ ?item wdt:P434 ${lit(ids.mb)} }`);
  if (ids.spotify) parts.push(`{ ?item wdt:P1902 ${lit(ids.spotify)} }`);
  if (ids.discogs) parts.push(`{ ?item wdt:P1953 ${lit(ids.discogs)} }`);
  if (!parts.length) return null;
  // géneros en inglés (los entiende el normalizador); el resto, en español si existe
  const q = `SELECT ?item ?mb ?sp ?dg ?prop ?val ?en ?es ?valMb WHERE {
  ${parts.join(' UNION ')}
  OPTIONAL { ?item wdt:P434 ?mb } OPTIONAL { ?item wdt:P1902 ?sp } OPTIONAL { ?item wdt:P1953 ?dg }
  OPTIONAL {
    VALUES ?prop { wdt:P264 wdt:P136 wdt:P740 wdt:P571 wdt:P135 }
    ?item ?prop ?val .
    OPTIONAL { ?val rdfs:label ?en FILTER(lang(?en) = "en") }
    OPTIONAL { ?val rdfs:label ?es FILTER(lang(?es) = "es") }
    OPTIONAL { ?val wdt:P966 ?valMb }
  }
} LIMIT 300`;
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(q)}`;
  type B = Record<string, { value: string } | undefined>;
  const json = await cachedJson<{ results: { bindings: B[] } }>(wdQueue, url, { priority, ttlDays: 30, cacheKey: `wikidata:${JSON.stringify(ids)}` });
  const rows = json.results.bindings;
  if (!rows.length) return null;
  // si varias entidades coinciden, nos quedamos con la primera
  const qid = rows[0].item!.value.split('/').pop()!;
  const mine = rows.filter((r) => r.item?.value.endsWith(`/${qid}`));
  const out: WikidataFacts = { qid, ids: { wikidata: qid }, labels: [], genres: [], movements: [] };
  const qidOf = (v?: string) => v?.split('/').pop() ?? '';
  for (const r of mine) {
    if (r.mb) out.ids.mb ??= r.mb.value;
    if (r.sp) out.ids.spotify ??= r.sp.value;
    if (r.dg) out.ids.discogs ??= r.dg.value;
    const prop = r.prop?.value.split('/').pop();
    const name = r.es?.value ?? r.en?.value;
    switch (prop) {
      case 'P264':
        if (name && !out.labels.some((l) => l.name === name)) out.labels.push({ name: r.en?.value ?? name, mbid: r.valMb?.value });
        break;
      case 'P136':
        if (r.en?.value && !out.genres.includes(r.en.value)) out.genres.push(r.en.value);
        break;
      case 'P740':
        if (name) out.formation ??= { id: qidOf(r.val?.value), name: r.en?.value ?? name };
        break;
      case 'P571': {
        const y = parseInt(r.val?.value.slice(0, 4) ?? '', 10);
        if (y > 1000) out.inception = out.inception ? Math.min(out.inception, y) : y;
        break;
      }
      case 'P135':
        if (name && !out.movements.some((m) => m.id === qidOf(r.val?.value))) out.movements.push({ id: qidOf(r.val?.value), name });
        break;
    }
  }
  return out;
}
