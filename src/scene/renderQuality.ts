/** Logical scene coordinates stay independent of cached texture resolution. */
export const SCENE_TEXTURE_SCALE = 3;
const sizes = new WeakMap<HTMLCanvasElement,{width:number;height:number}>();
const prepared = new WeakSet<CanvasRenderingContext2D>();
export function registerTexture(canvas:HTMLCanvasElement,width:number,height:number) { sizes.set(canvas,{width,height}); }
export function textureSize(canvas:HTMLCanvasElement) { return sizes.get(canvas)??{width:canvas.width,height:canvas.height}; }
/** Preserve the dynamic infrastructure seam without replaying every static object. */
export function cacheSceneLayers(
  width:number,
  height:number,
  render:(ctx:CanvasRenderingContext2D,seam:(ctx:CanvasRenderingContext2D)=>void)=>void,
  create:()=>HTMLCanvasElement=()=>document.createElement('canvas'),
) {
  const foreground=create(), ground=create();
  for(const canvas of [foreground,ground]) {
    canvas.width=Math.round(width*SCENE_TEXTURE_SCALE);
    canvas.height=Math.round(height*SCENE_TEXTURE_SCALE);
    registerTexture(canvas,width,height);
  }
  const ctx=foreground.getContext('2d')!, base=ground.getContext('2d')!;
  prepareSceneContext(ctx);prepareSceneContext(base);
  ctx.setTransform(SCENE_TEXTURE_SCALE,0,0,SCENE_TEXTURE_SCALE,0,0);
  base.setTransform(SCENE_TEXTURE_SCALE,0,0,SCENE_TEXTURE_SCALE,0,0);
  render(ctx,()=>{
    base.drawImage(foreground,0,0);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,foreground.width,foreground.height);
    ctx.setTransform(SCENE_TEXTURE_SCALE,0,0,SCENE_TEXTURE_SCALE,0,0);
  });
  return {
    draw(target:CanvasRenderingContext2D,infrastructure:(ctx:CanvasRenderingContext2D)=>void) {
      target.drawImage(ground,0,0);
      infrastructure(target);
      target.drawImage(foreground,0,0);
    },
  };
}
export function prepareSceneContext(ctx:CanvasRenderingContext2D) {
  if(prepared.has(ctx)) return;
  prepared.add(ctx);
  const draw=ctx.drawImage.bind(ctx);
  ctx.drawImage=((source:CanvasImageSource,...args:number[])=>{
    const size=sizes.get(source as HTMLCanvasElement);
    if(size&&args.length===2) draw(source,args[0]!,args[1]!,size.width,size.height);
    else (draw as (...args:unknown[])=>void)(source,...args);
  }) as typeof ctx.drawImage;
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
}
