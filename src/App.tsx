import { useEffect, useMemo, useRef, useState } from 'react';
import { db, setSetting } from './db';
import { useLive } from './hooks';
import { addEntity, entityIdFor, processPending, resolveName } from './enrich';
import { buildGraph } from './graph/build';
import GraphView, { type GraphHandle } from './graph/GraphView';
import { mbQueue } from './api/musicbrainz';
import { spQueue, handleSpotifyRedirect } from './api/spotify';
import { dgQueue } from './api/discogs';
import { wdQueue } from './api/wikidata';
import { lfQueue } from './api/lastfm';
import { Settings } from './ui/Settings';
import { FAMILIES, labelKey } from './normalize';
import { Search, candidateMeta, SOURCE_LABEL } from './ui/Search';
import { Panel } from './ui/Panel';
import type { Entity, FamilyId, SearchCandidate } from './types';
import './App.css';

const SEED = [
  'Aphex Twin',
  'Boards of Canada',
  'Warp Records',
  'Basic Channel',
  'Moritz von Oswald',
  'Burial',
  'Portishead',
  'Massive Attack',
  'Joy Division',
  'New Order',
  'Factory Records',
  'Kraftwerk',
  'Alice Coltrane',
  'Pharoah Sanders',
  'Los Planetas',
  'Rosalía',
];

