import { useEffect, useState } from 'react';
import { searchArtists, searchLabels } from '../api/musicbrainz';
import { searchSpotifyArtists, spotifyConfigured } from '../api/spotify';
import { searchDiscogsArtists } from '../api/discogs';
import { getKeys } from '../keys';
import { useDebounced } from '../hooks';
import type { CandidateSource, SearchCandidate } from '../types';

export const SOURCE_LABEL: Record<CandidateSource, string> = { musicbrainz: 'MusicBrainz', spotify: 'Spotify', discogs: 'Discogs' };

export function candidateMeta(c: SearchCandidate) {
  const years = c.begin ? `${c.begin.slice(0, 4)}${c.end ? `–${c.end.slice(0, 4)}` : ''}` : '';
  const type = c.kind === 'label' ? 'Sello' : c.type === 'Group' ? 'Grupo' : c.type === 'Person' ? 'Persona' : (c.type ?? '');
  const tags = c.genres?.length ? c.genres.join(', ') : c.topTag;
  return [type, c.area ?? c.country, years, tags].filter(Boolean).join(' · ');
}

type Section = { source: CandidateSource; state: 'loading' | 'ok' | 'error'; items: SearchCandidate[]; error?: string };

export function Search({ onPick }: { onPick: (c: SearchCandidate) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 450);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    if (dq.length < 2) {
      setSections([]);
      return;
    }
    const ctrl = new AbortController();
    const opts = { signal: ctrl.signal };
    const update = (source: CandidateSource, patch: Partial<Section>) =>
      setSections((prev) => prev.map((s) => (s.source === source ? { ...s, ...patch } : s)));
    (async () => {
      const [sp, keys] = await Promise.all([spotifyConfigured(), getKeys()]);
      const active: CandidateSource[] = ['musicbrainz', ...(sp ? (['spotify'] as const) : []), ...(keys.discogsToken ? (['discogs'] as const) : [])];
      if (ctrl.signal.aborted) return;
      setSections(active.map((source) => ({ source, state: 'loading', items: [] })));
      const run = async (source: CandidateSource, fn: () => Promise<SearchCandidate[]>) => {
        try {
          const items = await fn();
          if (!ctrl.signal.aborted) update(source, { state: 'ok', items });
        } catch (e) {
          if ((e as Error).name !== 'AbortError' && !ctrl.signal.aborted) update(source, { state: 'error', error: (e as Error).message });
        }
      };
      void run('musicbrainz', async () => {
        const [a, l] = await Promise.all([searchArtists(dq, { ...opts, limit: 6, priority: 20 }), searchLabels(dq, { ...opts, limit: 3, priority: 19 })]);
        return [...a, ...l.filter((x) => x.score >= 80)];
      });
      if (sp) void run('spotify', () => searchSpotifyArtists(dq, { ...opts, limit: 6, priority: 20 }));
      if (keys.discogsToken) void run('discogs', () => searchDiscogsArtists(dq, { ...opts, limit: 5, priority: 20 }));
    })();
    return () => ctrl.abort();
  }, [dq]);

  const anyLoading = sections.some((s) => s.state === 'loading');
  const visible = sections.filter((s) => s.items.length || s.state !== 'ok');

  return (
    <div className="search">
      <input
        id="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Añadir artista, grupo o sello…"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQ('');
        }}
      />
      {dq.length >= 2 && visible.length > 0 && (
        <div className="search-results">
          {visible.map((s) => (
            <section key={s.source}>
              <h4>
                {SOURCE_LABEL[s.source]}
                {s.state === 'loading' && <span className="muted"> · buscando…</span>}
                {s.state === 'error' && <span className="err"> · {s.error}</span>}
              </h4>
              <ul>
                {s.items.map((c) => (
                  <li key={`${c.source}:${c.kind}:${c.id}`}>
                    <button
                      onClick={() => {
                        onPick(c);
                        setQ('');
                        setSections([]);
                      }}
                    >
                      {c.image ? <img src={c.image} alt="" loading="lazy" /> : <span className="noimg" />}
                      <span className="r-text">
                        <span className="r-name">
                          {c.name}
                          {c.disambiguation && <em> ({c.disambiguation})</em>}
                        </span>
                        <span className="r-meta">{candidateMeta(c)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!anyLoading && sections.every((s) => !s.items.length) && <div className="search-hint">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}
