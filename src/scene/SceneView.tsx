import { CAMPUS_FIT } from './powerLayout';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BUSINESS_BY_ID, BUSINESSES, DEPARTMENT_BY_ID } from '../core/config';
import { stageLabel, stateLabel } from '../core/reducer';
import { businessCounts, capacityOut, departmentCounts, displayStatus } from '../core/selectors';
import type { TrafficDot } from '../core/types';
import { Icon } from '../ui/Icon';
import { motionEnabled, store, ui, useUi, useWorkshop } from '../ui/store';
import { ActorSystem } from './actors';
import { buildCampus, type CampusScene, type Pt, pointInPoly, type SceneAssets } from './campus';
import { Camera } from './camera';
import { prepareSceneContext } from './renderQuality';
import { coreReactors } from './coreArchitecture';
import { floorTransform } from './cutaway';
import { drawPowerStation, drawBuildingCharge, POWER_STATION } from './powerStation';
import { v2 } from '../ui/v2Store';
import { effectivePowerPolicies } from '../core/powerVisuals';
import { placeLabels } from './labels';
import { buildInterior, type InteriorScene } from './interior';
import { DOT_STYLE, drawDots, type PlacedDot } from './traffic';
import { CapacityChip } from '../ui/CapacityPanel';
import { buildingSignals, drawBuildingSignals, drawDelegations } from './operations';
import './v2Scene.css';

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

interface Scenes {
  assets: SceneAssets;
  campus: CampusScene;
  interiors: Map<string, InteriorScene>;
  actors: Map<string, ActorSystem>;
  cameras: Map<string, Camera>;
}

function interiorOf(sc: Scenes, id: string): InteriorScene {
  let s = sc.interiors.get(id);
  if (!s) {
    s = buildInterior(BUSINESS_BY_ID[id]!, sc.assets);
    sc.interiors.set(id, s);
    sc.actors.set(id, new ActorSystem(s));
  }
  return s;
}

function cameraFor(sc: Scenes, key: string): Camera {
  let c = sc.cameras.get('world');
  if (!c) { c = new Camera(sc.campus.width, sc.campus.height, CAMPUS_FIT, 0.7, 5); sc.cameras.set('world',c); }
  c.fitRect = key === 'campus' ? CAMPUS_FIT : floorTransform(key).bounds;
  return c;
}

