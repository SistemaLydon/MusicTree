// Alta de entidades y enriquecimiento con todas las fuentes.
//
// Un artista puede entrar por MusicBrainz, Spotify o Discogs. Al enriquecerlo se
// cruzan los identificadores (enlaces de MusicBrainz, Wikidata, URLs de Discogs)
// para consultar el resto de fuentes, y si dos entradas resultan ser el mismo
// artista se fusionan.

import { db } from './db';
import {
  areaBits,
  beginAreaOf,
  browseReleases,
  discogsIdFromUrl,
  extractLabelRels,
  extractRelations,
  extractUrls,
  lookupArtist,
  lookupByUrl,
  lookupLabel,
  searchArtists,
  searchLabels,
  spotifyIdFromUrl,
  summarizeReleases,
  wikidataIdFromUrl,
} from './api/musicbrainz';
import { getDiscogsArtist, getDiscogsWorks, searchDiscogsArtists, stripDiscogsNumber, summarizeDiscogs, DiscogsNotConfigured, discogsGenreFamily } from './api/discogs';
import {
  getSpotifyAlbum,
  getSpotifyArtist,
  getSpotifyDiscography,
  labelFromCopyright,
  pickImage,
  searchSpotifyArtists,
  spotifyConfigured,
  SpotifyNotConfigured,
} from './api/spotify';
import { wikidataLookup } from './api/wikidata';
import { lastfmSimilar, lastfmTopTags, LastfmNotConfigured } from './api/lastfm';
import { getKeys } from './keys';
import { HttpError } from './api/queue';
import { familyOfStyles, labelKey, mergeStyles, norm, stylesFromTags, topFamily } from './normalize';
import type { ApiSource, ArtistData, Entity, ExternalIds, FamilyId, LabelFact, RelationFact, SceneFact, SearchCandidate, Source, StyleFact } from './types';

export const emptyData = (): ArtistData => ({ urls: {}, styles: [], labels: [], relations: [] });

export function entityIdFor(c: Pick<SearchCandidate, 'kind' | 'source' | 'id'>) {
  const prefix = c.source === 'spotify' ? 'sp:' : c.source === 'discogs' ? 'dg:' : '';
  return `${c.kind}:${prefix}${c.id}`;
}

function idsFor(c: SearchCandidate): ExternalIds {
  if (c.source === 'spotify') return { spotify: c.id };
  if (c.source === 'discogs') return { discogs: c.id };
  return { mb: c.id };
}

async function findByIds(kind: Entity['kind'], ids: ExternalIds, exclude?: string): Promise<Entity | undefined> {
  const all = await db.entities.where('kind').equals(kind).toArray();
  return all.find(
    (e) =>
      e.id !== exclude &&
      ((ids.mb && e.ids?.mb === ids.mb) || (ids.spotify && e.ids?.spotify === ids.spotify) || (ids.discogs && e.ids?.discogs === ids.discogs)),
  );
}

/** Añade una entidad confirmada (desde el buscador o una importación) */
export async function addEntity(c: SearchCandidate, opts: { candidates?: SearchCandidate[] } = {}) {
  const ids = idsFor(c);
  const existing = (await db.entities.get(entityIdFor(c))) ?? (await findByIds(c.kind, ids));
  if (existing) {
    if (existing.origin !== 'mine') await db.entities.update(existing.id, { origin: 'mine' });
    return existing;
  }
  const e: Entity = {
    id: entityIdFor(c),
    kind: c.kind,
    mbid: ids.mb,
    ids,
    name: c.name,
    status: 'pendiente',
    origin: 'mine',
    addedAt: Date.now(),
    data: {
      ...emptyData(),
      disambiguation: c.source === 'musicbrainz' ? c.disambiguation : undefined,
      country: c.country,
      mbType: c.type,
      image: c.image ? { url: c.image, source: c.source } : undefined,
    },
    user: {},
    candidates: opts.candidates,
  };
  await db.entities.put(e);
  return e;
}

// ─── Resolución automática de nombres (lista de prueba, importación) ────────
const LABEL_HINT = /\b(records?|recordings|label|discos|disques|schallplatten|music group)\b/i;

