import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {decodeNativeSessions} from '../src/adapters/live';
import {NativeSessionsPanel} from '../src/ui/NativeSessionsPanel';
const ids=['20261003_192208_b0e017','20261003_192426_7cbc1e','20261003_192434_c34fd0','20261003_192426_17140b','20261003_192441_c234d5'];
const value={version:2,state:'connected',observedAt:100000,sessions:ids.map(sessionId=>({sessionId,state:'connected',workerId:null,task:{state:'running',currentStep:'Inspect a file',lastUpdate:99000,stale:false},configuredModel:'gpt-6.1-sol',actualModel:null,privatePrompt:'PRIVATE TEXT'})),sessionCount:5,boundRoleCount:0,independentAcceptance:'not observed'};
it('shows all five native sessions separately from explicit canonical roles and actual receipts',()=>{
 const data=decodeNativeSessions(value,100000)!;const html=renderToStaticMarkup(createElement(NativeSessionsPanel,{data,now:100000,live:true}));
 for(const id of ids)expect(html).toContain(id);
 expect(html).toContain('5 observed sessions');expect(html).toContain('0 explicitly bound roles');expect(html).toContain('Configured model (not an actual receipt)');expect(html).toContain('Actual model: Not reported');expect(html).not.toContain('PRIVATE TEXT');
});
it('withholds arbitrary free text and does not revive stale or disconnected execution',()=>{
 const data=decodeNativeSessions({...value,sessions:[{...value.sessions[0],task:{state:'running',currentStep:'Read /home/private/secret.txt',lastUpdate:1,stale:false}}],sessionCount:1},100000)!;
 const html=renderToStaticMarkup(createElement(NativeSessionsPanel,{data,now:200000,live:true}));expect(html).toContain('Unknown / stale');expect(html).not.toContain('/home/private');
 expect(renderToStaticMarkup(createElement(NativeSessionsPanel,{data,now:100000,live:false}))).toContain('Unknown / disconnected');
 expect(decodeNativeSessions({...value,sessions:[value.sessions[0],value.sessions[0]]},100000)).toBeNull();
 expect(decodeNativeSessions({...value,sessions:[{...value.sessions[0],workerId:'invented.worker'}]},100000)).toBeNull();
});
it('explains scoped visibility without implying discovery of private sessions',()=>{
 const data=decodeNativeSessions(value,100000)!;
 const html=renderToStaticMarkup(createElement(NativeSessionsPanel,{data,now:100000,live:true}));
 expect(html).toContain('Only explicitly authorized sessions are visible');
 expect(html).toContain('Enrollment does not prove a current process or accepted work');
});
