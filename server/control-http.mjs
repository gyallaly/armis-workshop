import { timingSafeEqual } from 'node:crypto';

async function body(req) { let data='';for await(const chunk of req){data+=chunk;if(data.length>32768)throw Error('Request exceeds bound');}return JSON.parse(data); }
export function controlHandler(policy, gateToken) {
  const chats=new Map();
  return async (req,res,authenticated,origin) => {
    if(!['/api/control','/api/control/commands','/api/chat','/api/admission','/api/release'].includes(req.url)) return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    const gateRoute=['/api/admission','/api/release'].includes(req.url);
    const provided=String(req.headers.authorization??'').replace(/^Bearer /,'');
    const gate=!!gateToken&&provided.length===gateToken.length&&timingSafeEqual(Buffer.from(provided),Buffer.from(gateToken));
    if(gateRoute?!gate:!authenticated) {send(401,{error:'Authentication required'});return true;}
    if(req.method==='GET'&&req.url==='/api/control') {send(200,await policy.view());return true;}
    if(req.method!=='POST') {send(405,{error:'Unsupported method'});return true;}
    if(!gateRoute&&(req.headers.origin!==origin||req.headers['x-armis-owner']!=='1'||!String(req.headers['content-type']??'').startsWith('application/json'))) {send(403,{error:'Same-origin owner request required'});return true;}
    try {
      const value=await body(req);
      if(req.url==='/api/control/commands') send(200,await policy.command(value));
      if(req.url==='/api/admission') {if(!(await policy.coverage()).verified)throw Error('Execution coverage is unverified');send(200,{reservation:policy.reserve(value)});}
      if(req.url==='/api/release') {if(typeof value.id!=='string')throw Error('Invalid reservation');policy.release(value.id,value.usage);send(200,{released:true});}
      if(req.url==='/api/chat') {
        if(typeof value.id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(value.id)||['__proto__','constructor','prototype'].includes(value.id)||typeof value.text!=='string'||!value.text.trim()||value.text.length>8000) throw Error('Invalid chat request');
        if(value.context!==undefined&&value.context!==null&&(typeof value.context!=='object'||Array.isArray(value.context)||Object.values(value.context).some(v=>typeof v!=='string'||v.length>256)))throw Error('Invalid context references');
        if(chats.has(value.id)) {const previous=chats.get(value.id);if(previous.fingerprint!==JSON.stringify(value))throw Error('Message id conflict');send(200,await previous.promise);return true;}
        const recorded=policy.state.chats[value.id];
        if(recorded){if(recorded.fingerprint!==JSON.stringify(value))throw Error('Message id conflict');send(200,recorded.result);return true;}
        const promise=(async()=>{
          const coverage=await policy.coverage();
          if(!coverage.verified||!coverage.chat||policy.state.globalStopped)return {id:value.id,state:'failed',reason:'Supported gated Hermes chat is unavailable or globally stopped'};
          const reservationId=`chat:${value.id}`;
          try {policy.reserve({id:reservationId,businessId:'owner-services',provider:'owner-chat'});}catch{return {id:value.id,state:'failed',reason:'Owner policy holds chat admission'};}
          policy.state.chats[value.id]={fingerprint:JSON.stringify(value),result:{id:value.id,state:'queued'}};policy.persist();
          let response,usage;try{const result=await policy.executor.chat({id:value.id,text:value.text,context:value.context}); if(typeof result.reply!=='string'||result.reply.length>16000)throw Error('Invalid Hermes response');if(result.usage&&Number.isSafeInteger(result.usage.tokens)&&result.usage.tokens>=0&&Number.isSafeInteger(result.usage.costMicros)&&result.usage.costMicros>=0)usage={tokens:result.usage.tokens,costMicros:result.usage.costMicros};response={id:value.id,state:'completed',reply:result.reply,recipient:coverage.recipient};}catch{response={id:value.id,state:'failed',reason:'Hermes did not return a verified response'};}finally{policy.release(reservationId,usage);}policy.state.chats[value.id].result=response;const keys=Object.keys(policy.state.chats);if(keys.length>500)delete policy.state.chats[keys[0]];policy.persist();return response;
        })();
        chats.set(value.id,{fingerprint:JSON.stringify(value),promise});if(chats.size>500)chats.delete(chats.keys().next().value);
        const response=await promise;send(response.state==='failed'?503:200,response);
      }
    } catch(e) {send(409,{error:e.message});}
    return true;
  };
}