export interface Resolution {
  pick?: SearchCandidate;
  ambiguous: boolean;
  candidates: SearchCandidate[];
}

export async function resolveName(name: string): Promise<Resolution> {
  const n = norm(name);
  const artists = await searchArtists(name, { priority: 5, limit: 8 });
  const exactArtists = artists.filter((a) => norm(a.name) === n);
  const wantsLabel = LABEL_HINT.test(name);
  let labels: SearchCandidate[] = [];
  if (wantsLabel || exactArtists.length === 0) labels = await searchLabels(name, { priority: 5, limit: 6 });
  // en sellos se compara sin sufijos: "Factory Records" ≈ "Factory"
  const key = labelKey(name);
  const exactLabels = labels.filter((l) => labelKey(l.name) === key && l.type !== 'Publisher' && l.type !== 'Bootleg Production');

  const all = [...artists, ...labels];
  if (exactLabels.length && (wantsLabel || exactArtists.length === 0)) {
    const sorted = [...exactLabels].sort((a, b) => rankLabel(b) - rankLabel(a));
    const clear = sorted.length === 1 || rankLabel(sorted[0]) - rankLabel(sorted[1]) >= 0.5;
    return { pick: sorted[0], ambiguous: !clear, candidates: all };
  }
  if (exactArtists.length === 1) return { pick: exactArtists[0], ambiguous: false, candidates: all };
  if (exactArtists.length > 1) {
    // varios con el mismo nombre: el que tenga más información y mejor puntuación
    const sorted = [...exactArtists].sort((a, b) => info(b) - info(a));
    const clear = info(sorted[0]) >= info(sorted[1]) + 3;
    return { pick: sorted[0], ambiguous: !clear, candidates: all };
  }
  // no está en MusicBrainz: probamos Spotify y Discogs
  const extra: SearchCandidate[] = [];
  if (await spotifyConfigured()) extra.push(...(await searchSpotifyArtists(name, { priority: 5, limit: 5 }).catch(() => [])));
  if ((await getKeys()).discogsToken) extra.push(...(await searchDiscogsArtists(name, { priority: 5, limit: 5 }).catch(() => [])));
  const exactExtra = extra.filter((c) => norm(c.name) === n);
  const candidates = [...all, ...extra];
  if (exactExtra.length) {
    // con un único resultado exacto por fuente lo damos por bueno
    const sp = exactExtra.filter((c) => c.source === 'spotify');
    const dg = exactExtra.filter((c) => c.source === 'discogs');
    const pick = sp[0] ?? dg[0];
    return { pick, ambiguous: sp.length > 1 || (!sp.length && dg.length > 1), candidates };
  }
  if (artists[0] && artists[0].score >= 95) return { pick: artists[0], ambiguous: true, candidates };
  return { pick: undefined, ambiguous: true, candidates };
}

function info(c: SearchCandidate) {
  return c.score / 10 + (c.topTag ? 4 : 0) + (c.disambiguation ? 0 : 1) + (c.country ? 1 : 0) + (c.begin ? 1 : 0);
}
function rankLabel(c: SearchCandidate) {
  const type = c.type === 'Original Production' ? 3 : c.type === 'Imprint' ? 2 : c.type === 'Holding' || c.type === 'Distributor' ? 0.5 : 1;
  // una aclaración del tipo "no confundir con…" suele marcar el sello minoritario
  const penalty = c.disambiguation && /not the|no confundir|not to be confused/i.test(c.disambiguation) ? 1.5 : 0;
  return type + c.score / 100 - penalty;
}

// ─── Enriquecimiento ────────────────────────────────────────────────────────
export function eraDecade(year: number) {
  // Se desplaza dos años: un grupo que se forma en 1988 pertenece a la escena de los 90.
  return Math.floor((year + 2) / 10) * 10;
}

export async function enrichEntity(id: string, priority = 0) {
  const e = await db.entities.get(id);
  if (!e) return;
  try {
    if (e.kind === 'artist') await enrichArtist(e, priority);
    else await enrichLabel(e, priority);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.entities.update(id, { status: 'error', error: msg });
  }
}

