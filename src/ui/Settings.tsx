import { useEffect, useState } from 'react';
import { getKeys, saveKeys, type ApiKeys } from '../keys';
import { disconnectSpotify, redirectUri, resetSpotifyToken, searchSpotifyArtists, spotifyConfigured, startSpotifyLogin } from '../api/spotify';
import { searchDiscogsArtists } from '../api/discogs';
import { lastfmTopTags } from '../api/lastfm';
import { wikidataLookup } from '../api/wikidata';
import { reenrichAll } from '../enrich';
import { db } from '../db';

type Check = { state: 'idle' | 'running' | 'ok' | 'error' | 'off'; text?: string };
const SOURCES = ['spotify', 'discogs', 'wikidata', 'lastfm'] as const;
type S = (typeof SOURCES)[number];

const NAMES: Record<S, string> = { spotify: 'Spotify', discogs: 'Discogs', wikidata: 'Wikidata', lastfm: 'Last.fm' };

export function Settings({ onClose }: { onClose: () => void }) {
  const [k, setK] = useState<ApiKeys>({});
  const [saved, setSaved] = useState<ApiKeys>({});
  const [checks, setChecks] = useState<Record<S, Check>>({ spotify: { state: 'idle' }, discogs: { state: 'idle' }, wikidata: { state: 'idle' }, lastfm: { state: 'idle' } });
  const [spotifyLogged, setSpotifyLogged] = useState(false);
  const [askReenrich, setAskReenrich] = useState(false);
  const uri = redirectUri();

  useEffect(() => {
    void (async () => {
      const keys = await getKeys();
      setK(keys);
      setSaved(keys);
      setSpotifyLogged(!!(await db.settings.get('spotifyAuth')));
    })();
  }, []);

  const set = (name: keyof ApiKeys) => (e: React.ChangeEvent<HTMLInputElement>) => setK((p) => ({ ...p, [name]: e.target.value }));
  const dirty = JSON.stringify(k) !== JSON.stringify(saved);

  async function save() {
    await saveKeys(k);
    resetSpotifyToken();
    const keys = await getKeys();
    setSaved(keys);
    setK(keys);
    await test();
    setAskReenrich(true);
  }

  async function test() {
    const run = async (s: S, fn: () => Promise<string>) => {
      setChecks((p) => ({ ...p, [s]: { state: 'running' } }));
      try {
        const text = await fn();
        setChecks((p) => ({ ...p, [s]: { state: text === '__off' ? 'off' : 'ok', text: text === '__off' ? 'sin configurar' : text } }));
      } catch (e) {
        setChecks((p) => ({ ...p, [s]: { state: 'error', text: (e as Error).message } }));
      }
    };
    await Promise.all([
      run('spotify', async () => {
        if (!(await spotifyConfigured())) return '__off';
        const r = await searchSpotifyArtists('Burial', { limit: 3, priority: 30 });
        return `conectado · ${r.length} resultados de prueba`;
      }),
      run('discogs', async () => {
        if (!(await getKeys()).discogsToken) return '__off';
        const r = await searchDiscogsArtists('Burial', { limit: 3, priority: 30 });
        return `conectado · ${r.length} resultados de prueba`;
      }),
      run('wikidata', async () => {
        const r = await wikidataLookup({ mb: '9ddce51c-2b75-4b3e-ac8c-1db09e7c89c6' }, 30);
        return r ? 'responde' : 'responde, sin datos de prueba';
      }),
      run('lastfm', async () => {
        if (!(await getKeys()).lastfmKey) return '__off';
        const r = await lastfmTopTags('Burial', undefined, 30);
        return `conectado · ${r.length} tags de prueba`;
      }),
    ]);
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="settings-title">
        <header>
          <h2 id="settings-title">Fuentes y claves</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="muted small">
          Las claves se guardan solo en este navegador. MusicBrainz y Wikidata no necesitan clave. Si falta alguna, la app sigue con las demás fuentes.
        </p>

        <fieldset>
          <legend>Spotify</legend>
          <p className="small muted">
            Crea una app en developer.spotify.com/dashboard (Web API). El <strong>Client ID</strong> está a la vista; el <strong>Client Secret</strong> aparece al
            pulsar «View client secret». Con los dos funciona aunque abras la app como archivo.
          </p>
          <label htmlFor="sp-id">Client ID</label>
          <input id="sp-id" value={k.spotifyClientId ?? ''} onChange={set('spotifyClientId')} spellCheck={false} autoComplete="off" />
          <label htmlFor="sp-secret">Client Secret</label>
          <input id="sp-secret" type="password" value={k.spotifyClientSecret ?? ''} onChange={set('spotifyClientSecret')} spellCheck={false} autoComplete="off" />
          {!k.spotifyClientSecret && (
            <div className="login-alt small">
              <p className="muted">
                Sin secreto, inicia sesión con tu cuenta.{' '}
                {uri ? (
                  <>
                    Registra esta Redirect URI en tu app de Spotify: <code>{uri}</code>
                  </>
                ) : (
                  <>Solo funciona sirviendo la app con <code>npm run dev</code> en http://127.0.0.1:5173.</>
                )}
              </p>
              {spotifyLogged ? (
                <button
                  className="ghost"
                  onClick={async () => {
                    await disconnectSpotify();
                    setSpotifyLogged(false);
                  }}
                >
                  Desconectar Spotify
                </button>
              ) : (
                <button className="ghost" disabled={!uri || !saved.spotifyClientId} onClick={() => startSpotifyLogin().catch((e) => alert((e as Error).message))}>
                  Iniciar sesión con Spotify
                </button>
              )}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Discogs</legend>
          <p className="small muted">Token personal en discogs.com/settings/developers.</p>
          <label htmlFor="dg-token">Token</label>
          <input id="dg-token" type="password" value={k.discogsToken ?? ''} onChange={set('discogsToken')} spellCheck={false} autoComplete="off" />
        </fieldset>

        <fieldset>
          <legend>Last.fm</legend>
          <p className="small muted">API key gratuita en last.fm/api/account/create. Aporta tags y artistas similares (para las sugerencias).</p>
          <label htmlFor="lf-key">API key</label>
          <input id="lf-key" type="password" value={k.lastfmKey ?? ''} onChange={set('lastfmKey')} spellCheck={false} autoComplete="off" />
        </fieldset>

        <section className="checks">
          {SOURCES.map((s) => (
            <div key={s} className={`check check-${checks[s].state}`}>
              <span>{NAMES[s]}</span>
              <span>{checks[s].state === 'running' ? 'probando…' : checks[s].state === 'idle' ? '—' : checks[s].text}</span>
            </div>
          ))}
        </section>

        {askReenrich && (
          <div className="reenrich small">
            <span>¿Volver a consultar todos tus artistas con las fuentes nuevas? Las respuestas ya guardadas no se repiten.</span>
            <button
              className="primary"
              onClick={async () => {
                await reenrichAll();
                setAskReenrich(false);
                onClose();
              }}
            >
              Volver a consultar
            </button>
          </div>
        )}

        <footer>
          <button className="ghost" onClick={test}>
            Probar conexiones
          </button>
          <button className="primary" disabled={!dirty} onClick={save}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
