import { FAMILIES, mergeLabels, mergeStyles, styleInfo } from '../normalize';
import { decadeLabel, entityKeys, labelNodeId, movementNodeId, relTarget, styleNodeId, type BuiltGraph } from '../graph/build';
import type { DerivedEdge, Entity } from '../types';
import { reenrich } from '../enrich';
import { db } from '../db';

const REL_TEXT: Record<string, [string, string]> = {
  // [desde el origen, desde el destino]
  member_of: ['es miembro de', 'tiene como miembro a'],
  side_project: ['es grupo derivado de', 'es grupo derivado de'],
  collaboration: ['ha colaborado con', 'ha colaborado con'],
  alter_ego: ['es alias de', 'es alias de'],
  family: ['tiene vínculo familiar con', 'tiene vínculo familiar con'],
  remix: ['ha remezclado a', 'ha sido remezclado por'],
  manual: ['conectado a mano con', 'conectado a mano con'],
};

const SOURCE_NAME: Record<string, string> = {
  musicbrainz: 'MusicBrainz',
  discogs: 'Discogs',
  spotify: 'Spotify',
  wikidata: 'Wikidata',
  lastfm: 'Last.fm',
  manual: 'manual',
  inferida: 'inferida',
};

interface Props {
  id: string;
  built: BuiltGraph;
  entities: Map<string, Entity>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function years(e: Entity) {
  const first = e.data.firstReleaseYear;
  const ls = e.data.lifeSpan;
  const end = ls?.ended ? (ls.end?.slice(0, 4) ?? String(e.data.lastReleaseYear ?? '')) : 'hoy';
  if (first) return `${first}–${end || '?'}`;
  // sin discos: para grupos vale el año de formación (para personas sería el nacimiento)
  if (ls?.begin && e.data.mbType !== 'Person') return `${ls.begin.slice(0, 4)}–${end || '?'}`;
  return undefined;
}

function nameOf(id: string, built: BuiltGraph, entities: Map<string, Entity>) {
  return built.nodes.get(id)?.label ?? entities.get(id)?.name ?? id;
}

export function Panel({ id, built, entities, onSelect, onClose }: Props) {
  const node = built.nodes.get(id);
  const entity = entities.get(built.entityOf.get(id) ?? id);
  if (!node && !entity) return null;
  const kind = node?.kind ?? entity!.kind;
  const family = FAMILIES[node?.family ?? entity?.data.family ?? 'otros'];
  const edges = [...built.edges.values()].filter((e) => e.source === id || e.target === id);
  const other = (e: DerivedEdge) => (e.source === id ? e.target : e.source);

  const link = (nid: string, text?: string) => (
    <button className="link" onClick={() => onSelect(nid)} key={nid}>
      {text ?? nameOf(nid, built, entities)}
    </button>
  );

  // ─── explicación de conexiones ────────────────────────────────────────────
  const explanations: React.ReactNode[] = [];
  if (kind === 'artist') {
    for (const e of edges.filter((e) => !['style', 'label', 'scene'].includes(e.type))) {
      const o = other(e);
      if (e.type === 'shared_member') {
        explanations.push(
          <li key={e.key}>
            comparte miembros con {link(o)}
            {e.label && <span className="muted"> ({e.label})</span>}
            <Src s={e.origins} />
          </li>,
        );
        continue;
      }
      const [fwd, bwd] = REL_TEXT[e.type] ?? ['conectado con', 'conectado con'];
      const ent = entity;
      const otherEnt = entities.get(o);
      const keys = otherEnt ? entityKeys(otherEnt) : [];
      const rel = ent?.data.relations.find((r) => keys.includes(relTarget(r)) && r.type === e.type);
      const text = rel ? (rel.direction === 'forward' ? fwd : bwd) : e.source === id ? fwd : bwd;
      explanations.push(
        <li key={e.key}>
          {text} {link(o)}
          <Src s={e.origins} />
        </li>,
      );
    }
    for (const e of edges.filter((e) => ['label', 'style', 'scene'].includes(e.type))) {
      const hub = other(e);
      const peers = built.edges.size
        ? [...built.edges.values()]
            .filter((x) => (x.source === hub || x.target === hub) && x.key !== e.key)
            .map((x) => (x.source === hub ? x.target : x.source))
            .filter((p) => built.nodes.get(p)?.kind === 'artist')
        : [];
      if (!peers.length) continue;
      const what = e.type === 'label' ? 'comparte sello' : e.type === 'style' ? 'comparte estilo' : 'misma escena:';
      explanations.push(
        <li key={e.key}>
          {what} {link(hub)} con {peers.slice(0, 6).map((p, i) => [i > 0 && ', ', link(p)])}
          {peers.length > 6 && <span className="muted"> y {peers.length - 6} más</span>}
          <Src s={e.origins} />
        </li>,
      );
    }
  } else {
    const members = edges.map(other).filter((o) => built.nodes.get(o)?.kind === 'artist');
    explanations.push(
      <li key="members">
        {members.length} artista{members.length === 1 ? '' : 's'}: {members.map((m, i) => [i > 0 && ', ', link(m)])}
      </li>,
    );
  }

  const d = entity?.data;
  const kindName =
    kind === 'artist'
      ? d?.mbType === 'Group'
        ? 'Grupo'
        : d?.mbType === 'Person'
          ? 'Artista'
          : 'Artista / proyecto'
      : kind === 'label'
        ? 'Sello'
        : kind === 'style'
          ? 'Estilo'
          : 'Escena';
  const origin = (d?.beginArea && d.mbType !== 'Person' ? d.beginArea.name : d?.area?.name) ?? d?.sceneWikidata?.placeName;
  const styles = d ? mergeStyles(d.styles) : [];
  const labels = d ? mergeLabels(d.labels) : [];
  const scene = d?.scene ?? (d?.sceneWikidata?.decade ? d.sceneWikidata : undefined);
  const spotifyId = entity?.ids?.spotify;

  return (
    <aside className="panel">
      <header>
        <div className="panel-kind" style={{ color: family.color }}>
          <span className={`dot dot-${kind}`} style={{ background: kind === 'label' ? 'transparent' : family.color, borderColor: family.color }} />
          {kindName} · {family.name}
        </div>
        <button className="icon" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </header>
      <div className="panel-title">
        {d?.image && <img className="avatar" src={d.image.url} alt="" />}
        <div>
          <h2>{node?.label ?? entity?.name}</h2>
          {d?.disambiguation && <p className="muted small">{d.disambiguation}</p>}
        </div>
      </div>

      {entity && (
        <dl className="facts">
          {years(entity) && (
            <>
              <dt>Actividad</dt>
              <dd>{years(entity)}</dd>
            </>
          )}
          {origin && (
            <>
              <dt>Origen</dt>
              <dd>
                {origin}
                {d?.country && d.area?.name !== d.country ? ` (${d.country})` : ''}
              </dd>
            </>
          )}
          {!!styles.length && (
            <>
              <dt>Estilos</dt>
              <dd className="chips">
                {styles.map((s) => {
                  const nid = styleNodeId(s.style);
                  const visible = built.nodes.has(nid);
                  return (
                    <button
                      key={s.style}
                      className={`chip ${visible ? '' : 'chip-off'}`}
                      style={{ borderColor: FAMILIES[styleInfo(s.style).family].color }}
                      onClick={() => visible && onSelect(nid)}
                      title={visible ? '' : 'Estilo sin otros artistas: oculto en el grafo'}
                    >
                      {styleInfo(s.style).name}
                    </button>
                  );
                })}
              </dd>
            </>
          )}
          {!!labels.length && (
            <>
              <dt>Sellos</dt>
              <dd className="chips">
                {labels.map((l) => {
                  const nid = labelNodeId(l.name);
                  const visible = built.nodes.has(nid);
                  return (
                    <button
                      key={nid}
                      className={`chip ${visible ? '' : 'chip-off'}`}
                      onClick={() => visible && onSelect(nid)}
                      title={`${l.releases} lanzamientos · ${l.sources.map((x) => SOURCE_NAME[x] ?? x).join(', ')}`}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </dd>
            </>
          )}
          {(scene || !!d?.movements?.length) && (
            <>
              <dt>Escena</dt>
              <dd className="chips">
                {scene && (
                  <span className="chip chip-plain">
                    {scene.placeName} · {decadeLabel(scene.decade)}
                  </span>
                )}
                {d?.movements?.map((m) => (
                  <button key={m.id} className="chip" onClick={() => built.nodes.has(movementNodeId(m.id)) && onSelect(movementNodeId(m.id))}>
                    {m.name}
                  </button>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}

      {spotifyId && (
        <section>
          <h3>Escuchar</h3>
          <iframe
            key={spotifyId}
            className="sp-embed"
            title={`Spotify: ${entity?.name}`}
            src={`https://open.spotify.com/embed/artist/${spotifyId}?theme=0`}
            height="352"
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        </section>
      )}

      {explanations.length > 0 && (
        <section>
          <h3>Conexiones</h3>
          <ul className="explain">{explanations}</ul>
        </section>
      )}

      {entity && (
        <section>
          <h3>Enlaces</h3>
          <div className="links">
            {entity.ids?.mb && (
              <a href={`https://musicbrainz.org/${entity.kind}/${entity.ids.mb}`} target="_blank" rel="noreferrer">
                MusicBrainz
              </a>
            )}
            {Object.entries(d?.urls ?? {}).map(([k, u]) => (
              <a key={k} href={u} target="_blank" rel="noreferrer">
                {LINK_NAME[k] ?? k}
              </a>
            ))}
          </div>
        </section>
      )}

      {d?.sourceStatus && (
        <section>
          <h3>Fuentes</h3>
          <div className="sources">
            {Object.entries(d.sourceStatus).map(([k, v]) => (
              <span key={k} className={`srcstat ${v === 'ok' ? 'ok' : v === 'sin clave' || v === 'no encontrado' || v === 'sin ficha' ? 'off' : 'err'}`} title={v}>
                {SOURCE_NAME[k] ?? k}
                <em>{v === 'ok' ? '' : v.length > 40 ? 'error' : v}</em>
              </span>
            ))}
          </div>
        </section>
      )}

      {entity && (
        <section className="panel-actions">
          <span className={`status status-${entity.candidates?.length ? 'revisar' : entity.status}`}>
            {entity.candidates?.length ? 'revisar' : entity.status}
          </span>
          {entity.error && <span className="muted small">{entity.error}</span>}
          <button className="ghost" onClick={() => reenrich(entity.id)}>
            Volver a consultar
          </button>
          <button
            className="ghost danger"
            onClick={async () => {
              await db.entities.delete(entity.id);
              onClose();
            }}
          >
            Quitar
          </button>
        </section>
      )}
    </aside>
  );
}

const LINK_NAME: Record<string, string> = {
  spotify: 'Spotify',
  bandcamp: 'Bandcamp',
  youtube: 'YouTube',
  discogs: 'Discogs',
  wikidata: 'Wikidata',
  lastfm: 'Last.fm',
  soundcloud: 'SoundCloud',
  official: 'Web oficial',
  wikipedia: 'Wikipedia',
  allmusic: 'AllMusic',
};

function Src({ s }: { s: string[] }) {
  return <span className="src">{s.map((x) => SOURCE_NAME[x] ?? x).join(' · ')}</span>;
}
