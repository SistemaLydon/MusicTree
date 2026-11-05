// Deriva nodos y aristas a partir de las entidades guardadas.
// Regla de legibilidad: los artistas se conectan a hubs (estilo, sello, escena);
// las aristas directas artista↔artista solo para relaciones fuertes.

import { FAMILIES, labelKey, mergeLabels, mergeStyles, slug, styleInfo } from '../normalize';
import type { DerivedEdge, DerivedNode, EdgeType, Entity, FamilyId, ManualEdge, Source } from '../types';

export interface BuildOptions {
  showSingleHubs: boolean;
}

export interface BuiltGraph {
  nodes: Map<string, DerivedNode>;
  edges: Map<string, DerivedEdge>;
  /** hubs ocultos por tener un solo artista (para el panel) */
  hiddenHubs: Set<string>;
  /** nodo → entidad guardada (artistas y sellos añadidos por el usuario) */
  entityOf: Map<string, string>;
  /** entidad → nodo */
  nodeOf: Map<string, string>;
}

// Los sellos se identifican por nombre normalizado: MusicBrainz separa a veces la
// empresa ("Warp Records") del sello que figura en los discos ("Warp").
export const labelNodeId = (name: string) => `label:${labelKey(name)}`;
export const styleNodeId = (style: string) => `style:${style}`;
// Las escenas se identifican por nombre de lugar + década para que MusicBrainz y
// Wikidata (que usan ids distintos para la misma ciudad) caigan en el mismo nodo.
export const sceneNodeId = (placeName: string, decade: number) => `scene:${slug(placeName)}:${decade}`;
export const movementNodeId = (qid: string) => `scene:mv:${qid}`;

/** Claves con prefijo de fuente con las que otras entidades pueden referirse a esta */
export function entityKeys(e: Entity): string[] {
  const k: string[] = [];
  const mb = e.ids?.mb ?? e.mbid;
  if (mb) k.push(`mb:${mb}`);
  if (e.ids?.discogs) k.push(`dg:${e.ids.discogs}`);
  if (e.ids?.spotify) k.push(`sp:${e.ids.spotify}`);
  return k;
}

export const relTarget = (r: { target?: string; targetMbid?: string }) => r.target ?? (r.targetMbid ? `mb:${r.targetMbid}` : '');

export function decadeLabel(decade: number) {
  return `${String(decade % 100).padStart(2, '0')}s`;
}

const STRONG: EdgeType[] = ['member_of', 'shared_member', 'side_project', 'collaboration', 'alter_ego', 'family', 'remix', 'manual'];
export const isStrong = (t: EdgeType) => STRONG.includes(t);

