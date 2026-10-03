import { describe, expect, it } from 'vitest';
import { FLOOR_ORIGIN, floorPlanScale, floorTransform } from '../src/scene/cutaway';
import { Iso } from '../src/scene/pixel';
import { CAMPUS_FOOTPRINTS, CAMPUS_ORIGIN } from '../src/scene/campus';

describe('grounded first-floor cutaways', () => {
  for(const [id,r] of Object.entries(CAMPUS_FOOTPRINTS)) {
    it(`${id} maps the four floor corners to the exact exterior footprint`,()=>{
      const t=floorTransform(id);
      const iso=new Iso(...FLOOR_ORIGIN,1,floorPlanScale(id).depth);
      for(const [x,y,wx,wy] of [[-8,-8,r.x0,r.y0],[368,-8,r.x1,r.y0],[368,240,r.x1,r.y1],[-8,240,r.x0,r.y1]]) {
        const p=iso.p(x!,y!);
        const q=t.point(p);
        expect(q[0]).toBeCloseTo(CAMPUS_ORIGIN[0]+wx!-wy!);
        expect(q[1]).toBeCloseTo(CAMPUS_ORIGIN[1]+(wx!+wy!)/2);
        const roundtrip=t.inverse(q);
        expect(roundtrip[0]).toBeCloseTo(p[0]);expect(roundtrip[1]).toBeCloseTo(p[1]);
      }
      // Elevation and sprite verticals stay vertical after world placement.
      const base=t.point(iso.p(100,100));
      const raised=t.point(iso.p(100,100,60));
      expect(raised[0]).toBeCloseTo(base[0]);
      expect(base[1]-raised[1]).toBeCloseTo(60*floorPlanScale(id).scale);
    });
  }
});