export function SceneView() {
  const view = useUi((s) => s.view);
  const prefs = useUi((s) => s.prefs);
  const selection = useUi((s) => s.selection);
  const state = useWorkshop((s) => s);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scenesRef = useRef<Scenes | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ kind: 'worker' | 'building' | 'dot' | 'room' | 'job'; id: string } | null>(null);
  const fading = false;
  const previousView = useRef('campus');
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const placedRef = useRef<PlacedDot[]>([]);
  const lastDotPos = useRef<Map<string, Pt>>(new Map());
  const viewKey = view.mode === 'campus' ? 'campus' : view.businessId;

  // ------------------------------------------------------------ assets
  useEffect(() => {
    let alive = true;
    (async () => {
      const [lock, mark] = await Promise.all([loadImage('/brand/uditus/lockup-inline-white.png'), loadImage('/brand/uditus/mark-white.png')]);
      if (!alive) return;
      const assets: SceneAssets = { uditusLockup: lock, uditusMark: mark };
      scenesRef.current = { assets, campus: buildCampus(assets), interiors: new Map(), actors: new Map(), cameras: new Map() };
      // prebuild interiors during idle time so entering a building is instant
      const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      for (const b of BUSINESSES) idle(() => scenesRef.current && interiorOf(scenesRef.current, b.id));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // A simulated position is never a last-known live observation.
  useEffect(() => {
    const sc = scenesRef.current;
    if (!sc) return;
    for (const [id, scene] of sc.interiors) sc.actors.set(id, new ActorSystem(scene));
    lastDotPos.current.clear();
    placedRef.current = [];
  }, [prefs.source]);

  // ------------------------------------------------------- render loop
  useEffect(() => {
    if (!ready) return;
    const sc = scenesRef.current!;
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    prepareSceneContext(ctx);
    let raf = 0;
    let last = 0;
    let frame = 0;
    const existing = sc.cameras.get('world');
    const previousCamera = existing ? [existing.cx, existing.cy, existing.scale] as [number, number, number] : null;
    const cam = cameraFor(sc, viewKey);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      cam.resize(r.width, r.height, (wrap.parentElement?.querySelector<HTMLElement>('.stage__bottom')?.offsetHeight ?? 60) + 18);
    };
    resize();
    const began = performance.now();
    if (previousView.current !== viewKey) {
      if (previousCamera) [cam.cx,cam.cy,cam.scale] = previousCamera;
      cam.reset(motionEnabled(), began);
    }
    previousView.current = viewKey;
    const floor = viewKey === 'campus' ? null : floorTransform(viewKey);
    const worldPoint = (p: Pt): Pt => floor ? floor.point(p) : p;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    let lastSelected: string | null = null;
    let dark = 0; // 0 = lights on, 1 = lights out
    let darkT = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const motion = motionEnabled();
      Camera.instant = !motion;
      document.documentElement.dataset.motion = motion ? "full" : "reduced";
      // Dynamic layers remain capped near 30 fps; static high-resolution textures are cached
      if (now - last < 32 && !cam.animating) return;
      last = now;
      frame++;
      wrap.dataset.cutawayProgress = viewKey === 'campus' ? '0' : String(motion ? Math.min(1,(now-began)/700) : 1);
      const s = store.get();
      const u = ui.get();
      const t = store.adapter?.clock() ?? s.now;
      cam.update(now);
      const dpr = canvas.width / Math.max(1, cam.viewW);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0f2340';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = cam.scale * dpr;
      const tx = Math.round((cam.viewW / 2 - cam.cx * cam.scale) * dpr);
      const ty = Math.round((cam.viewH / 2 - cam.cy * cam.scale) * dpr);
      ctx.setTransform(k, 0, 0, k, tx, ty);
      ctx.imageSmoothingEnabled = true;
      const selId = u.selection?.kind === 'worker' ? u.selection.id : null;
      const selDot = u.selection?.kind === 'dot' ? u.selection.dot.id : null;
      const hv = hoverRef.current;
      let dots: { dot: TrafficDot; route: Pt[] }[] = [];

      if (viewKey === 'campus') {
        const campus = sc.campus;
        campus.draw(ctx,undefined,0,g=>{drawPowerStation(g,s,effectivePowerPolicies(v2.get()),now,motion);drawBuildingCharge(g,s,effectivePowerPolicies(v2.get()),now,motion);});
        campus.drawAmbient(ctx, now, motion, u.prefs.taskFlow);
        for(const b of campus.buildings) drawBuildingSignals(ctx,b.door,s,b.id);
        // hover / selection outline on buildings
        for (const b of campus.buildings) {
          const on = (hv?.kind === 'building' && hv.id === b.id) || (u.selection?.kind === 'building' && u.selection.id === b.id);
          if (!on) continue;
          ctx.strokeStyle = 'rgba(62,230,255,0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          b.hull.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
          ctx.closePath();
          ctx.stroke();
        }
        dots = s.traffic
          .filter((d) => d.outcome === 'dispatched' || d.outcome === 'ready')
          .map((d) => {
            const r = campus.routes[d.businessId] ?? [];
            return { dot: d, route: d.outcome === 'ready' ? [...r].reverse() : r };
          });
      } else {
        const interior = interiorOf(sc, viewKey);
        const actors = sc.actors.get(viewKey)!;
        sc.campus.draw(ctx, viewKey, 0,g=>{drawPowerStation(g,s,effectivePowerPolicies(v2.get()),now,motion);drawBuildingCharge(g,s,effectivePowerPolicies(v2.get()),now,motion);});
        sc.campus.drawAmbient(ctx, now, motion, false);
        ctx.save();
        ctx.transform(...floor!.matrix);
        ctx.drawImage(interior.base, 0, 0);
        interior.drawAmbient(ctx, t, motion);
        actors.update(s, t, motion);
        actors.drawMonitors(ctx, now, motion);
        actors.drawJobs(ctx,s,u.selection?.kind === 'task' ? u.selection.id : null);
        actors.draw(ctx, s, now, selId, hv?.kind === 'worker' ? hv.id : null);
        if(u.prefs.taskFlow) drawDelegations(ctx,s,viewKey,t,id=>actors.screenOf(id),motion);
        dots = s.traffic
          .filter((d) => d.businessId === viewKey)
          .map((d) => {
            const from = d.from === 'hq' ? 'entrance' : `${viewKey}:${d.from}`;
            const to = d.to === 'ready' ? 'exit' : d.to === 'rejected' ? 'reject' : d.to === 'hq' ? 'entrance' : `${viewKey}:${d.to}`;
            return { dot: d, route: interior.route(from, to).map((p) => interior.toScreen(p, 1)) };
          });
        // one-time ease to a newly selected worker; continuous when following
        if (selId && selId !== lastSelected) {
          const p = actors.screenOf(selId);
          if (p) { const q = worldPoint(p); cam.animateTo(q[0], q[1] - 5, Math.max(cam.scale, cam.fitScale * 1.6), 450, now); }
        }
        if (selId && u.follow && !cam.animating) {
          const p = actors.screenOf(selId);
          if (p) {
            const q = worldPoint(p);
            cam.cx += (q[0] - cam.cx) * (motion ? 0.08 : 1);
            cam.cy += (q[1] - 5 - cam.cy) * (motion ? 0.08 : 1);
          }
        }
      }
      if (floor) {
        // Draw traffic in the same first-floor transform, then restore world coordinates.
        placedRef.current = drawDots(ctx, dots, t, motion, selDot).map(p => ({...p, at:worldPoint(p.at)}));
        ctx.restore();
        const reveal = motion ? Math.min(1,(now-began)/700) : 1;
        if(reveal < 1) sc.campus.drawShell(ctx,viewKey,1-reveal);
      }
      lastSelected = selId;
      // Lights out when every AI provider scope is reported unavailable.
      const out = capacityOut(s);
      const dtl = Math.min(0.2, (now - darkT) / 1000);
      darkT = now;
      dark = motion ? Math.max(0, Math.min(1, dark + (out ? dtl / 1.2 : -dtl / 0.8))) : out ? 1 : 0;
      if (dark > 0) {
        const flicker = motion && dark < 0.6 && Math.sin(now / 37) > 0.4 ? 0.25 : 0;
        ctx.fillStyle = `rgba(2, 4, 10, ${Math.max(0, 0.72 * dark - flicker)})`;
        ctx.fillRect(0, 0, sc.campus.width, sc.campus.height);
      }
      if (!floor) placedRef.current = drawDots(ctx, dots, t, motion, selDot);
      const retained = new Set(s.traffic.map((dot) => dot.id));
      for (const id of lastDotPos.current.keys()) if (!retained.has(id)) lastDotPos.current.delete(id);
      for (const p of placedRef.current) lastDotPos.current.set(p.dot.id, p.at);

      // position DOM overlays
      const ov = overlayRef.current;
      if (ov) {
        const elements = Array.from(ov.querySelectorAll<HTMLElement>('[data-ax]'));
        const bottom = wrap.parentElement?.querySelector<HTMLElement>('.stage__bottom')?.offsetHeight ?? 60;
        const bounds = { x: 12, y: 18, width: Math.max(1, cam.viewW - 24), height: Math.max(1, cam.viewH - bottom - 36) };
        ov.dataset.compact = cam.percent < 90 || cam.viewW < 1000 ? 'true' : 'false';
        const obstacles = u.prefs.minimap && cam.viewW > 900 ? [{ x: 12, y: cam.viewH - 188, width: 180, height: 124 }] : [];
        const chat = wrap.parentElement?.querySelector<HTMLElement>('.hermes-chat');
        if(chat) {
          const cr=chat.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
          obstacles.push({x:cr.left-wr.left-8,y:cr.top-wr.top-8,width:cr.width+16,height:cr.height+16});
        }
        const requests = elements.map((el, i) => {
          const anchor = worldPoint([Number(el.dataset.ax), Number(el.dataset.ay)]);
          const [x, y] = cam.toScreen(...anchor);
          const child = el.firstElementChild as HTMLElement;
          return { id: String(i), x, y, width: child.offsetWidth, height: child.offsetHeight };
        }).filter(label => viewKey !== 'campus' || cam.percent <= 110 ||
          (label.x >= bounds.x && label.x <= bounds.x+bounds.width && label.y >= bounds.y && label.y <= bounds.y+bounds.height));
        const placements = placeLabels(requests, bounds, obstacles);
        elements.forEach((el, i) => {
          const r = placements.get(String(i));
          el.style.visibility = r ? 'visible' : 'hidden';
          if (r) el.style.transform = 'translate(' + Math.round(r.x) + 'px, ' + Math.round(r.y) + 'px)';
        });
        ov.querySelectorAll<HTMLElement>('[data-track]').forEach((el) => {
          const [kind, id] = el.dataset.track!.split('|') as [string, string];
          let p: Pt | null | undefined = null;
          if (kind === 'worker') p = sc.actors.get(viewKey)?.screenOf(id);
          else if (kind === 'dot') p = lastDotPos.current.get(id);
          else if (kind === 'job') p = sc.actors.get(viewKey)?.jobObjects(s).find(j=>j.task.id===id)?.at;
          if (!p) {
            el.style.visibility = 'hidden';
            return;
          }
          el.style.visibility = 'visible';
          const [x, y] = cam.toScreen(...(kind === 'dot' ? p : worldPoint(p)));
          el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
      }
      if (frame % 8 === 0) {
        if (u.zoomPercent !== cam.percent) ui.update({ zoomPercent: cam.percent });
        drawMinimap(miniRef.current, sc.campus.base, cam, g=>sc.campus.draw(g,undefined,1,layer=>drawPowerStation(layer,s,effectivePowerPolicies(v2.get()),now,false)));
      }
    };
    raf = requestAnimationFrame(loop);

    // --------------------------------------------------------- input
    let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const hitAt = (sp: Pt): { kind: 'worker' | 'building' | 'dot' | 'room' | 'job'; id: string } | null => {
      const world = cam.toWorld(sp[0], sp[1]);
      const p = floor ? floor.inverse(world) : world;
      const tol = 7 / Math.max(1, cam.scale / 2);
      for (const d of placedRef.current) if (Math.hypot(d.at[0] - world[0], d.at[1] - world[1]) < Math.max(5, tol)) return { kind: 'dot', id: d.dot.id };
      if (viewKey === 'campus') {
        for(const reactor of coreReactors(store.get())) if(pointInPoly(p,reactor.hull)) return {kind:'building',id:`reactor:${reactor.id}`};
        if(pointInPoly(p,POWER_STATION.hull)) return {kind:'building',id:'power-station'};
        for (const b of sc.campus.buildings) if (pointInPoly(p, b.hull)) return { kind: 'building', id: b.id };
        return null;
      }
      for(const j of sc.actors.get(viewKey)?.jobObjects(store.get()) ?? []) {
        if(p[0]>=j.at[0]-5 && p[0]<=j.at[0]+5 && p[1]>=j.at[1]-9 && p[1]<=j.at[1]+3) return {kind:'job',id:j.task.id};
      }
      const w = sc.actors.get(viewKey)?.hit(p);
      if (w) return { kind: 'worker', id: w };
      const room = interiorOf(sc, viewKey).rooms.find((r) => pointInPoly(p, r.hull));
      return room ? { kind: 'room', id: room.departmentId } : null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (drag.moved || Math.hypot(dx, dy) > 4) {
          drag.moved = true;
          cam.pan(dx, dy);
          drag.x = e.clientX;
          drag.y = e.clientY;
          canvas.style.cursor = 'grabbing';
        }
        return;
      }
      const h = hitAt(local(e));
      const prev = hoverRef.current;
      if (h?.id !== prev?.id || h?.kind !== prev?.kind) setHover(h);
      canvas.style.cursor = h && h.kind !== 'room' ? 'pointer' : 'grab';
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      canvas.style.cursor = 'grab';
      if (moved) return;
      const h = hitAt(local(e));
      activate(h);
    };
    const activate = (h: ReturnType<typeof hitAt>) => {
      if (!h) {
        ui.select(null);
        return;
      }
      if (h.kind === 'dot') {
        const d = placedRef.current.find((x) => x.dot.id === h.id);
        if (d) ui.select({ kind: 'dot', dot: d.dot });
      } else if (h.kind === 'job') ui.select({kind:'task',id:h.id});
      else if (h.kind === 'worker') ui.select({ kind: 'worker', id: h.id });
      else if (h.kind === 'building') enterBuilding(h.id);
      else if (h.kind === 'room') {
        const r = interiorOf(sc, viewKey).rooms.find((x) => x.departmentId === h.id);
        if (r) {
          const [x, y] = interiorOf(sc, viewKey).toScreen(r.center);
          const q=worldPoint([x,y]);
          cam.animateTo(q[0], q[1] - 5, cam.fitScale * 2, 400, performance.now());
        }
      }
    };
    const enterBuilding = (id: string) => {
      if(id.startsWith('reactor:')) {ui.setPrefs({tab:'power'});requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('armis:reactor-select',{detail:id.slice(8)})));return;}
      if(id==='power-station') { ui.setPrefs({tab:'power'}); cam.animateTo(POWER_STATION.focus[0],POWER_STATION.focus[1],Math.min(cam.fitScale*2.2,4),650,performance.now()); return; }
      ui.go({ mode: 'interior', businessId: id });
    };
    (wrap as any).__enter = enterBuilding;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      cam.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 60;
      const n = performance.now();
      switch (e.key) {
        case 'ArrowLeft':
          cam.pan(step, 0);
          break;
        case 'ArrowRight':
          cam.pan(-step, 0);
          break;
        case 'ArrowUp':
          cam.pan(0, step);
          break;
        case 'ArrowDown':
          cam.pan(0, -step);
          break;
        case '+':
        case '=':
          cam.zoomBy(1.25, n);
          break;
        case '-':
        case '_':
          cam.zoomBy(0.8, n);
          break;
        case '0':
          cam.reset(true, n);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const onLeave = () => setHover(null);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('keydown', onKey);
    const zoomHandler = (e: Event) => {
      const d = (e as CustomEvent).detail as 'in' | 'out' | 'reset';
      const n = performance.now();
      if (d === 'in') cam.zoomBy(1.25, n);
      else if (d === 'out') cam.zoomBy(0.8, n);
      else cam.reset(true, n);
    };
    const campusReset = () => {
      ui.go({mode:'campus'});
      cam.fitRect = CAMPUS_FIT;
      cam.resize(cam.viewW,cam.viewH,(wrap.parentElement?.querySelector<HTMLElement>('.stage__bottom')?.offsetHeight ?? 60)+18);
      cam.reset(motionEnabled(),performance.now());
    };
    window.addEventListener('armis:campus-reset', campusReset);
    window.addEventListener('armis:zoom', zoomHandler);
    const mini = miniRef.current;
    const onMini = (e: PointerEvent) => {
      if (!mini || (e.type === 'pointermove' && e.buttons !== 1)) return;
      const r = mini.getBoundingClientRect();
      cam.cx = ((e.clientX - r.left) / r.width) * cam.worldW;
      cam.cy = ((e.clientY - r.top) / r.height) * cam.worldH;
      cam.clamp();
    };
    mini?.addEventListener('pointerdown', onMini);
    mini?.addEventListener('pointermove', onMini);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('keydown', onKey);
      window.removeEventListener('armis:campus-reset', campusReset);
      window.removeEventListener('armis:zoom', zoomHandler);
      mini?.removeEventListener('pointerdown', onMini);
      mini?.removeEventListener('pointermove', onMini);
    };
  }, [ready, viewKey]);

  const enter = (id: string) => {
    const enterBuilding = (wrapRef.current as any)?.__enter;
    if (enterBuilding) enterBuilding(id);
    else ui.go({ mode: 'interior', businessId: id });
  };
  const sc = scenesRef.current;
  const hoveredWorker = hover?.kind === 'worker' ? state.workers[hover.id] : undefined;
  const hoveredDot = hover?.kind === 'dot' ? state.traffic.find((d) => d.id === hover.id) : undefined;
  const selectedDot = selection?.kind === 'dot' ? selection.dot : null;
  const jobs = viewKey === 'campus' ? [] : sc?.actors.get(viewKey)?.jobObjects(state) ?? [];
  const hoveredJob = hover?.kind === 'job' ? state.tasks[hover.id] : undefined;

  return (
    <div
      className={`scene ${fading ? 'scene--fade' : ''}`}
      data-world-view="campus"
      data-cutaway-business={viewKey === 'campus' ? '' : viewKey}
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label={view.mode === 'campus' ? 'Campus map. Arrow keys pan, plus and minus zoom, 0 resets.' : `${BUSINESS_BY_ID[viewKey]?.brand.displayName} interior. Arrow keys pan, plus and minus zoom, Escape returns to campus.`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (selection) ui.select(null);
          else if (view.mode === 'interior') ui.go({ mode: 'campus' });
        }
      }}
    >
      <canvas ref={canvasRef} className="scene__canvas" aria-hidden="true" />
      {view.mode==='interior' ? <div className="floor-caption"><span>FLOOR 01</span><strong>{BUSINESS_BY_ID[viewKey]?.brand.displayName}</strong><button onClick={()=>ui.go({mode:'campus'})} aria-label="Close building cutaway">Close cutaway</button></div> : null}
      {!ready ? <div className="scene__loading">Drawing the campus...</div> : null}
      <div className="scene__overlay" ref={overlayRef}>
        {ready && sc && view.mode === 'campus' ? (
          <>
            <div className="anchor" data-ax={POWER_STATION.label[0]} data-ay={POWER_STATION.label[1]}><button className="blabel" onClick={()=>enter('power-station')} aria-label="Open power station"><span className="blabel__title">POWER STATION</span><span className="blabel__counts">Providers / allocation / machine</span></button></div>
            {sc.campus.buildings.map((b) => (
              <BuildingLabel key={b.id} id={b.id} anchor={b.label}  hovered={hover?.kind === 'building' && hover.id === b.id} onEnter={() => enter(b.id)} onHover={(on) => setHover(on ? { kind: 'building', id: b.id } : null)} />
            ))}
          </>
        ) : null}
        {ready && sc && view.mode === 'interior'
          ? interiorOf(sc, viewKey).rooms.map((r) => <RoomLabel key={r.departmentId} departmentId={r.departmentId} anchor={r.label} />)
          : null}
        {jobs.map(j=><div className="anchor" key={j.task.id} data-track={`job|${j.task.id}`}><button className="scene-job" aria-label={`Open job: ${j.task.title}`} onClick={()=>ui.select({kind:'task',id:j.task.id})} onFocus={()=>setHover({kind:'job',id:j.task.id})} onBlur={()=>setHover(null)} /></div>)}
        {hoveredJob ? <div className="anchor" data-track={`job|${hoveredJob.id}`}><div className="tip tip--worker"><strong>{hoveredJob.title}</strong><span>{hoveredJob.status.replaceAll('_',' ')} · Click to open job</span></div></div> : null}
        {hoveredWorker && (!selection || selection.kind !== 'worker' || selection.id !== hoveredWorker.id) ? (
          <div className="anchor" data-track={`worker|${hoveredWorker.id}`}>
            <div className="tip tip--worker">
              <strong>{hoveredWorker.name}</strong>
              <span>{stateLabel(displayStatus(state, hoveredWorker).state)}</span>
            </div>
          </div>
        ) : null}
        {hoveredDot && hoveredDot.id !== selectedDot?.id ? (
          <div className="anchor" data-track={`dot|${hoveredDot.id}`}>
            <div className="tip">
              <strong>{hoveredDot.label}</strong>
              <span>{DOT_STYLE[hoveredDot.outcome].label}</span>
            </div>
          </div>
        ) : null}
        {selectedDot ? (
          <div className="anchor" data-track={`dot|${selectedDot.id}`}>
            <DotCard dot={selectedDot} />
          </div>
        ) : null}
      </div>
      <canvas ref={miniRef} className="minimap" width={180} height={124} hidden={!prefs.minimap} aria-label="Minimap. Click to move the view." role="img" />
    </div>
  );
}

