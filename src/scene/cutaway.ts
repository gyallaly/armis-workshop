import { CAMPUS_FOOTPRINTS, CAMPUS_ORIGIN, type Pt } from './campus';

export const FLOOR_ORIGIN: Pt = [420, 110];

/** Fit plan dimensions before rasterizing; never shear upright walls or agents. */
export function floorPlanScale(id: string) {
  const r = CAMPUS_FOOTPRINTS[id]!;
  const scale = (r.x1-r.x0)/376;
  return { scale, depth: ((r.y1-r.y0)/248)/scale };
}

/** Same world footprint; every rendered point, label and hit uses this map. */
export function floorTransform(id: string) {
  const r = CAMPUS_FOOTPRINTS[id]!;
  const sx = (r.x1-r.x0)/376, sy = (r.y1-r.y0)/248;
  const a=sx, b=0, c=0, d=sx;
  const ox=CAMPUS_ORIGIN[0]+r.x0-r.y0+8*(sx-sy);
  const oy=CAMPUS_ORIGIN[1]+(r.x0+r.y0)/2+4*(sx+sy);
  const e=ox-a*FLOOR_ORIGIN[0], f=oy-d*FLOOR_ORIGIN[1];
  const det=a*d-b*c;
  return {
    matrix: [a,b,c,d,e,f] as const,
    point: ([x,y]:Pt):Pt => [a*x+c*y+e,b*x+d*y+f],
    inverse: ([x,y]:Pt):Pt => [(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det],
    bounds: {x0:CAMPUS_ORIGIN[0]+r.x0-r.y1-12,y0:CAMPUS_ORIGIN[1]+(r.x0+r.y0)/2-26,x1:CAMPUS_ORIGIN[0]+r.x1-r.y0+12,y1:CAMPUS_ORIGIN[1]+(r.x1+r.y1)/2+12},
  };
}
