import type { AdapterSink, WorkshopAdapter } from '../adapter';
import { mapObservation, projectSnapshot, validateObservation, type Observation } from './projection';
import { normalizeSnapshot } from '../../core/normalize';
import { currentWorkEvents, withCurrentWork } from './currentWork';
import { diagnostics as streamDiagnostics,decodeFeedReports } from '../../core/connections';

export interface Stream {
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  onerror: (() => void) | null;
  close(): void;
}
interface Options { createStream?: () => Stream; now?: () => number; fetchEvidence?: (()=>Promise<Response>) | null }
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export class LiveAdapter implements WorkshopAdapter {
  readonly kind = 'live' as const;
  readonly label = 'Live · observed local telemetry';
  readonly capabilities = { redirect: false, controls: false };
  readonly diagnostics = { rejected: 0, contractMismatch: false, message: '' };
  private sink: AdapterSink | null = null;
  private evidenceTimer:ReturnType<typeof setInterval>|null=null;
  private evidenceBusy=false;
  private readonly fetchEvidence:(()=>Promise<Response>)|null;
  private stream: Stream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private streamGeneration = 0;
  private epoch: string | null = null;
  private cursor = 0;
  private lastMessage = 0;
  private records: Observation[] = [];
  private currentWork: unknown = null;
  private readonly now: () => number;
  private readonly createStream: () => Stream;
  constructor(options: Options = {}) {
    this.now = options.now ?? Date.now;
    this.fetchEvidence=options.fetchEvidence===undefined?(options.createStream?null:()=>fetch('/api/evidence',{credentials:'same-origin',signal:AbortSignal.timeout(12000)})):options.fetchEvidence;
    this.createStream = options.createStream ?? (() => new EventSource('/api/events') as unknown as Stream);
  }
  start(sink: AdapterSink) {
    this.stop(); this.sink = sink;
    streamDiagnostics.reset(); streamDiagnostics.update({endpoint:'/api/events'});
    this.diagnostics.rejected = 0; this.diagnostics.contractMismatch = false; this.diagnostics.message = '';
    sink.connection('disconnected');
    this.connect();
    void this.readEvidence();
    this.evidenceTimer=setInterval(()=>void this.readEvidence(),15000);
    sink.tick(this.now());
    this.timer = setInterval(() => {
      this.sink?.tick(this.now());
      if (this.stream && this.now() - this.lastMessage > 30000) this.recover('Quiet stream heartbeat lost');
    }, 1000);
  }
  private connect() {
    if (!this.sink) return;
    const generation = this.generation, streamGeneration = ++this.streamGeneration;
    this.epoch = null; this.cursor = 0; this.lastMessage = this.now();
    let stream: Stream;
    try { stream = this.createStream(); } catch { this.recover('Cannot open local stream'); return; }
    this.stream = stream;
    const current = () => generation === this.generation && streamGeneration === this.streamGeneration && this.stream === stream;
    const handler = (kind: string) => ({ data }: { data: string }) => {
      if (!current()) return;
      try {
        if (data.length > 16000000) throw Error('Message exceeds bound');
        const m = JSON.parse(data);
        if (!m || m.version !== 1 || typeof m.epoch !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(m.epoch) || !integer(m.cursor)) {
          this.diagnostics.contractMismatch = true; throw Error('Contract mismatch: expected local telemetry v1');
        }
        if (kind === 'snapshot') {
          if (m.mode !== 'live' || !Array.isArray(m.observations) || m.observations.length > 10000) throw Error('Invalid snapshot');
          const records: Observation[] = m.observations.map(validateObservation);
          if (records.some((e, i) => e.cursor > m.cursor || (i > 0 && e.cursor <= records[i - 1]!.cursor))) throw Error('Invalid snapshot cursor');
          this.currentWork = m.currentWork ?? null;
          const snapshot = normalizeSnapshot(withCurrentWork(projectSnapshot(records, this.now()),this.currentWork));
          if (!snapshot) throw Error('Invalid projected snapshot');
          this.records = records; this.epoch = m.epoch; this.cursor = m.cursor;
          this.sink!.reset(); // authoritative replacement, including empty/restarted sources
          this.sink!.snapshot(snapshot, 'connected');
          this.sink!.connection('connected');
          streamDiagnostics.update({acceptedSnapshots:streamDiagnostics.get().acceptedSnapshots+1});
          this.workDiagnostics(this.currentWork);
        } else {
          if (this.epoch === null) { this.reject('Snapshot required before incremental events'); return; }
          if (m.epoch !== this.epoch) throw Error('Server restarted without snapshot');
          if (kind === 'current-work') {
            if(m.cursor!==this.cursor)throw Error('Native stream cursor diverged');
            this.currentWork=m.currentWork;
            const events=currentWorkEvents(this.currentWork);
            this.sink!.events(events);
            streamDiagnostics.update({acceptedEvents:streamDiagnostics.get().acceptedEvents+events.length});
            this.workDiagnostics(this.currentWork);
          } else if (kind === 'heartbeat') {
            if (m.cursor !== this.cursor) throw Error('Heartbeat cursor diverged');
          } else {
            if (!integer(m.previousCursor) || !Array.isArray(m.observations) || m.observations.length > 500) throw Error('Invalid event batch');
            if (m.cursor <= this.cursor) return; // exact previously applied range is historical, not new animation
            if (m.previousCursor !== this.cursor) throw Error('Cursor gap: replacing with snapshot');
            const records: Observation[] = m.observations.map(validateObservation);
            if (records.some((e,i) => e.cursor <= this.cursor || e.cursor > m.cursor || (i > 0 && e.cursor <= records[i-1]!.cursor))) throw Error('Invalid event sequence');
            if (!records.length || records.at(-1)!.cursor !== m.cursor || this.records.length + records.length > 10000) throw Error('Invalid or oversized journal');
            const oldRoles = new Set(this.records.map(e => e.workerId));
            const newRoles = records.some(e => e.workerId && !oldRoles.has(e.workerId));
            const combined = [...this.records, ...records];
            // Validate complete candidate before delivering any part.
            const snapshot = normalizeSnapshot(withCurrentWork(projectSnapshot(combined, this.now()),this.currentWork));
            if (!snapshot) throw Error('Invalid projected snapshot');
            const events = records.flatMap(mapObservation);
            this.records = combined; this.cursor = m.cursor;
            if (newRoles) this.sink!.snapshot(snapshot, 'connected');
            else this.sink!.events(events);
            streamDiagnostics.update({acceptedEvents:streamDiagnostics.get().acceptedEvents+records.length});
          }
        }
        this.lastMessage = this.now(); this.diagnostics.message = '';
        streamDiagnostics.update({lastMessageAt:this.lastMessage,lastValidAt:this.lastMessage,lastError:null});
      } catch (e) { this.reject(e instanceof Error ? e.message : 'Invalid message'); this.recover(this.diagnostics.message); }
    };
    for (const kind of ['snapshot','events','heartbeat','current-work']) stream.addEventListener(kind, handler(kind));
    stream.onerror = () => { if (current()) this.recover('Local stream disconnected'); };
  }
  private workDiagnostics(value:unknown) {
    // Called only after the native mapper/normalizer accepts the source. No
    // provider, machine, business, or budget health is inferred from a heartbeat.
    const v=value as {state?:string;observedAt?:number;task?:{lastUpdate:number};steps?:unknown[]}|null;
    const feeds={...streamDiagnostics.get().feeds};
    if(v?.state==='connected'&&Number.isSafeInteger(v.observedAt)&&v.task&&v.task.lastUpdate<=v.observedAt!&&v.observedAt!<=this.now()+30000){
      const base={status:'ok' as const,checkedAt:v.observedAt!,lastRecordAt:v.task.lastUpdate};
      feeds.runtime={...base,id:'runtime',records:1,source:'Bound native Hermes SessionDB',detail:'Successfully read and mapped the explicitly bound default Hermes SessionDB session'};
      feeds.tools={...base,id:'tools',records:Array.isArray(v.steps)?v.steps.length:0,source:'Bound native Hermes SessionDB tool metadata',detail:'Sanitized native tool-step metadata; steps are not workers or acceptance'};
    }else{
      for(const id of ['runtime','tools'] as const)feeds[id]={id,status:'not_configured',checkedAt:this.now(),lastRecordAt:null,records:0,detail:'No successful explicitly bound native source check in this frame'};
    }
    streamDiagnostics.update({feeds});
  }
  private async readEvidence(){
    if(!this.fetchEvidence||this.evidenceBusy||!this.sink)return;
    const generation=this.generation;this.evidenceBusy=true;
    try{
      const response=await this.fetchEvidence();if(!response.ok)throw Error('Evidence source unavailable');
      const value=await response.json();const reports=decodeFeedReports(value?.reports,this.now());
      if(!reports||reports.length===0)throw Error('Unsupported source report contract');
      if(generation!==this.generation||!this.sink)return;
      const feeds={...streamDiagnostics.get().feeds};
      // Native animation/source diagnostics stay driven by immediate accepted SSE frames.
      for(const report of reports)if(report.id!=='runtime'&&report.id!=='tools')feeds[report.id]=report;
      streamDiagnostics.update({feeds});
    }catch{
      // Retain original evidence timestamps: an outage must expire, never re-date an old check.
    }finally{if(generation===this.generation)this.evidenceBusy=false;}
  }
  private reject(message: string) { this.diagnostics.rejected++; this.diagnostics.message = message; streamDiagnostics.update({rejectedMessages:streamDiagnostics.get().rejectedMessages+1,lastError:message}); }
  private recover(message: string) {
    if (!this.sink) return;
    this.diagnostics.message = message;
    streamDiagnostics.update({lastError:message});
    this.stream?.close(); this.stream = null; this.streamGeneration++;
    this.sink.connection(this.records.length || this.epoch !== null ? 'reconnecting' : 'disconnected');
    if (this.retry !== null) return;
    const generation = this.generation;
    this.retry = setTimeout(() => { this.retry = null; if (generation === this.generation) this.connect(); }, 1000);
  }
  stop() {
    this.generation++; this.streamGeneration++;
    if(this.evidenceTimer!==null)clearInterval(this.evidenceTimer);
    this.evidenceTimer=null;this.evidenceBusy=false;
    this.stream?.close(); this.stream = null;
    if (this.timer !== null) clearInterval(this.timer);
    if (this.retry !== null) clearTimeout(this.retry);
    this.timer = null; this.retry = null; this.sink = null; this.records = []; this.currentWork = null; this.epoch = null;
  }
  clock() { return this.now(); }
  requestRedirect() { return { accepted: false, reason: 'Read-only Live viewer: redirect and controls are disabled.' }; }
}
