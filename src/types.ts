// ─── Modelo de datos de Árbol musical ───────────────────────────────────────
// Se guardan "entidades" (artistas y sellos que el usuario añade) con los hechos
// que devuelven las fuentes. Los nodos hub (estilo, escena, sello) y las aristas
// se derivan de esos hechos al construir el grafo, así cada arista sabe de qué
// fuente viene y basta con reconstruir para que todo quede coherente.

export type NodeKind = 'artist' | 'label' | 'style' | 'scene';
export type Origin = 'mine' | 'suggestion';
export type EntityStatus = 'pendiente' | 'enriquecido' | 'error' | 'revisar';
export type Source = 'musicbrainz' | 'spotify' | 'discogs' | 'wikidata' | 'lastfm' | 'manual' | 'inferida';
/** Fuentes que se consultan automáticamente */
export type ApiSource = 'musicbrainz' | 'spotify' | 'discogs' | 'wikidata' | 'lastfm';

export type FamilyId =
  | 'electronica'
  | 'rock'
  | 'hiphop'
  | 'jazz'
  | 'pop'
  | 'folk'
  | 'clasica'
  | 'experimental'
  | 'otros';

export type EdgeType =
  | 'style' // artista → estilo
  | 'label' // artista → sello
  | 'scene' // artista → escena
  | 'member_of' // persona → grupo
  | 'shared_member' // grupo ↔ grupo con miembros en común
  | 'side_project' // subgrupo / proyecto paralelo
  | 'collaboration'
  | 'alter_ego' // "is person": alias de la misma persona
  | 'family' // familiares (matrimonio, hermanos...)
  | 'remix'
  | 'manual';

export interface StyleFact {
  style: string; // id canónico, p. ej. "dub-techno"
  weight: number; // 0..1
  source: Source;
}

export interface LabelFact {
  mbid?: string;
  discogsId?: number;
  name: string;
  releases: number; // nº de lanzamientos del artista en ese sello
  source: Source;
}

export interface RelationFact {
  type: Exclude<EdgeType, 'style' | 'label' | 'scene' | 'shared_member' | 'manual'>;
  /** clave del otro artista con prefijo de fuente: "mb:<mbid>" o "dg:<id discogs>" */
  target: string;
  /** @deprecated datos de la fase 1; equivale a target "mb:<mbid>" */
  targetMbid?: string;
  targetName: string;
  // 'forward': esta entidad → target (p. ej. "es miembro de"); 'backward': target → esta
  direction: 'forward' | 'backward';
  source: Source;
}

export interface SceneFact {
  placeName: string; // "Bristol"
  placeId: string; // mbid del área o slug
  decade: number; // 1990
  source: Source;
}

/** Movimiento con nombre propio (Wikidata P135): Madchester, Movida madrileña... */
export interface MovementFact {
  id: string; // QID de Wikidata
  name: string;
  source: Source;
}

export interface ExternalIds {
  mb?: string;
  spotify?: string;
  discogs?: string;
  wikidata?: string;
}

export interface ExternalUrls {
  spotify?: string;
  bandcamp?: string;
  youtube?: string;
  discogs?: string;
  wikidata?: string;
  lastfm?: string;
  soundcloud?: string;
  official?: string;
  wikipedia?: string;
  allmusic?: string;
}

export interface AreaRef {
  name: string;
  mbid: string;
  type?: string;
  isCountry?: boolean;
  iso?: string;
}

export interface ArtistData {
  mbType?: string; // Person | Group | Orchestra...
  disambiguation?: string;
  country?: string; // código ISO
  area?: AreaRef;
  beginArea?: AreaRef;
  lifeSpan?: { begin?: string; end?: string; ended?: boolean };
  firstReleaseYear?: number;
  lastReleaseYear?: number;
  urls: ExternalUrls;
  styles: StyleFact[];
  labels: LabelFact[];
  relations: RelationFact[];
  scene?: SceneFact;
  /** escena alternativa de Wikidata (lugar de formación + inicio) cuando MusicBrainz no la da */
  sceneWikidata?: SceneFact;
  movements?: MovementFact[];
  family?: FamilyId; // familia principal (votos de estilos + tags genéricos)
  familyVotes?: Partial<Record<FamilyId, number>>;
  image?: { url: string; source: Source };
  /** resultado de cada fuente en el último enriquecimiento */
  sourceStatus?: Partial<Record<ApiSource, string>>;
  /** similares de Last.fm (para las sugerencias de la fase 3) */
  similar?: { name: string; mbid?: string; match: number }[];
  rawTags?: { name: string; count: number }[];
}

export interface UserFields {
  notes?: string;
  rating?: number; // 0..5
  discovered?: string; // cómo lo descubrí
}

export interface Entity {
  /** "artist:<mbid>" | "artist:sp:<id spotify>" | "artist:dg:<id discogs>" | "label:<mbid>" | "label:dg:<id>" */
  id: string;
  kind: 'artist' | 'label';
  /** @deprecated usar ids.mb */
  mbid?: string;
  ids: ExternalIds;
  name: string;
  sortName?: string;
  status: EntityStatus;
  origin: Origin;
  addedAt: number;
  enrichedAt?: number;
  error?: string;
  data: ArtistData;
  user: UserFields;
  /** Candidatos alternativos cuando la búsqueda fue ambigua */
  candidates?: SearchCandidate[];
}

export interface ManualEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  removed?: boolean; // tombstone: oculta una arista derivada
  note?: string;
}

export interface CacheEntry {
  key: string;
  data: unknown;
  fetchedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export type CandidateSource = 'musicbrainz' | 'spotify' | 'discogs';

export interface SearchCandidate {
  kind: 'artist' | 'label';
  source: CandidateSource;
  /** id en la fuente de origen */
  id: string;
  name: string;
  image?: string;
  genres?: string[];
  disambiguation?: string;
  type?: string;
  country?: string;
  area?: string;
  begin?: string;
  end?: string;
  topTag?: string;
  score: number;
}

/** Arista ya derivada, lista para el grafo y para explicar conexiones */
export interface DerivedEdge {
  key: string;
  source: string;
  target: string;
  type: EdgeType;
  origin: Source;
  origins: Source[];
  weight: number;
  label?: string; // texto explicativo opcional
}

export interface DerivedNode {
  id: string;
  kind: NodeKind;
  label: string;
  family: FamilyId;
  origin?: Origin;
  status?: EntityStatus;
  meta?: Record<string, unknown>;
}