export default function App() {
  const entities = useLive(() => db.entities.orderBy('addedAt').toArray(), [], [] as Entity[]);
  const manual = useLive(() => db.manualEdges.toArray(), [], []);
  const showSingleHubs = useLive(async () => ((await db.settings.get('showSingleHubs'))?.value as boolean) ?? false, [], false);
  const [selected, setSelected] = useState<string | null>(null);
  const [queues, setQueues] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<{ done: number; total: number } | null>(null);
  const graphHandle = useRef<GraphHandle>(null);

  useEffect(() => {
    const qs = { MusicBrainz: mbQueue, Spotify: spQueue, Discogs: dgQueue, Wikidata: wdQueue, 'Last.fm': lfQueue };
    for (const [name, q] of Object.entries(qs)) q.onChange = (n) => setQueues((p) => ({ ...p, [name]: n }));
    // vuelta del inicio de sesión de Spotify
    handleSpotifyRedirect()
      .then((r) => {
        if (r === 'ok') setToast('Spotify conectado');
        else if (r) setToast(r);
      })
      .catch((e) => setToast((e as Error).message));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const pendingCount = entities.filter((e) => e.status === 'pendiente').length;
  useEffect(() => {
    if (pendingCount > 0) void processPending();
  }, [pendingCount]);

  const built = useMemo(() => buildGraph(entities, manual, { showSingleHubs }), [entities, manual, showSingleHubs]);
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const familiesPresent = useMemo(() => {
    const s = new Set<FamilyId>();
    for (const n of built.nodes.values()) s.add(n.family);
    return (Object.keys(FAMILIES) as FamilyId[]).filter((f) => s.has(f));
  }, [built]);

  async function pick(c: SearchCandidate) {
    const e = await addEntity(c);
    setSelected(e.kind === 'label' ? `label:${labelKey(e.name)}` : e.id);
  }

  async function loadSeed() {
    setSeeding({ done: 0, total: SEED.length });
    let done = 0;
    for (const name of SEED) {
      try {
        const r = await resolveName(name);
        if (r.pick) await addEntity(r.pick, { candidates: r.ambiguous ? r.candidates : undefined });
      } catch (e) {
        console.warn('No se pudo resolver', name, e);
      }
      setSeeding({ done: ++done, total: SEED.length });
    }
    setSeeding(null);
  }

  async function confirmCandidate(e: Entity, c: SearchCandidate) {
    if (entityIdFor(c) === e.id) {
      await db.entities.update(e.id, { candidates: undefined, status: e.status === 'pendiente' ? 'pendiente' : 'enriquecido' });
      return;
    }
    await db.entities.delete(e.id);
    const n = await addEntity(c);
    setSelected(n.kind === 'label' ? `label:${labelKey(n.name)}` : n.id);
  }

  const mine = entities.filter((e) => e.origin === 'mine');
  const toReview = mine.filter((e) => e.candidates?.length);
  const counts = {
    artists: mine.filter((e) => e.kind === 'artist').length,
    labels: mine.filter((e) => e.kind === 'label').length,
    hubs: [...built.nodes.values()].filter((n) => n.kind !== 'artist').length,
    edges: built.edges.size,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Árbol musical</h1>
          <button className="ghost small-btn" onClick={() => setShowSettings(true)}>
            Fuentes
          </button>
        </div>
        <Search onPick={pick} />

        {mine.length === 0 && !seeding && (
          <div className="empty">
            <p>Empieza buscando un artista o carga la lista de prueba (16 nombres que mezclan techno, trip hop, post-punk, jazz espiritual y pop).</p>
            <button className="primary" onClick={loadSeed}>
              Cargar lista de prueba
            </button>
          </div>
        )}
        {seeding && (
          <div className="progress">
            <div className="small">
              Buscando nombres… {seeding.done}/{seeding.total}
            </div>
            <div className="bar">
              <div style={{ width: `${(seeding.done / seeding.total) * 100}%` }} />
            </div>
          </div>
        )}

        {toReview.length > 0 && (
          <section className="review">
            <h3>Revisar ({toReview.length})</h3>
            {toReview.map((e) => (
              <div key={e.id} className="review-item">
                <div className="small">
                  ¿Es <strong>{e.name}</strong> el que buscabas?
                </div>
                <ul>
                  {e.candidates!.slice(0, 5).map((c) => (
                    <li key={c.source + c.kind + c.id}>
                      <button className={entityIdFor(c) === e.id ? 'cand cand-on' : 'cand'} onClick={() => confirmCandidate(e, c)}>
                        <span>
                          {c.name}
                          {c.disambiguation && <em> ({c.disambiguation})</em>}
                        </span>
                        <span className="r-meta">{[SOURCE_LABEL[c.source], candidateMeta(c)].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {mine.length > 0 && (
          <section className="mine">
            <h3>
              Mis entradas <span className="muted">{mine.length}</span>
            </h3>
            <ul>
              {[...mine].reverse().map((e) => {
                const st = e.candidates?.length ? 'revisar' : e.status;
                return (
                  <li key={e.id}>
                    <button
                      className={selected === (built.nodeOf.get(e.id) ?? e.id) ? 'row row-on' : 'row'}
                      onClick={() => {
                        const nid = built.nodeOf.get(e.id) ?? e.id;
                        setSelected(nid);
                        graphHandle.current?.focusNode(nid);
                      }}
                    >
                      <span className="swatch" style={{ background: FAMILIES[e.data.family ?? 'otros'].color, borderRadius: e.kind === 'label' ? 2 : 99 }} />
                      <span className="row-name">{e.name}</span>
                      <span className={`status status-${st}`}>{st}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>

      <main className="stage">
        <div className="toolbar">
          <span className="stat">
            {counts.artists} artistas · {counts.labels} sellos · {counts.hubs} hubs · {counts.edges} conexiones
          </span>
          {Object.values(queues).some((n) => n > 0) && (
            <span className="stat busy">
              Consultando:{' '}
              {Object.entries(queues)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${k} ${n}`)
                .join(' · ')}
            </span>
          )}
          <div className="spacer" />
          <label className="toggle">
            <input type="checkbox" checked={showSingleHubs} onChange={(e) => setSetting('showSingleHubs', e.target.checked)} />
            Hubs con un solo artista
          </label>
          <button className="ghost" onClick={() => graphHandle.current?.fitAll()}>
            Ver todo
          </button>
          <button className="ghost" onClick={() => graphHandle.current?.relayout()}>
            Recolocar
          </button>
          <button className="ghost" onClick={() => graphHandle.current?.unpinAll()} title="Suelta los nodos fijados y recoloca">
            Soltar fijados
          </button>
        </div>

        <GraphView built={built} selected={selected} onSelect={setSelected} handleRef={graphHandle} />

        {familiesPresent.length > 0 && (
          <div className="legend">
            {familiesPresent.map((f) => (
              <span key={f}>
                <i style={{ background: FAMILIES[f].color }} />
                {FAMILIES[f].name}
              </span>
            ))}
            <span className="legend-sep" />
            <span>
              <i className="lg-artist" /> artista
            </span>
            <span>
              <i className="lg-style" /> estilo
            </span>
            <span>
              <i className="lg-label" /> sello
            </span>
            <span>
              <i className="lg-scene" /> escena
            </span>
          </div>
        )}
        {mine.length > 0 && <div className="hint">Arrastra para fijar un nodo · doble clic lo suelta</div>}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {toast && <div className="toast">{toast}</div>}
      {selected && <Panel id={selected} built={built} entities={byId} onSelect={(id) => { setSelected(id); graphHandle.current?.focusNode(id); }} onClose={() => setSelected(null)} />}
    </div>
  );
}
