import type { FamilyId, LabelFact, StyleFact, Source } from './types';

// ─── Familias (dan el color) ────────────────────────────────────────────────
export const FAMILIES: Record<FamilyId, { name: string; color: string }> = {
  electronica: { name: 'Electrónica', color: '#5fa3b5' },
  rock: { name: 'Rock / indie', color: '#c47d5c' },
  hiphop: { name: 'Hip hop / rap', color: '#c9a94f' },
  jazz: { name: 'Jazz / soul / funk', color: '#b86a83' },
  pop: { name: 'Pop', color: '#d394b6' },
  folk: { name: 'Folk / world', color: '#8cab6c' },
  clasica: { name: 'Clásica / contemporánea', color: '#a79bd8' },
  experimental: { name: 'Experimental / ambient', color: '#7f8ca3' },
  otros: { name: 'Sin clasificar', color: '#8a8a8a' },
};

// ─── Estilos canónicos ──────────────────────────────────────────────────────
// [id, nombre visible, familia, alias que se mapean a él]
type StyleDef = [string, string, FamilyId, string[]];

const STYLE_DEFS: StyleDef[] = [
  // electrónica
  ['techno', 'techno', 'electronica', []],
  ['detroit-techno', 'Detroit techno', 'electronica', []],
  ['dub-techno', 'dub techno', 'electronica', []],
  ['minimal-techno', 'minimal techno', 'electronica', ['minimal']],
  ['acid-techno', 'acid techno', 'electronica', []],
  ['hard-techno', 'hard techno', 'electronica', []],
  ['industrial-techno', 'industrial techno', 'electronica', []],
  ['house', 'house', 'electronica', []],
  ['deep-house', 'deep house', 'electronica', []],
  ['acid-house', 'acid house', 'electronica', []],
  ['tech-house', 'tech house', 'electronica', []],
  ['chicago-house', 'Chicago house', 'electronica', []],
  ['electro', 'electro', 'electronica', []],
  ['idm', 'IDM', 'electronica', ['intelligent dance music', 'braindance']],
  ['braindance', 'braindance', 'electronica', []],
  ['drill-and-bass', 'drill and bass', 'electronica', ["drill 'n' bass", 'drill n bass']],
  ['drum-and-bass', 'drum and bass', 'electronica', ['dnb', "drum 'n' bass", 'drum n bass']],
  ['jungle', 'jungle', 'electronica', []],
  ['breakbeat', 'breakbeat', 'electronica', ['breaks']],
  ['big-beat', 'big beat', 'electronica', []],
  ['uk-garage', 'UK garage', 'electronica', ['garage', '2-step', '2step']],
  ['future-garage', 'future garage', 'electronica', []],
  ['dubstep', 'dubstep', 'electronica', []],
  ['grime', 'grime', 'hiphop', []],
  ['bass-music', 'bass music', 'electronica', ['uk bass']],
  ['trip-hop', 'trip hop', 'electronica', ['triphop', 'trip-hop']],
  ['downtempo', 'downtempo', 'electronica', ['chillout', 'chill-out']],
  ['synth-pop', 'synth-pop', 'pop', ['synthpop', 'synth pop', 'electropop', 'electro-pop']],
  ['krautrock', 'krautrock', 'rock', ['kraut rock', 'kosmische musik', 'kosmische']],
  ['electronic-body-music', 'EBM', 'electronica', ['ebm']],
  ['trance', 'trance', 'electronica', []],
  ['hardcore-techno', 'hardcore', 'electronica', ['gabber']],
  ['footwork', 'footwork', 'electronica', ['juke']],
  ['electroclash', 'electroclash', 'electronica', []],
  ['italo-disco', 'italo disco', 'electronica', ['italo']],
  ['disco', 'disco', 'jazz', []],
  ['nu-disco', 'nu-disco', 'electronica', []],
  ['leftfield', 'leftfield', 'electronica', []],
  ['microhouse', 'microhouse', 'electronica', []],
  ['glitch', 'glitch', 'experimental', []],
  ['ambient-techno', 'ambient techno', 'electronica', []],
  ['hauntology', 'hauntology', 'experimental', []],
  ['electroacoustic', 'electroacústica', 'clasica', ['electroacoustic music', 'electroacústica']],
  // experimental / ambient
  ['ambient', 'ambient', 'experimental', []],
  ['dark-ambient', 'dark ambient', 'experimental', []],
  ['drone', 'drone', 'experimental', []],
  ['noise', 'noise', 'experimental', []],
  ['industrial', 'industrial', 'experimental', []],
  ['musique-concrete', 'musique concrète', 'experimental', ['musique concrete']],
  ['sound-art', 'arte sonoro', 'experimental', ['sound art']],
  ['new-age', 'new age', 'experimental', []],
  ['field-recordings', 'field recordings', 'experimental', ['field recording']],
  // rock / indie
  ['post-punk', 'post-punk', 'rock', ['post punk', 'postpunk']],
  ['new-wave', 'new wave', 'rock', []],
  ['punk', 'punk', 'rock', ['punk rock']],
  ['gothic-rock', 'gothic rock', 'rock', ['goth', 'goth rock']],
  ['cold-wave', 'cold wave', 'rock', ['coldwave']],
  ['darkwave', 'darkwave', 'rock', ['dark wave']],
  ['shoegaze', 'shoegaze', 'rock', ['shoegazing']],
  ['dream-pop', 'dream pop', 'rock', []],
  ['indie-rock', 'indie rock', 'rock', []],
  ['indie-pop', 'indie pop', 'rock', []],
  ['noise-pop', 'noise pop', 'rock', []],
  ['post-rock', 'post-rock', 'rock', ['post rock', 'postrock']],
  ['math-rock', 'math rock', 'rock', []],
  ['alternative-rock', 'rock alternativo', 'rock', ['alternative rock', 'alt rock', 'alt-rock']],
  ['art-rock', 'art rock', 'rock', []],
  ['progressive-rock', 'rock progresivo', 'rock', ['progressive rock', 'prog rock', 'prog']],
  ['psychedelic-rock', 'rock psicodélico', 'rock', ['psychedelic rock', 'psychedelic', 'psych']],
  ['madchester', 'Madchester', 'rock', []],
  ['britpop', 'britpop', 'rock', []],
  ['power-pop', 'power pop', 'rock', ['power-pop']],
  ['grunge', 'grunge', 'rock', []],
  ['garage-rock', 'garage rock', 'rock', []],
  ['hardcore-punk', 'hardcore punk', 'rock', ['hardcore punk']],
  ['emo', 'emo', 'rock', []],
  ['slowcore', 'slowcore', 'rock', ['sadcore']],
  ['lo-fi', 'lo-fi', 'rock', ['lofi', 'lo fi']],
  ['dance-punk', 'dance-punk', 'rock', ['dance punk']],
  ['no-wave', 'no wave', 'rock', []],
  ['metal', 'metal', 'rock', ['heavy metal']],
  ['movida', 'Movida', 'rock', ['movida madrileña', 'la movida']],
  ['rock-espanol', 'rock en español', 'rock', ['rock en espanol', 'rock español', 'spanish rock']],
  ['indie-espanol', 'indie español', 'rock', ['spanish indie', 'indie espanol', 'indie español']],
  // pop
  ['art-pop', 'art pop', 'pop', []],
  ['electropop', 'electropop', 'pop', []],
  ['dance-pop', 'dance-pop', 'pop', ['dance pop']],
  ['latin-pop', 'pop latino', 'pop', ['latin pop', 'pop latino']],
  ['hyperpop', 'hyperpop', 'pop', []],
  ['chamber-pop', 'chamber pop', 'pop', []],
  ['baroque-pop', 'baroque pop', 'pop', []],
  ['k-pop', 'K-pop', 'pop', ['kpop']],
  ['j-pop', 'J-pop', 'pop', ['jpop']],
  ['city-pop', 'city pop', 'pop', []],
  ['reggaeton', 'reguetón', 'hiphop', ['reggaetón', 'reguetón', 'reggaeton']],
  // hip hop
  ['boom-bap', 'boom bap', 'hiphop', []],
  ['abstract-hip-hop', 'abstract hip hop', 'hiphop', ['abstract hip-hop']],
  ['instrumental-hip-hop', 'hip hop instrumental', 'hiphop', ['instrumental hip hop', 'instrumental hip-hop']],
  ['jazz-rap', 'jazz rap', 'hiphop', ['jazz hip hop', 'jazz-rap']],
  ['conscious-hip-hop', 'conscious hip hop', 'hiphop', []],
  ['trap', 'trap', 'hiphop', []],
  ['drill', 'drill', 'hiphop', []],
  ['g-funk', 'g-funk', 'hiphop', []],
  ['east-coast-hip-hop', 'East Coast hip hop', 'hiphop', []],
  ['west-coast-hip-hop', 'West Coast hip hop', 'hiphop', []],
  ['southern-hip-hop', 'Southern hip hop', 'hiphop', []],
  ['experimental-hip-hop', 'hip hop experimental', 'hiphop', ['experimental hip hop']],
  ['rnb', 'R&B', 'jazz', ['r&b', 'rnb', 'contemporary r&b', 'alternative r&b']],
  // jazz / soul / funk
  ['spiritual-jazz', 'spiritual jazz', 'jazz', []],
  ['free-jazz', 'free jazz', 'jazz', []],
  ['avant-garde-jazz', 'jazz de vanguardia', 'jazz', ['avant-garde jazz']],
  ['modal-jazz', 'modal jazz', 'jazz', ['modal']],
  ['contemporary-jazz', 'jazz contemporáneo', 'jazz', ['contemporary jazz']],
  ['free-improvisation', 'improvisación libre', 'experimental', ['free improvisation']],
  ['hard-bop', 'hard bop', 'jazz', []],
  ['bebop', 'bebop', 'jazz', ['bop']],
  ['post-bop', 'post-bop', 'jazz', []],
  ['cool-jazz', 'cool jazz', 'jazz', []],
  ['jazz-fusion', 'jazz fusion', 'jazz', ['fusion']],
  ['jazz-funk', 'jazz-funk', 'jazz', []],
  ['soul-jazz', 'soul jazz', 'jazz', []],
  ['nu-jazz', 'nu jazz', 'jazz', []],
  ['ecm', 'ECM jazz', 'jazz', []],
  ['soul', 'soul', 'jazz', []],
  ['neo-soul', 'neo soul', 'jazz', ['neo-soul']],
  ['funk', 'funk', 'jazz', []],
  ['afrobeat', 'afrobeat', 'folk', []],
  ['gospel', 'gospel', 'jazz', []],
  ['blues', 'blues', 'jazz', []],
  // folk / world
  ['flamenco', 'flamenco', 'folk', []],
  ['flamenco-pop', 'flamenco pop', 'pop', []],
  ['rumba', 'rumba', 'folk', []],
  ['copla', 'copla', 'folk', []],
  ['nuevo-flamenco', 'nuevo flamenco', 'folk', ['new flamenco']],
  ['cumbia', 'cumbia', 'folk', []],
  ['bossa-nova', 'bossa nova', 'folk', []],
  ['mpb', 'MPB', 'folk', []],
  ['tropicalia', 'tropicália', 'folk', ['tropicalia', 'tropicália']],
  ['reggae', 'reggae', 'folk', []],
  ['dub', 'dub', 'folk', []],
  ['dancehall', 'dancehall', 'folk', []],
  ['folk-rock', 'folk rock', 'folk', []],
  ['indie-folk', 'indie folk', 'folk', []],
  ['singer-songwriter', 'cantautor', 'folk', ['singer/songwriter', 'cantautor']],
  ['fado', 'fado', 'folk', []],
  ['highlife', 'highlife', 'folk', []],
  ['ethio-jazz', 'ethio-jazz', 'jazz', ['ethiopian jazz']],
  ['salsa', 'salsa', 'folk', []],
  ['latin', 'latina', 'folk', ['latin music']],
  // clásica / contemporánea
  ['minimalism', 'minimalismo', 'clasica', ['minimalist', 'minimal music']],
  ['contemporary-classical', 'clásica contemporánea', 'clasica', ['contemporary classical', 'modern classical', '20th century classical', 'contemporary', 'modern']],
  ['neoclassical', 'neoclásica', 'clasica', ['neo-classical', 'modern composition', 'neoclassical darkwave']],
  ['avant-garde', 'vanguardia', 'experimental', ['avant-garde', 'avantgarde', 'avant garde']],
  ['electronic-music-classical', 'música electrónica académica', 'clasica', []],
  ['opera', 'ópera', 'clasica', []],
  ['baroque', 'barroco', 'clasica', []],
  ['romantic', 'romanticismo', 'clasica', []],
  ['soundtrack', 'banda sonora', 'clasica', ['film score', 'score', 'soundtrack']],
];