/** Sustituye los hechos de una fuente y conserva los de las demás */
function replaceSource<T extends { source: Source }>(prev: T[] | undefined, next: T[], source: Source): T[] {
  return [...(prev ?? []).filter((p) => p.source !== source), ...next];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 140);

interface Ctx {
  e: Entity;
  ids: ExternalIds;
  data: ArtistData;
  name: string;
  status: Partial<Record<ApiSource, string>>;
  votes: Partial<Record<FamilyId, number>>;
  years: { source: Source; first?: number; last?: number }[];
  priority: number;
}

function vote(ctx: Ctx, v: Partial<Record<FamilyId, number>>, w = 1) {
  for (const [f, n] of Object.entries(v) as [FamilyId, number][]) ctx.votes[f] = (ctx.votes[f] ?? 0) + n * w;
}

async function enrichArtist(e: Entity, priority: number) {
  const ctx: Ctx = {
    e,
    ids: { ...(e.ids ?? {}), ...(e.mbid && !e.ids?.mb ? { mb: e.mbid } : {}) },
    data: { ...emptyData(), ...e.data },
    name: e.name,
    status: {},
    votes: {},
    years: [],
    priority,
  };

  // 0. Si entró por Spotify o Discogs, ¿tiene ficha en MusicBrainz?
  if (!ctx.ids.mb) {
    try {
      if (ctx.ids.spotify) ctx.ids.mb = await lookupByUrl(`https://open.spotify.com/artist/${ctx.ids.spotify}`, priority);
      if (!ctx.ids.mb && ctx.ids.discogs) ctx.ids.mb = await lookupByUrl(`https://www.discogs.com/artist/${ctx.ids.discogs}`, priority);
    } catch {
      /* se intentará con Wikidata */
    }
  }

  await stepMusicBrainz(ctx);
  await stepWikidata(ctx);
  await stepDiscogs(ctx);
  await stepSpotify(ctx);
  await stepLastfm(ctx);

  // ─── combinar ────────────────────────────────────────────────────────────
  const d = ctx.data;
  const merged = mergeStyles(d.styles);
  for (const s of merged) vote(ctx, { [familyOfStyles([s])]: s.weight * 1.5 });
  d.family = topFamily(ctx.votes);
  d.familyVotes = ctx.votes;
  // años: MusicBrainz y Discogs dan fechas originales; Spotify suele dar reediciones
  const orig = ctx.years.filter((y) => y.source !== 'spotify');
  const pool = orig.length ? orig : ctx.years;
  const firsts = pool.map((y) => y.first).filter((y): y is number => !!y);
  const lasts = ctx.years.map((y) => y.last).filter((y): y is number => !!y);
  d.firstReleaseYear = firsts.length ? Math.min(...firsts) : undefined;
  d.lastReleaseYear = lasts.length ? Math.max(...lasts) : undefined;
  if (d.sceneWikidata && !d.sceneWikidata.decade && d.firstReleaseYear) d.sceneWikidata.decade = eraDecade(d.firstReleaseYear);
  d.sourceStatus = ctx.status;

  const attempted = Object.values(ctx.status).filter((s) => s && s !== 'sin clave' && s !== 'no encontrado' && s !== 'sin ficha');
  const allFailed = attempted.length > 0 && attempted.every((s) => s !== 'ok');
  await db.entities.update(e.id, {
    name: ctx.name,
    ids: ctx.ids,
    mbid: ctx.ids.mb,
    data: d,
    status: allFailed ? 'error' : e.candidates?.length ? 'revisar' : 'enriquecido',
    enrichedAt: Date.now(),
    error: allFailed ? Object.entries(ctx.status).map(([k, v]) => `${k}: ${v}`).join(' · ') : undefined,
  });
  await mergeDuplicates(e.id);
}

