// Cola con límite de ritmo por servicio. MusicBrainz pide como máximo 1 petición
// por segundo; dejamos un margen de 1100 ms. Las peticiones interactivas (el
// buscador) tienen prioridad sobre el enriquecimiento en segundo plano y se
// pueden cancelar si el usuario sigue escribiendo.

import { db } from '../db';

type Job = {
  url: string;
  priority: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  init?: RequestInit;
  noNetworkRetry?: boolean;
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class RateLimitedQueue {
  private jobs: Job[] = [];
  private running = false;
  private lastAt = 0;
  private interval: number;
  private slowUntil = 0;
  pending = 0;
  onChange?: (pending: number) => void;

  constructor(intervalMs: number) {
    this.interval = intervalMs;
  }

  fetchJson<T>(url: string, opts: { priority?: number; signal?: AbortSignal; init?: RequestInit; noNetworkRetry?: boolean } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        url,
        priority: opts.priority ?? 0,
        resolve: resolve as (v: unknown) => void,
        reject,
        signal: opts.signal,
        init: opts.init,
        noNetworkRetry: opts.noNetworkRetry,
      });
      this.jobs.sort((a, b) => b.priority - a.priority);
      this.bump();
      void this.loop();
    });
  }

  private bump() {
    this.pending = this.jobs.length + (this.running ? 1 : 0);
    this.onChange?.(this.pending);
  }

  private async loop() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!;
        this.bump();
        if (job.signal?.aborted) {
          job.reject(new DOMException('Cancelada', 'AbortError'));
          continue;
        }
        const gap = Date.now() < this.slowUntil ? this.interval * 1.8 : this.interval;
        const wait = this.lastAt + gap - Date.now();
        if (wait > 0) await sleep(wait);
        if (job.signal?.aborted) {
          job.reject(new DOMException('Cancelada', 'AbortError'));
          continue;
        }
        let attempt = 0;
        for (;;) {
          this.lastAt = Date.now();
          try {
            const res = await fetch(job.url, { ...job.init, headers: { Accept: 'application/json', ...(job.init?.headers ?? {}) } });
            if ((res.status === 503 || res.status === 429) && attempt < 7) {
              const retryAfter = Number(res.headers.get('retry-after'));
              // MusicBrainz devuelve 503 cuando va saturado aunque respetemos el ritmo:
              // esperamos cada vez más y, mientras tanto, frenamos toda la cola.
              attempt++;
              this.slowUntil = Date.now() + 30_000;
              await sleep(retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2000 * attempt);
              continue;
            }
            if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} en ${new URL(job.url).hostname}`);
            job.resolve(await res.json());
          } catch (e) {
            if (attempt < 5 && e instanceof TypeError && !job.noNetworkRetry) {
              // error de red (o un 503 sin cabeceras CORS, que el navegador ve igual)
              attempt++;
              this.slowUntil = Date.now() + 30_000;
              await sleep(2000 * attempt);
              continue;
            }
            job.reject(e);
          }
          break;
        }
      }
    } finally {
      this.running = false;
      this.bump();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DAY = 86_400_000;

/** Envuelve una petición con la caché de IndexedDB (clave = URL). */
export async function cachedJson<T>(
  queue: RateLimitedQueue,
  url: string,
  opts: { priority?: number; signal?: AbortSignal; ttlDays?: number; cacheKey?: string; init?: RequestInit } = {},
): Promise<T> {
  const key = opts.cacheKey ?? url;
  const ttl = (opts.ttlDays ?? 30) * DAY;
  const hit = await db.cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) return hit.data as T;
  const data = await queue.fetchJson<T>(url, opts);
  await db.cache.put({ key, data, fetchedAt: Date.now() });
  return data;
}
