# Árbol musical — fase 2

Grafo de referencias musicales: artistas conectados a hubs de estilo, sello y escena. Fuentes: MusicBrainz y Wikidata (sin clave), Discogs, Spotify y Last.fm (con clave, desde el botón «Fuentes»).

## Usarlo sin instalar nada
Abre `arbol-musical.html` con Chrome, Firefox o Safari (doble clic). Los datos se guardan en IndexedDB del navegador, ligados a ese archivo: si lo mueves de carpeta, empieza de cero.

## Spotify
Necesitas una app en developer.spotify.com/dashboard (el dueño debe tener Premium desde febrero de 2026).
- **Client ID + Client Secret**: funciona también abriendo el HTML con doble clic.
- **Solo Client ID**: inicia sesión desde «Fuentes». Requiere `npm run dev` (se sirve en http://127.0.0.1:5173) y registrar esa URL como Redirect URI en la app de Spotify.

Lo que da Spotify en modo desarrollo: búsqueda (máx. 10), ficha (imagen, géneros cuando los tiene), discografía con fechas y el ℗ de los álbumes, del que se saca el sello. Ya no da artistas relacionados, top tracks, popularidad ni sello del álbum.

## Desarrollo
```
npm install
npm run dev            # http://127.0.0.1:5173
npm run build          # build normal en dist/
npm run build:single   # un único HTML autocontenido en dist-single/
```

## Estructura
- `src/types.ts` — modelo de datos (entidades, hechos por fuente, aristas derivadas)
- `src/db.ts` — Dexie: entidades, aristas manuales, caché de API, ajustes
- `src/api/queue.ts` — cola con límite de ritmo (1,1 s), reintentos ante 503 y caché de 30 días
- `src/api/musicbrainz.ts` — búsqueda, fichas, lanzamientos y extracción de hechos
- `src/api/spotify.ts`, `discogs.ts`, `wikidata.ts`, `lastfm.ts` — resto de fuentes
- `src/keys.ts` — claves de API (solo en IndexedDB de este navegador)
- `src/normalize.ts` — diccionario tag → estilo canónico → familia, y clave de sellos
- `src/enrich.ts` — resolución de nombres y enriquecimiento
- `src/graph/build.ts` — deriva nodos hub y aristas (regla: artistas → hubs; artista↔artista solo relaciones fuertes)
- `src/graph/GraphView.tsx` — Sigma.js + ForceAtlas2 en worker, hover, arrastrar y fijar
- `test/` — prueba de extremo a extremo con respuestas reales capturadas de MusicBrainz, Wikidata y Discogs, y Spotify simulado (`node test/build-fixtures.mjs && node test/build-fixtures2.mjs && node test/e2e.mjs`)