export function buildGraph(entities: Entity[], manual: ManualEdge[], opts: BuildOptions): BuiltGraph {
  const nodes = new Map<string, DerivedNode>();
  const edges = new Map<string, DerivedEdge>();
  const artistIdByKey = new Map<string, string>();

  const artists = entities.filter((e) => e.kind === 'artist');
  const labelEntities = entities.filter((e) => e.kind === 'label');
  const entityOf = new Map<string, string>();
  const nodeOf = new Map<string, string>();
  const byId = new Map(entities.map((e) => [e.id, e]));

  for (const e of artists) {
    for (const k of entityKeys(e)) artistIdByKey.set(k, e.id);
    nodes.set(e.id, {
      id: e.id,
      kind: 'artist',
      label: e.name,
      family: e.data.family ?? 'otros',
      origin: e.origin,
      status: e.candidates?.length ? 'revisar' : e.status,
    });
    entityOf.set(e.id, e.id);
    nodeOf.set(e.id, e.id);
  }
  for (const e of labelEntities) {
    const nid = labelNodeId(e.name);
    entityOf.set(nid, e.id);
    nodeOf.set(e.id, nid);
    nodes.set(nid, {
      id: nid,
      kind: 'label',
      label: e.name,
      family: e.data.family ?? 'otros',
      origin: e.origin,
      status: e.status,
      meta: { userAdded: true },
    });
  }

  const addEdge = (a: string, b: string, type: EdgeType, origin: Source, weight: number, label?: string) => {
    const [s, t] = isStrong(type) && a > b ? [b, a] : [a, b];
    const key = `${type}|${s}|${t}`;
    const prev = edges.get(key);
    if (prev) {
      prev.weight = Math.max(prev.weight, weight);
      if (!prev.origins.includes(origin)) prev.origins.push(origin);
      if (label && !prev.label) prev.label = label;
      return;
    }
    edges.set(key, { key, source: s, target: t, type, origin, origins: [origin], weight, label });
  };

  const ensureHub = (id: string, kind: DerivedNode['kind'], label: string, family: FamilyId, meta?: Record<string, unknown>) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, label, family, meta });
  };

  // miembros de cada grupo (para detectar miembros compartidos)
  const membersOf = new Map<string, Map<string, string>>(); // groupEntityId → clave del miembro → nombre

  for (const e of artists) {
    const d = e.data;
    // estilos (fusionados entre fuentes)
    const styleSources = new Map<string, Source[]>();
    for (const s of d.styles) styleSources.set(s.style, [...(styleSources.get(s.style) ?? []), s.source]);
    for (const s of mergeStyles(d.styles)) {
      const info = styleInfo(s.style);
      const id = styleNodeId(s.style);
      ensureHub(id, 'style', info.name, info.family);
      for (const src of styleSources.get(s.style) ?? [s.source]) addEdge(e.id, id, 'style', src, 0.5 + s.weight);
    }
    // sellos (fusionados entre fuentes)
    for (const l of mergeLabels(d.labels)) {
      const id = labelNodeId(l.name);
      ensureHub(id, 'label', l.name, 'otros');
      for (const src of l.sources) addEdge(e.id, id, 'label', src, 0.5 + Math.min(1, l.score));
    }
    // escena: MusicBrainz y, si no hay, lugar de formación de Wikidata
    const scene = d.scene ?? (d.sceneWikidata?.decade ? d.sceneWikidata : undefined);
    if (scene) {
      const id = sceneNodeId(scene.placeName, scene.decade);
      ensureHub(id, 'scene', `${scene.placeName} · ${decadeLabel(scene.decade)}`, 'otros', { place: scene.placeName, decade: scene.decade });
      addEdge(e.id, id, 'scene', scene.source, 1);
      if (d.scene && d.sceneWikidata && sceneNodeId(d.sceneWikidata.placeName, d.sceneWikidata.decade) === id) addEdge(e.id, id, 'scene', 'wikidata', 1);
    }
    // movimientos con nombre propio
    for (const m of d.movements ?? []) {
      const id = movementNodeId(m.id);
      ensureHub(id, 'scene', m.name, 'otros', { movement: true });
      addEdge(e.id, id, 'scene', m.source, 1.2);
    }
    // relaciones directas
    for (const r of d.relations) {
      const target = relTarget(r);
      if (r.type === 'member_of' && r.direction === 'backward') {
        const m = membersOf.get(e.id) ?? new Map();
        m.set(target, r.targetName);
        membersOf.set(e.id, m);
      }
      const other = artistIdByKey.get(target);
      if (!other || other === e.id) continue;
      addEdge(e.id, other, r.type, r.source, 2);
    }
  }

  // relaciones de los sellos añadidos por el usuario (p. ej. fundadores)
  for (const e of labelEntities) {
    for (const r of e.data.relations) {
      const other = artistIdByKey.get(relTarget(r));
      if (other) addEdge(other, nodeOf.get(e.id)!, 'label', r.source, 1.5);
    }
  }

  // grupos que comparten miembros
  const groups = [...membersOf.entries()];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [ga, ma] = groups[i];
      const [gb, mb] = groups[j];
      const sharedKeys = [...ma.keys()].filter((k) => mb.has(k));
      if (!sharedKeys.length) continue;
      const names = [...new Set(sharedKeys.map((k) => ma.get(k)!))];
      for (const k of sharedKeys) addEdge(ga, gb, 'shared_member', k.startsWith('dg:') ? 'discogs' : 'musicbrainz', 1 + names.length, names.join(', '));
    }
  }

  // ediciones manuales
  for (const m of manual) {
    const key = `${m.type}|${m.source}|${m.target}`;
    if (m.removed) {
      edges.delete(key);
      edges.delete(`${m.type}|${m.target}|${m.source}`);
    } else if (nodes.has(m.source) && nodes.has(m.target)) {
      addEdge(m.source, m.target, m.type, 'manual', 2, m.note);
    }
  }

  // grado por hub (solo cuenta artistas)
  const hubArtists = new Map<string, Set<string>>();
  for (const ed of edges.values()) {
    for (const [hub, other] of [
      [ed.target, ed.source],
      [ed.source, ed.target],
    ]) {
      const n = nodes.get(hub);
      if (n && n.kind !== 'artist' && nodes.get(other)?.kind === 'artist') {
        const set = hubArtists.get(hub) ?? new Set();
        set.add(other);
        hubArtists.set(hub, set);
      }
    }
  }

  // familia de sellos = mayoría de sus artistas; nombre de escenas con el estilo dominante
  for (const n of nodes.values()) {
    if (n.kind === 'artist') continue;
    const members = [...(hubArtists.get(n.id) ?? [])].map((id) => byId.get(id)!).filter(Boolean);
    if (n.kind === 'label' || n.kind === 'scene') {
      const votes: Partial<Record<FamilyId, number>> = {};
      for (const m of members) votes[m.data.family ?? 'otros'] = (votes[m.data.family ?? 'otros'] ?? 0) + 1;
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      if (best && n.family === 'otros') n.family = best[0] as FamilyId;
    }
    if (n.kind === 'scene' && !n.meta?.movement) {
      const styleVotes = new Map<string, number>();
      for (const m of members) {
        const top = mergeStyles(m.data.styles, 1)[0];
        if (top) styleVotes.set(top.style, (styleVotes.get(top.style) ?? 0) + top.weight + 1);
      }
      const best = [...styleVotes.entries()].sort((a, b) => b[1] - a[1])[0];
      const tail = best ? styleInfo(best[0]).name : FAMILIES[n.family].name.toLowerCase();
      n.label = `${n.label} · ${tail}`;
    }
  }

  // ocultar hubs con un solo artista (salvo sellos añadidos por el usuario)
  const hiddenHubs = new Set<string>();
  for (const n of [...nodes.values()]) {
    if (n.kind === 'artist' || n.meta?.userAdded) continue;
    const count = hubArtists.get(n.id)?.size ?? 0;
    if (count === 0 || (!opts.showSingleHubs && count < 2)) {
      hiddenHubs.add(n.id);
      nodes.delete(n.id);
    }
  }
  for (const [k, ed] of [...edges.entries()]) {
    if (!nodes.has(ed.source) || !nodes.has(ed.target)) edges.delete(k);
  }

  return { nodes, edges, hiddenHubs, entityOf, nodeOf };
}