// 1. MusicBrainz ─────────────────────────────────────────────────────────────
async function stepMusicBrainz(ctx: Ctx) {
  if (!ctx.ids.mb) {
    ctx.status.musicbrainz = 'sin ficha';
    return;
  }
  try {
    const a = await lookupArtist(ctx.ids.mb, ctx.priority);
    const rel = await browseReleases(ctx.ids.mb, ctx.priority);
    const { labels: releaseLabels, first, last } = summarizeReleases(rel.releases ?? []);
    const { styles, familyVotes } = stylesFromTags(a.genres ?? [], a.tags ?? [], 'musicbrainz');
    vote(ctx, familyVotes);

    const labels: LabelFact[] = [];
    for (const l of [...releaseLabels, ...extractLabelRels(a.relations)]) {
      const prev = labels.find((x) => labelKey(x.name) === labelKey(l.name));
      if (prev) prev.releases = Math.max(prev.releases, l.releases);
      else labels.push(l);
    }

    // Escena = lugar + época. Grupos: lugar de formación. Personas: su área si es
    // una ciudad o región; si MusicBrainz solo da el país, el país.
    const isGroup = !!a.type && a.type !== 'Person' && a.type !== 'Character';
    const area = areaBits(a.area);
    const beginArea = areaBits(beginAreaOf(a));
    const order = isGroup ? [beginArea, area] : [area];
    const place = order.find((p) => p && !p.isCountry) ?? order.find(Boolean);
    const beginYear = a['life-span']?.begin ? parseInt(a['life-span'].begin.slice(0, 4), 10) : undefined;
    const eraYear = first ?? (isGroup ? beginYear : undefined);
    const scene: SceneFact | undefined =
      place && eraYear ? { placeName: place.name, placeId: place.mbid, decade: eraDecade(eraYear), source: 'musicbrainz' } : undefined;

    const urls = extractUrls(a.relations);
    ctx.ids.spotify ??= spotifyIdFromUrl(urls.spotify);
    ctx.ids.discogs ??= discogsIdFromUrl(urls.discogs);
    ctx.ids.wikidata ??= wikidataIdFromUrl(urls.wikidata);
    ctx.years.push({ source: 'musicbrainz', first, last });
    ctx.name = a.name;
    const d = ctx.data;
    Object.assign(d, {
      mbType: a.type ?? undefined,
      disambiguation: a.disambiguation || undefined,
      country: a.country ?? undefined,
      area,
      beginArea,
      lifeSpan: { begin: a['life-span']?.begin ?? undefined, end: a['life-span']?.end ?? undefined, ended: a['life-span']?.ended ?? undefined },
      urls: { ...d.urls, ...urls },
      scene: d.scene?.source === 'manual' ? d.scene : scene,
      rawTags: [...(a.genres ?? []), ...(a.tags ?? [])],
    });
    d.styles = replaceSource(d.styles, styles, 'musicbrainz');
    d.labels = replaceSource(d.labels, labels, 'musicbrainz');
    d.relations = replaceSource(d.relations, extractRelations(a.relations), 'musicbrainz');
    ctx.status.musicbrainz = 'ok';
  } catch (err) {
    ctx.status.musicbrainz = errText(err);
  }
}

// 2. Wikidata ────────────────────────────────────────────────────────────────
async function stepWikidata(ctx: Ctx) {
  try {
    const wd = await wikidataLookup(ctx.ids, ctx.priority);
    if (!wd) {
      ctx.status.wikidata = 'no encontrado';
      return;
    }
    const hadMb = !!ctx.ids.mb;
    ctx.ids.wikidata = wd.qid;
    ctx.ids.mb ??= wd.ids.mb;
    ctx.ids.spotify ??= wd.ids.spotify;
    ctx.ids.discogs ??= wd.ids.discogs;
    // Wikidata nos ha llevado a una ficha de MusicBrainz que no teníamos
    if (!hadMb && ctx.ids.mb) await stepMusicBrainz(ctx);

    const d = ctx.data;
    const { styles, familyVotes } = stylesFromTags(wd.genres.map((g) => ({ name: g, count: 1 })), [], 'wikidata');
    vote(ctx, familyVotes, 0.8);
    d.styles = replaceSource(d.styles, styles, 'wikidata');
    d.labels = replaceSource(d.labels, wd.labels.map((l) => ({ name: l.name, mbid: l.mbid, releases: 2, source: 'wikidata' as const })), 'wikidata');
    d.movements = wd.movements.map((m) => ({ ...m, source: 'wikidata' as const }));
    d.sceneWikidata = wd.formation
      ? { placeName: wd.formation.name, placeId: `wd:${wd.formation.id}`, decade: wd.inception ? eraDecade(wd.inception) : 0, source: 'wikidata' }
      : undefined;
    d.urls = { ...d.urls, wikidata: `https://www.wikidata.org/wiki/${wd.qid}` };
    ctx.status.wikidata = 'ok';
  } catch (err) {
    ctx.status.wikidata = errText(err);
  }
}

