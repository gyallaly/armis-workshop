import { request } from 'node:http';
import { Readable } from 'node:stream';
/** Diagnostic HTTP client preserves navigation headers, which Node fetch rewrites. */
export function loopbackFetch(url,options={}) {
 const target=new URL(url);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw Error('Only loopback HTTP permitted');
 return new Promise((resolve,reject)=>{
  const req=request(target,{method:options.method??'GET',headers:options.headers,signal:options.signal},res=>{
   const headers=new Headers();for(const [key,value]of Object.entries(res.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(';'):value);
   resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers}));
  });req.on('error',reject);req.end(options.body);
 });
}
