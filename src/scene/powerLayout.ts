/** Shared physical plan; never draw two company pipes over the same trunk. */
export const CORE_OFFSET:[number,number]=[-120,-40];
export const CORE_CENTER:[number,number]=[-192,206];
export const PIPE_ELEVATION=12;
export const CAMPUS_FIT={x0:25,y0:65,x1:1050,y1:720};
export const POWER_ROUTES:Record<string,[number,number][]>={
  'campus-feed':[[-144,244],[-105,244],[-45,244],[20,244],[60,244],[60,216],[214,216]],
  'hermes-hq':[[214,216],[214,212]],
  'south-trunk':[[214,216],[214,326]],
  uditus:[[214,326],[214,346],[188,346]],
  'etsy-studio':[[214,216],[346,216],[346,188]],
  'aster-ledger':[[214,326],[328,326],[328,444],[388,444],[388,432]],
};

export function routeSupports(path:[number,number][],spacing=28) {
  const result:[number,number][]=[];
  for(let i=1;i<path.length;i++) {
    const a=path[i-1]!,b=path[i]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=0;d<length;d+=spacing) result.push([a[0]+(b[0]-a[0])*d/length,a[1]+(b[1]-a[1])*d/length]);
  }
  result.push(path.at(-1)!);return result;
}