// 3. Discogs ─────────────────────────────────────────────────────────────────
async function stepDiscogs(ctx: Ctx) {
  try {
    if (!ctx.ids.discogs) {
      // búsqueda por nombre; si hay varios exactos, gana el que enlaza a nuestro Spotify
      const res = await searchDiscogsArtists(ctx.name, { priority: ctx.priority, limit: 8 });
      const exact = res.filter((r) => norm(r.name) === norm(ctx.name));
      if (exact.length === 1 && !exact[0].disambiguation) ctx.ids.discogs = exact[0].id;
      else if (exact.length && ctx.ids.spotify) {
        for (const c of exact.slice(0, 3)) {
          const a = await getDiscogsArtist(c.id, ctx.priority);
          if (a.urls?.some((u) => spotifyIdFromUrl(u) === ctx.ids.spotify)) {
            ctx.ids.discogs = c.id;
            break;
          }
        }
      } else if (exact.length) ctx.ids.discogs = exact[0].id;
    }
    if (!ctx.ids.discogs) {
      ctx.status.discogs = 'no encontrado';
      return;
    }
    let a = await getDiscogsArtist(ctx.ids.discogs, ctx.priority);
    // MusicBrainz a veces enlaza el perfil del nombre real ("Alice McLeod",
    // "William Bevan"); si uno de sus alias se llama como nuestro artista, usamos ese.
    if (norm(stripDiscogsNumber(a.name)) !== norm(ctx.name)) {
      const alias = a.aliases?.find((x) => norm(stripDiscogsNumber(x.name)) === norm(ctx.name));
      if (alias) {
        ctx.ids.discogs = String(alias.id);
        a = await getDiscogsArtist(alias.id, ctx.priority);
      }
    }
    const works = await getDiscogsWorks(a.name, ctx.priority);
    const sum = summarizeDiscogs(works, a.name);
    const d = ctx.data;

    // estilos de Discogs: lista cerrada y fiable, se tratan como géneros curados
    const total = Math.max(1, sum.works);
    const { styles, familyVotes } = stylesFromTags(sum.styles.map((s) => ({ name: s.name, count: s.count })), [], 'discogs', 6);
    vote(ctx, familyVotes, 1.2);
    for (const g of sum.genres) {
      const f = discogsGenreFamily(g.name) as FamilyId | undefined;
      if (f) vote(ctx, { [f]: (g.count / total) * 1.5 });
    }
    d.styles = replaceSource(d.styles, styles, 'discogs');
    d.labels = replaceSource(
      d.labels,
      sum.labels.slice(0, 8).map((l) => ({ name: l.name, releases: l.n, source: 'discogs' as const })),
      'discogs',
    );

    // relaciones: miembros, grupos y alias con ids de Discogs
    const rels: RelationFact[] = [
      ...(a.members ?? []).map((m) => ({ type: 'member_of' as const, target: `dg:${m.id}`, targetName: stripDiscogsNumber(m.name), direction: 'backward' as const, source: 'discogs' as const })),
      ...(a.groups ?? []).map((g) => ({ type: 'member_of' as const, target: `dg:${g.id}`, targetName: stripDiscogsNumber(g.name), direction: 'forward' as const, source: 'discogs' as const })),
      ...(a.aliases ?? []).map((g) => ({ type: 'alter_ego' as const, target: `dg:${g.id}`, targetName: stripDiscogsNumber(g.name), direction: 'forward' as const, source: 'discogs' as const })),
    ];
    d.relations = replaceSource(d.relations, rels, 'discogs');
    ctx.ids.spotify ??= a.urls?.map(spotifyIdFromUrl).find(Boolean);
    d.urls = { ...d.urls, discogs: d.urls.discogs ?? `https://www.discogs.com/artist/${a.id}` };
    for (const u of a.urls ?? []) {
      if (!d.urls.bandcamp && /bandcamp\.com/.test(u)) d.urls.bandcamp = u;
      if (!d.urls.soundcloud && /soundcloud\.com/.test(u)) d.urls.soundcloud = u;
      if (!d.urls.youtube && /youtube\.com/.test(u)) d.urls.youtube = u;
    }
    const img = a.images?.find((i) => i.type === 'primary') ?? a.images?.[0];
    if (img && (!d.image || d.image.source === 'discogs')) d.image = { url: img.uri150 || img.uri, source: 'discogs' };
    ctx.years.push({ source: 'discogs', first: sum.firstYear, last: sum.lastYear });
    if (!ctx.ids.mb) ctx.name = stripDiscogsNumber(a.name);
    ctx.status.discogs = 'ok';
  } catch (err) {
    ctx.status.discogs = err instanceof DiscogsNotConfigured ? 'sin clave' : errText(err);
  }
}