export interface StyleInfo {
  id: string;
  name: string;
  family: FamilyId;
}

const STYLES = new Map<string, StyleInfo>();
const ALIASES = new Map<string, string>();
for (const [id, name, family, aliases] of STYLE_DEFS) {
  STYLES.set(id, { id, name, family });
  ALIASES.set(norm(name), id);
  ALIASES.set(norm(id.replace(/-/g, ' ')), id);
  for (const a of aliases) ALIASES.set(norm(a), id);
}

// Tags que solo indican familia: no crean nodo de estilo, pero votan color.
const FAMILY_ONLY: Record<string, FamilyId> = {
  electronic: 'electronica',
  electronica: 'electronica',
  'electronic music': 'electronica',
  dance: 'electronica',
  'dance music': 'electronica',
  edm: 'electronica',
  club: 'electronica',
  rock: 'rock',
  indie: 'rock',
  alternative: 'rock',
  'alternative/indie': 'rock',
  pop: 'pop',
  'pop rock': 'pop',
  'hip hop': 'hiphop',
  'hip-hop': 'hiphop',
  hiphop: 'hiphop',
  rap: 'hiphop',
  jazz: 'jazz',
  'soul and r&b': 'jazz',
  folk: 'folk',
  world: 'folk',
  'world music': 'folk',
  classical: 'clasica',
  'classical music': 'clasica',
  experimental: 'experimental',
  'experimental electronic': 'experimental',
  'funk / soul': 'jazz',
  'folk, world, & country': 'folk',
  'stage & screen': 'clasica',
  'non-music': 'otros',
  'brass & military': 'otros',
  "children's": 'otros',
  'electronica/dance': 'electronica',
};