function drawMinimap(c: HTMLCanvasElement | null, base: HTMLCanvasElement, cam: Camera, render?: (ctx:CanvasRenderingContext2D)=>void) {
  if (!c || c.hidden) return;
  const g = c.getContext('2d')!;
  prepareSceneContext(g);
  g.imageSmoothingEnabled = true;
  g.clearRect(0, 0, c.width, c.height);
  if(render) {g.save();g.scale(c.width/cam.worldW,c.height/cam.worldH);render(g);g.restore();}
  else g.drawImage(base, 0, 0, c.width, c.height);
  const sx = c.width / cam.worldW;
  const sy = c.height / cam.worldH;
  const [x0, y0] = cam.toWorld(0, 0);
  const [x1, y1] = cam.toWorld(cam.viewW, cam.viewH);
  g.strokeStyle = '#3ee6ff';
  g.lineWidth = 1.5;
  g.strokeRect(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
}

function BuildingLabel({ id, anchor, hovered, onEnter, onHover, extra }: { id: string; anchor: Pt; hovered: boolean; onEnter: () => void; onHover: (on: boolean) => void; extra?: ReactNode }) {
  const state = useWorkshop((s) => s);
  const b = BUSINESS_BY_ID[id]!;
  const c = useMemo(() => businessCounts(state, id), [state, id]);
  const live = state.connection !== 'disconnected';
  const lock = b.brand.assets.lockupOnDark;
  const signals = buildingSignals(state,id);
  return (
    <div className="anchor" data-ax={anchor[0]} data-ay={anchor[1]}>
      <div className="blabel-wrap">
      <button
        className={`blabel ${hovered ? 'is-hover' : ''}`}
        style={{ ['--brand' as string]: b.brand.colors.accent }}
        onClick={onEnter}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-label={`Enter ${b.brand.displayName}. ${live ? `${c.active} active, ${c.queued + c.waitingProvider} queued, ${c.held} held, ${c.failed} failed, roster ${c.roster}` : 'status unknown'}`}
        title={`Entry lights: ${signals.counts[0]} working, ${signals.counts[1]} resting/offline, ${signals.counts[2]} waiting, ${signals.counts[3]} issues. ${signals.unknown} unobserved.`}
      >
        <span className="blabel__title">
          <span className={`dot ${c.active ? 'dot--on' : ''}`} aria-hidden="true" />
          {lock ? <img src={lock} alt={b.brand.displayName} className="blabel__lockup" /> : <span>{b.brand.displayName}</span>}
          {b.brand.provisional ? <span className="chip chip--prov">provisional</span> : null}
          {id === 'aster-ledger' ? <span className="chip chip--paper">DEMO / PAPER</span> : null}
        </span>
        <span className="blabel__counts">
          {live ? (
            <>
              <span>{signals.counts[0]} working</span>
              <span>{signals.counts[1]} resting/offline</span>
              <span className="warn">{signals.counts[2]} waiting</span>
              <span className={signals.counts[3] ? 'bad' : 'muted'}>{signals.counts[3]} issues</span>
              {signals.unknown ? <span className="muted">{signals.unknown} unknown</span> : null}
              <span className="muted">{c.roster} agents</span>
            </>
          ) : (
            <span className="muted">{c.roster} declared agents · execution unobserved</span>
          )}
        </span>
      </button>
      {extra}
      </div>
    </div>
  );
}

function RoomLabel({ departmentId, anchor }: { departmentId: string; anchor: Pt }) {
  const state = useWorkshop((s) => s);
  const d = DEPARTMENT_BY_ID[departmentId]!;
  const c = useMemo(() => departmentCounts(state, departmentId), [state, departmentId]);
  const live = state.connection !== 'disconnected';
  const lounge = d.kind === 'lounge';
  return (
    <div className="anchor" data-ax={anchor[0]} data-ay={anchor[1]}>
      <div className={`rlabel ${c.active ? 'is-busy' : ''}`} role="group" aria-label={`${d.label} department`}>
        <Icon name={d.kind} size={18} className="rlabel__icon" />
        <span className="rlabel__body">
          <span className="rlabel__title">{d.label}</span>
          <span className="rlabel__counts">
            {!live ? (
              <span className="muted">unknown</span>
            ) : lounge ? (
              <span>{c.idle} idle{c.present - c.idle > 0 ? ` · ${c.present - c.idle} other` : ''}</span>
            ) : (
              <>
                <span className={c.active ? 'ok' : 'muted'}>{c.active} active</span>
                {c.queued + c.waitingProvider ? <span>{c.queued + c.waitingProvider} queued</span> : null}
                {c.waitingProvider ? <span className="warn">{c.waitingProvider} wait provider</span> : null}
                {c.held ? <span className="warn">{c.held} held</span> : null}
                {c.failed ? <span className="bad">{c.failed} failed</span> : null}
                {c.unknown ? <span className="muted">{c.unknown} unknown</span> : null}
              </>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

function DotCard({ dot }: { dot: TrafficDot }) {
  const task = useWorkshop((s) => s.tasks[dot.taskId]);
  const st = DOT_STYLE[dot.outcome];
  return (
    <div className="dotcard" role="dialog" aria-label="Task handoff">
      <div className="dotcard__head" style={{ color: st.color }}>
        {st.label}
      </div>
      <div className="dotcard__title">{task?.title ?? dot.label}</div>
      <div className="dotcard__route">
        {stageLabel(dot.from)} <span aria-hidden="true">→</span> {stageLabel(dot.to)}
      </div>
      <div className="dotcard__meta">
        Task {dot.taskId} · now {task ? task.status.replace('_', ' ') : 'not in view'}
      </div>
      <div className="dotcard__actions">
        <button className="btn btn--sm" onClick={() => ui.select({ kind: 'task', id: dot.taskId })}>
          Open task
        </button>
        <button className="btn btn--sm btn--ghost" onClick={() => ui.select(null)} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