// 4. Spotify ─────────────────────────────────────────────────────────────────
async function stepSpotify(ctx: Ctx) {
  try {
    if (!(await spotifyConfigured())) {
      ctx.status.spotify = 'sin clave';
      return;
    }
    if (!ctx.ids.spotify) {
      // solo aceptamos una coincidencia exacta única: con homónimos es mejor no adivinar
      const res = await searchSpotifyArtists(ctx.name, { priority: ctx.priority, limit: 10 });
      const exact = res.filter((r) => norm(r.name) === norm(ctx.name));
      if (exact.length === 1) ctx.ids.spotify = exact[0].id;
    }
    if (!ctx.ids.spotify) {
      ctx.status.spotify = 'no encontrado';
      return;
    }
    const d = ctx.data;
    const a = await getSpotifyArtist(ctx.ids.spotify, ctx.priority);
    const img = pickImage(a.images, 200);
    if (img) d.image = { url: img, source: 'spotify' };
    const { styles, familyVotes } = stylesFromTags([], (a.genres ?? []).map((g, i) => ({ name: g, count: 10 - i })), 'spotify');
    vote(ctx, familyVotes, 0.7);
    d.styles = replaceSource(d.styles, styles, 'spotify');
    d.urls = { ...d.urls, spotify: `https://open.spotify.com/artist/${a.id}` };

    const disco = await getSpotifyDiscography(ctx.ids.spotify, ctx.priority);
    ctx.years.push({ source: 'spotify', first: disco.firstYear, last: disco.lastYear });
    // sellos a partir del ℗ de los álbumes
    const counts = new Map<string, { name: string; n: number }>();
    for (const al of disco.forCopyright) {
      const full = await getSpotifyAlbum(al.id, ctx.priority);
      const p = full.copyrights?.find((c) => c.type === 'P') ?? full.copyrights?.[0];
      const label = p && labelFromCopyright(p.text, a.name);
      if (!label) continue;
      const k = labelKey(label);
      const c = counts.get(k) ?? { name: label, n: 0 };
      c.n++;
      counts.set(k, c);
    }
    d.labels = replaceSource(d.labels, [...counts.values()].map((c) => ({ name: c.name, releases: c.n, source: 'spotify' as const })), 'spotify');
    if (!ctx.ids.mb && !ctx.ids.discogs) ctx.name = a.name;
    ctx.status.spotify = 'ok';
  } catch (err) {
    // un 404 suele ser un enlace viejo de MusicBrainz a una ficha de Spotify que ya no existe
    if (err instanceof HttpError && err.status === 404) {
      ctx.ids.spotify = undefined;
      ctx.status.spotify = 'no encontrado';
    } else ctx.status.spotify = err instanceof SpotifyNotConfigured ? 'sin clave' : errText(err);
  }
}

