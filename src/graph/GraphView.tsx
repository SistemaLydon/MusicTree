import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createNodeBorderProgram } from '@sigma/node-border';
import type { NodeDisplayData, PartialButFor } from 'sigma/types';
import type { Settings } from 'sigma/settings';
import { FAMILIES } from '../normalize';
import type { BuiltGraph } from './build';
import { isStrong } from './build';
import { getSetting, setSetting } from '../db';

export const BG = '#1c1c1c';
const EDGE = 'rgba(150,150,150,0.22)';
const EDGE_STRONG = 'rgba(232,212,178,0.55)';
const DIM_NODE = '#2c2c2c';
const LABEL = '#d9d6d0';

export interface GraphHandle {
  relayout: (ms?: number) => void;
  fitAll: () => void;
  focusNode: (id: string) => void;
  unpinAll: () => void;
}

interface Props {
  built: BuiltGraph;
  selected: string | null;
  onSelect: (id: string | null) => void;
  handleRef?: Ref<GraphHandle>;
}

type Pos = Record<string, { x: number; y: number; fixed?: boolean }>;

// Dos programas con borde: sellos (anillo hueco) y escenas (disco con contorno claro)
const RingProgram = createNodeBorderProgram({
  borders: [
    { size: { value: 0.32 }, color: { attribute: 'ringColor' } },
    { size: { fill: true }, color: { value: '#222222' } },
  ],
});
const OutlinedProgram = createNodeBorderProgram({
  borders: [
    { size: { value: 0.14 }, color: { attribute: 'outlineColor', defaultValue: '#e8e4dc' } },
    { size: { fill: true }, color: { attribute: 'color' } },
  ],
});

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Etiqueta en caja oscura al pasar por encima */
function drawHover(
  ctx: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: Settings,
) {
  const size = settings.labelSize + 1;
  ctx.font = `600 ${size}px ${settings.labelFont}`;
  const label = data.label ?? '';
  const w = ctx.measureText(label).width;
  const x = data.x + data.size + 4;
  const y = data.y;
  ctx.fillStyle = 'rgba(20,20,20,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(x - 4, y - size / 2 - 5, w + 12, size + 10, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2efe9';
  ctx.fillText(label, x + 2, y + size / 3);
}

