/** Logical scene coordinates stay independent of cached texture resolution. */
export const SCENE_TEXTURE_SCALE = 3;
const sizes = new WeakMap<HTMLCanvasElement,{width:number;height:number}>();
const prepared = new WeakSet<CanvasRenderingContext2D>();
export function registerTexture(canvas:HTMLCanvasElement,width:number,height:number) { sizes.set(canvas,{width,height}); }
export function textureSize(canvas:HTMLCanvasElement) { return sizes.get(canvas)??{width:canvas.width,height:canvas.height}; }
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