// 5. Last.fm ─────────────────────────────────────────────────────────────────
async function stepLastfm(ctx: Ctx) {
  try {
    const tags = await lastfmTopTags(ctx.name, ctx.ids.mb, ctx.priority);
    const { styles, familyVotes } = stylesFromTags([], tags, 'lastfm');
    vote(ctx, familyVotes, 0.6);
    ctx.data.styles = replaceSource(ctx.data.styles, styles, 'lastfm');
    ctx.data.similar = await lastfmSimilar(ctx.name, ctx.priority).catch(() => ctx.data.similar);
    ctx.status.lastfm = 'ok';
  } catch (err) {
    ctx.status.lastfm = err instanceof LastfmNotConfigured ? 'sin clave' : errText(err);
  }
}

async function enrichLabel(e: Entity, priority: number) {
  const mbid = e.ids?.mb ?? e.mbid;
  if (!mbid) {
    await db.entities.update(e.id, { status: 'enriquecido', enrichedAt: Date.now() });
    return;
  }
  const l = await lookupLabel(mbid, priority);
  const { styles, familyVotes } = stylesFromTags(l.genres ?? [], l.tags ?? [], 'musicbrainz');
  const data: ArtistData = {
    ...emptyData(),
    ...e.data,
    mbType: l.type ?? undefined,
    disambiguation: l.disambiguation || undefined,
    country: l.country ?? undefined,
    area: areaBits(l.area),
    lifeSpan: { begin: l['life-span']?.begin ?? undefined, end: l['life-span']?.end ?? undefined },
    urls: { ...e.data.urls, ...extractUrls(l.relations) },
    styles,
    family: styles.length ? familyOfStyles(styles) : topFamily(familyVotes),
    relations: extractRelations(l.relations),
  };
  await db.entities.update(e.id, {
    name: l.name,
    ids: { ...e.ids, mb: mbid },
    data,
    status: e.candidates?.length ? 'revisar' : 'enriquecido',
    enrichedAt: Date.now(),
    error: undefined,
  });
}

/**
 * Si al cruzar fuentes resulta que otra entrada es el mismo artista (mismo id de
 * MusicBrainz, Spotify o Discogs), se fusionan: se queda la más antigua.
 */
async function mergeDuplicates(id: string) {
  const e = await db.entities.get(id);
  if (!e) return;
  const dup = await findByIds(e.kind, e.ids, e.id);
  if (!dup) return;
  const [keep, drop] = dup.addedAt <= e.addedAt ? [dup, e] : [e, dup];
  await db.transaction('rw', db.entities, db.manualEdges, async () => {
    await db.entities.update(keep.id, {
      ids: { ...drop.ids, ...keep.ids },
      user: { ...drop.user, ...keep.user, notes: [keep.user.notes, drop.user.notes].filter(Boolean).join('\n') || undefined },
      origin: keep.origin === 'mine' || drop.origin === 'mine' ? 'mine' : keep.origin,
      status: 'pendiente',
    });
    await db.entities.delete(drop.id);
    const edges = await db.manualEdges.toArray();
    for (const m of edges) {
      if (m.source === drop.id || m.target === drop.id) {
        await db.manualEdges.update(m.id, { source: m.source === drop.id ? keep.id : m.source, target: m.target === drop.id ? keep.id : m.target });
      }
    }
  });
}

// ─── Orquestador: procesa las entidades pendientes de dos en dos ───────────
let running = false;
export async function processPending(onTick?: () => void) {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const batch = await db.entities.where('status').equals('pendiente').limit(2).toArray();
      if (!batch.length) break;
      await Promise.all(batch.map((b) => enrichEntity(b.id)));
      onTick?.();
    }
  } finally {
    running = false;
  }
}

export async function reenrich(id: string) {
  const e = await db.entities.get(id);
  if (!e) return;
  await db.entities.update(id, { status: 'pendiente', error: undefined });
}

/** Vuelve a consultar todas las fuentes (las respuestas cacheadas no gastan peticiones) */
export async function reenrichAll() {
  await db.entities.toCollection().modify({ status: 'pendiente', error: undefined });
}

export type { StyleFact };