// Tags que no aportan nada
const DISCARD = new Set(
  [
    'seen live', 'favorites', 'favourites', 'favorite', 'favourite', 'albums i own', 'my favorite', 'love', 'awesome',
    'beautiful', 'cool', 'chill', 'chillout music', 'mellow', 'sexy', 'amazing', 'good', 'best', 'classic', 'legend',
    'male vocalists', 'female vocalists', 'male vocalist', 'female vocalist', 'singer', 'vocal', 'instrumental',
    'producer', 'dj', 'band', 'composer', 'multiple artists', 'under 2000 listeners', 'spotify', 'check out',
    'british', 'uk', 'english', 'england', 'scottish', 'scotland', 'irish', 'welsh', 'american', 'usa', 'us',
    'german', 'germany', 'deutsch', 'french', 'france', 'spanish', 'spain', 'español', 'espanol', 'españa', 'catalan',
    'italian', 'japanese', 'japan', 'canadian', 'australian', 'swedish', 'norwegian', 'icelandic', 'dutch', 'belgian',
    'brazilian', 'mexican', 'argentinian', 'latin american', 'european', 'african', 'jamaican', 'russian', 'polish',
    'detroit', 'berlin', 'london', 'manchester', 'bristol', 'chicago', 'new york', 'cornwall', 'granada', 'barcelona', 'madrid',
    'rhythm', 'beats', 'unknown', 'misc', 'other', 'various', 'warp', 'warp records', 'factory records',
  ].map(norm),
);

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(s: string): string {
  return norm(s).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DECADE_RE = /^(\d0s|\d{2}s|\d{4}s|(19|20)\d0s)$/;

/** Heurística de familia para géneros que no están en el diccionario */
export function guessFamily(tag: string): FamilyId {
  const t = norm(tag);
  if (/jazz|soul|funk|bop|swing|blues|gospel|r&b|rnb|disco/.test(t)) return 'jazz';
  if (/hip ?hop|rap|trap|drill|grime|boom bap/.test(t)) return 'hiphop';
  if (/techno|house|electro|trance|garage|bass|step|jungle|breakbeat|idm|edm|rave|club|synth|dance/.test(t)) return 'electronica';
  if (/ambient|drone|noise|experimental|industrial|avant|concrete|glitch/.test(t)) return 'experimental';
  if (/classical|baroque|opera|minimalis|chamber|orchestral|contemporary|symphon|choral|romantic/.test(t)) return 'clasica';
  if (/folk|flamenco|world|cumbia|samba|bossa|reggae|dub|afro|latin|fado|tango|rumba|copla|son |salsa|bolero/.test(t)) return 'folk';
  if (/rock|punk|wave|metal|indie|gaze|grunge|emo|core|psych|kraut|goth/.test(t)) return 'rock';
  if (/pop/.test(t)) return 'pop';
  return 'otros';
}

export function getStyle(id: string): StyleInfo | undefined {
  return STYLES.get(id);
}

/** Estilos que se crean al vuelo para géneros nuevos (se recuerdan en memoria) */
const dynamicStyles = new Map<string, StyleInfo>();
export function styleInfo(id: string): StyleInfo {
  return STYLES.get(id) ?? dynamicStyles.get(id) ?? { id, name: id.replace(/-/g, ' '), family: guessFamily(id.replace(/-/g, ' ')) };
}

export type NormalizedTag =
  | { kind: 'style'; style: StyleInfo }
  | { kind: 'family'; family: FamilyId }
  | { kind: 'discard' };

/**
 * Normaliza un tag suelto. `curated` indica que viene de la lista oficial de
 * géneros de MusicBrainz (más fiable que un tag libre): en ese caso aceptamos
 * géneros que no están en el diccionario y les asignamos familia por heurística.
 */
export function normalizeTag(raw: string, curated: boolean): NormalizedTag {
  const t = norm(raw);
  if (!t || DISCARD.has(t) || DECADE_RE.test(t.replace(/'/g, ''))) return { kind: 'discard' };
  const fam = FAMILY_ONLY[t];
  if (fam) return { kind: 'family', family: fam };
  const id = ALIASES.get(t);
  if (id) return { kind: 'style', style: STYLES.get(id)! };
  // "spanish indie pop", "uk garage house"... prueba quitando palabras por delante
  const words = t.split(' ');
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(' ');
    const tid = ALIASES.get(tail);
    if (tid && tail.includes(' ')) return { kind: 'style', style: STYLES.get(tid)! };
    if (FAMILY_ONLY[tail] && i === words.length - 1) return { kind: 'family', family: FAMILY_ONLY[tail] };
  }
  if (curated) {
    const family = guessFamily(t);
    const sid = slug(t);
    const info: StyleInfo = { id: sid, name: raw.toLowerCase(), family };
    dynamicStyles.set(sid, info);
    return { kind: 'style', style: info };
  }
  return { kind: 'discard' };
}

export function registerDynamicStyle(info: StyleInfo) {
  if (!STYLES.has(info.id)) dynamicStyles.set(info.id, info);
}

/**
 * Convierte la lista de géneros + tags de una fuente en hechos de estilo y en
 * votos de familia. Se queda con los `max` estilos con más peso.
 */
export function stylesFromTags(
  genres: { name: string; count: number }[],
  tags: { name: string; count: number }[],
  source: Source,
  max = 5,
): { styles: StyleFact[]; familyVotes: Partial<Record<FamilyId, number>> } {
  const score = new Map<string, number>();
  const votes: Partial<Record<FamilyId, number>> = {};
  const maxCount = Math.max(1, ...genres.map((g) => g.count), ...tags.map((g) => g.count));
  const consume = (list: { name: string; count: number }[], curated: boolean, bonus: number) => {
    for (const g of list) {
      if (g.count <= 0 && !curated) continue;
      const n = normalizeTag(g.name, curated);
      const w = (Math.max(g.count, 1) / maxCount) * bonus;
      if (n.kind === 'style') {
        score.set(n.style.id, (score.get(n.style.id) ?? 0) + w);
        votes[n.style.family] = (votes[n.style.family] ?? 0) + w;
      } else if (n.kind === 'family') {
        votes[n.family] = (votes[n.family] ?? 0) + w * 0.8;
      }
    }
  };
  consume(genres, true, 1.5);
  consume(tags, false, 1);
  const sorted = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 1;
  const styles: StyleFact[] = sorted
    .filter(([, w]) => w >= top * 0.2)
    .slice(0, max)
    .map(([style, w]) => ({ style, weight: Math.min(1, w / top), source }));
  return { styles, familyVotes: votes };
}

export function topFamily(votes: Partial<Record<FamilyId, number>>): FamilyId {
  let best: FamilyId = 'otros';
  let bestW = 0;
  for (const [f, w] of Object.entries(votes) as [FamilyId, number][]) {
    if (w > bestW) {
      best = f;
      bestW = w;
    }
  }
  return best;
}

/** Familia principal a partir de los estilos ya normalizados */
export function familyOfStyles(styles: StyleFact[]): FamilyId {
  const votes: Partial<Record<FamilyId, number>> = {};
  for (const s of styles) {
    const f = styleInfo(s.style).family;
    votes[f] = (votes[f] ?? 0) + s.weight;
  }
  return topFamily(votes);
}

/** Clave de sello: quita sufijos societarios para que "Warp Records" y "Warp" coincidan */
export function labelKey(name: string): string {
  let n = norm(name).split('|')[0].trim();
  for (let i = 0; i < 3; i++) {
    n = n
      .replace(/[,.]?\s*(ltd|limited|inc|gmbh|s\.?a\.?|s\.?l\.?|llc|co)\.?$/, '')
      .replace(/\s+(records?|recordings|schallplatten|label|music|musik|discos|disques|entertainment|group)$/, '')
      .trim();
  }
  return slug(n);
}

// ─── Fusión de estilos de varias fuentes ────────────────────────────────────
const SOURCE_WEIGHT: Record<string, number> = { discogs: 1.2, musicbrainz: 1, wikidata: 0.9, lastfm: 0.8, spotify: 0.7, manual: 3, inferida: 0.6 };

/** Combina los estilos de todas las fuentes y devuelve los `max` más fuertes */
export function mergeStyles(styles: StyleFact[], max = 6): StyleFact[] {
  const score = new Map<string, { w: number; sources: Set<string> }>();
  for (const s of styles) {
    const e = score.get(s.style) ?? { w: 0, sources: new Set() };
    e.w += s.weight * (SOURCE_WEIGHT[s.source] ?? 1);
    e.sources.add(s.source);
    score.set(s.style, e);
  }
  // un estilo confirmado por varias fuentes pesa más
  const sorted = [...score.entries()].map(([style, e]) => [style, e.w * (1 + 0.15 * (e.sources.size - 1)), e] as const).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 1;
  // umbral bajo: un estilo secundario que solo da una fuente (el flamenco de Los
  // Planetas en Discogs) también cuenta, siempre dentro del máximo
  return sorted
    .filter(([, w]) => w >= top * 0.1)
    .slice(0, max)
    .map(([style, w, e]) => ({ style, weight: Math.min(1, w / top), source: (e.sources.has('manual') ? 'manual' : [...e.sources][0]) as Source }));
}

// ─── Sellos ─────────────────────────────────────────────────────────────────
const MAJOR_RE =
  /^(sony( music)?|columbia|epic|rca( victor)?|emi|capitol|warner( bros\.?)?|wea|universal( music)?|umc|interscope|republic|atlantic|polydor|virgin|parlophone|mercury|bmg|island|geffen|def jam|elektra|arista|decca|philips|vertigo|sire|london|reprise|a&m|mca|cbs|ariola|zomba|pias|play it again sam)\b/i;
/** Majors y distribuidoras: puntúan la mitad porque crean puentes poco significativos */
export function isMajor(name: string) {
  return MAJOR_RE.test(name.trim());
}

export interface MergedLabel {
  key: string;
  name: string;
  mbid?: string;
  releases: number;
  score: number;
  sources: Source[];
}

/** Combina los sellos de todas las fuentes (por nombre normalizado) y se queda con los principales */
export function mergeLabels(labels: LabelFact[], max = 5): MergedLabel[] {
  const totals = new Map<string, number>();
  for (const l of labels) totals.set(l.source, (totals.get(l.source) ?? 0) + l.releases);
  const by = new Map<string, MergedLabel>();
  for (const l of labels) {
    const key = labelKey(l.name);
    if (!key) continue;
    const share = l.releases / (totals.get(l.source) || 1);
    const m = by.get(key) ?? { key, name: l.name, mbid: l.mbid, releases: 0, score: 0, sources: [] };
    m.score += share * (SOURCE_WEIGHT[l.source] ?? 1);
    m.releases = Math.max(m.releases, l.releases);
    if (!m.sources.includes(l.source)) m.sources.push(l.source);
    if (l.source === 'musicbrainz' && l.mbid) m.mbid = l.mbid;
    // nombre preferido: el de Discogs o MusicBrainz, que suelen ser los "de catálogo"
    if (l.source === 'discogs' || (l.source === 'musicbrainz' && !m.sources.includes('discogs'))) m.name = l.name;
    by.set(key, m);
  }
  const ranked = [...by.values()]
    .map((m) => ({ ...m, score: (m.score + 0.15 * (m.sources.length - 1)) * (isMajor(m.name) ? 0.5 : 1) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  return ranked.filter((m, i) => i === 0 || (m.score >= top * 0.12 && (m.releases >= 2 || m.sources.length > 1))).slice(0, max);
}