export default function GraphView({ built, selected, onSelect, handleRef }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph>(new Graph({ multi: false, type: 'undirected' }));
  const sigmaRef = useRef<Sigma | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const layoutTimer = useRef<number | undefined>(undefined);
  const hovered = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const savedPos = useRef<Pos | null>(null);
  const firstSync = useRef(true);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  selectedRef.current = selected;

  // ─── Montaje de Sigma ────────────────────────────────────────────────────
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = new Sigma(graph, container.current!, {
      allowInvalidContainer: true,
      defaultNodeType: 'circle',
      nodeProgramClasses: { ring: RingProgram, outlined: OutlinedProgram },
      labelColor: { color: LABEL },
      labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelRenderedSizeThreshold: 5,
      labelDensity: 0.9,
      labelGridCellSize: 90,
      defaultEdgeColor: EDGE,
      zIndex: true,
      defaultDrawNodeHover: drawHover,
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      stagePadding: 40,
    });
    sigmaRef.current = sigma;

    // resaltado de vecinos
    const focusSet = () => {
      const center = hovered.current ?? selectedRef.current;
      if (!center || !graph.hasNode(center)) return null;
      return new Set([center, ...graph.neighbors(center)]);
    };
    sigma.setSetting('nodeReducer', (node, data) => {
      const set = focusSet();
      if (!set) return data;
      if (set.has(node)) return { ...data, zIndex: 2, forceLabel: true };
      return { ...data, color: DIM_NODE, ringColor: DIM_NODE, outlineColor: '#383838', label: '', zIndex: 0, forceLabel: false } as typeof data;
    });
    sigma.setSetting('edgeReducer', (edge, data) => {
      const set = focusSet();
      if (!set) return data;
      const center = hovered.current ?? selectedRef.current;
      const [s, t] = graph.extremities(edge);
      if (s === center || t === center) return { ...data, color: 'rgba(235,230,220,0.7)', zIndex: 2 };
      return { ...data, hidden: true };
    });

    sigma.on('enterNode', ({ node }) => {
      hovered.current = node;
      container.current!.style.cursor = 'pointer';
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on('leaveNode', () => {
      hovered.current = null;
      container.current!.style.cursor = '';
      sigma.refresh({ skipIndexation: true });
    });

    // arrastrar y fijar
    let dragged: string | null = null;
    let moved = false;
    sigma.on('downNode', ({ node }) => {
      dragged = node;
      moved = false;
      graph.setNodeAttribute(node, 'highlighted', true);
    });
    sigma.getMouseCaptor().on('mousemovebody', (e) => {
      if (!dragged) return;
      moved = true;
      const pos = sigma.viewportToGraph(e);
      graph.mergeNodeAttributes(dragged, { x: pos.x, y: pos.y, fixed: true });
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    const endDrag = () => {
      if (!dragged) return;
      graph.removeNodeAttribute(dragged, 'highlighted');
      if (moved) void savePositions();
      dragged = null;
    };
    sigma.getMouseCaptor().on('mouseup', endDrag);
    sigma.getMouseCaptor().on('mousedown', () => {
      if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
    });

    sigma.on('clickNode', ({ node }) => {
      if (moved) return;
      onSelectRef.current(node);
    });
    sigma.on('clickStage', () => onSelectRef.current(null));
    sigma.on('doubleClickNode', ({ node, event }) => {
      // doble clic sobre un nodo fijado lo libera
      if (graph.getNodeAttribute(node, 'fixed')) {
        graph.setNodeAttribute(node, 'fixed', false);
        void savePositions();
      }
      event.preventSigmaDefault();
    });

    return () => {
      layoutRef.current?.kill();
      sigma.kill();
      sigmaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePositions() {
    const graph = graphRef.current;
    const pos: Pos = {};
    graph.forEachNode((n, a) => {
      pos[n] = { x: a.x, y: a.y, fixed: a.fixed || undefined };
    });
    savedPos.current = pos;
    await setSetting('positions', pos);
  }

  function runLayout(ms = 4000) {
    const graph = graphRef.current;
    if (graph.order < 2) return;
    layoutRef.current?.kill();
    window.clearTimeout(layoutTimer.current);
    const inferred = forceAtlas2.inferSettings(graph);
    const layout = new FA2Layout(graph, {
      settings: {
        ...inferred,
        // gravedad fuerte: los racimos sin puentes se quedan cerca en vez de salir disparados
        gravity: 0.35,
        scalingRatio: 14,
        strongGravityMode: true,
        outboundAttractionDistribution: true,
        adjustSizes: false,
        barnesHutOptimize: graph.order > 400,
        edgeWeightInfluence: 1,
        slowDown: 2,
      },
      getEdgeWeight: 'weight',
    });
    layoutRef.current = layout;
    sigmaRef.current?.setCustomBBox(null);
    layout.start();
    layoutTimer.current = window.setTimeout(() => {
      layout.stop();
      void savePositions();
    }, ms);
  }

  useImperativeHandle(handleRef, () => ({
    relayout: (ms) => {
      // recolocar: suelta los nodos fijados salvo que se pida lo contrario
      runLayout(ms ?? 5000);
    },
    fitAll: () => {
      void sigmaRef.current?.getCamera().animatedReset({ duration: 400 });
    },
    unpinAll: () => {
      graphRef.current.forEachNode((n) => graphRef.current.setNodeAttribute(n, 'fixed', false));
      runLayout(4000);
    },
    focusNode: (id) => {
      const sigma = sigmaRef.current;
      if (!sigma || !graphRef.current.hasNode(id)) return;
      const d = sigma.getNodeDisplayData(id);
      if (d) sigma.getCamera().animate({ x: d.x, y: d.y, ratio: 0.45 }, { duration: 500 });
    },
  }));

  // ─── Sincronización del grafo derivado con graphology ───────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (savedPos.current === null) savedPos.current = await getSetting<Pos>('positions', {});
      if (cancelled) return;
      const graph = graphRef.current;
      const pos = savedPos.current;
      const { nodes, edges } = built;
      let added = 0;

      graph.forEachNode((n) => {
        if (!nodes.has(n)) graph.dropNode(n);
      });

      // grado (para el tamaño)
      const degree = new Map<string, number>();
      for (const e of edges.values()) {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }

      const pending: string[] = [];
      for (const n of nodes.values()) {
        const fam = FAMILIES[n.family] ?? FAMILIES.otros;
        const deg = degree.get(n.id) ?? 0;
        const isHub = n.kind !== 'artist';
        const isSuggestion = n.origin === 'suggestion';
        const size = isHub ? 7 + Math.sqrt(deg) * 3.4 : 3.5 + Math.sqrt(deg) * 1.6;
        let color = fam.color;
        if (n.kind === 'scene') color = shade(fam.color, 0.55);
        if (isSuggestion) color = hexToRgba(fam.color, 0.18);
        if (n.status === 'error') color = '#7a3b3b';
        const attrs = {
          label: n.label,
          size,
          color,
          ringColor: fam.color,
          type: n.kind === 'label' ? 'ring' : n.kind === 'scene' ? 'outlined' : 'circle',
          kind: n.kind,
          family: n.family,
          forceLabel: isHub && deg >= 3,
          zIndex: isHub ? 1 : 0,
        };
        if (graph.hasNode(n.id)) {
          graph.mergeNodeAttributes(n.id, attrs);
        } else {
          const p = pos[n.id];
          graph.addNode(n.id, { ...attrs, x: p?.x ?? NaN, y: p?.y ?? NaN, fixed: p?.fixed ?? false });
          if (!p) pending.push(n.id);
          added++;
        }
      }

      graph.forEachEdge((e) => {
        if (!edges.has(e)) graph.dropEdge(e);
      });
      for (const e of edges.values()) {
        const strong = isStrong(e.type);
        const attrs = {
          size: strong ? 1.6 : 0.6,
          color: strong ? EDGE_STRONG : EDGE,
          weight: e.weight,
          etype: e.type,
          zIndex: strong ? 1 : 0,
        };
        if (graph.hasEdge(e.key)) graph.mergeEdgeAttributes(e.key, attrs);
        else if (!graph.hasEdge(e.source, e.target)) graph.addEdgeWithKey(e.key, e.source, e.target, attrs);
      }

      // coloca los nodos nuevos cerca de sus vecinos ya situados
      for (let pass = 0; pass < 3; pass++) {
        for (const id of pending) {
          const a = graph.getNodeAttributes(id);
          if (!Number.isNaN(a.x)) continue;
          const placed = graph.neighbors(id).map((nb) => graph.getNodeAttributes(nb)).filter((b) => !Number.isNaN(b.x));
          if (placed.length || pass === 2) {
            const cx = placed.length ? placed.reduce((s, b) => s + b.x, 0) / placed.length : 0;
            const cy = placed.length ? placed.reduce((s, b) => s + b.y, 0) / placed.length : 0;
            const r = placed.length ? 8 : 60;
            graph.mergeNodeAttributes(id, { x: cx + (Math.random() - 0.5) * r, y: cy + (Math.random() - 0.5) * r });
          }
        }
      }

      sigmaRef.current?.refresh();
      if (added > 0) {
        runLayout(firstSync.current && added > 20 ? 6000 : 2500);
      }
      firstSync.current = false;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected]);

  return <div ref={container} className="graph-canvas" />;
}
