import { useSyncExternalStore } from 'react';
import { BUSINESSES } from '../core/config';
import { store, ui } from './store';
import { normalizeControlView, normalizeReceipt, validAllocation, type Allocation, type CompanyPolicy, type CommandType, type Receipt, type OwnerReserve } from '../core/v2Contracts';
export type { CompanyPolicy, CommandType, Receipt, Lifecycle } from '../core/v2Contracts';

export interface ChatMessage { id: string; role: 'owner' | 'hermes'; text: string; state: string; at: number }
export interface V2State {
  source: 'demo' | 'live'; revision: number; companies: Record<string, CompanyPolicy>;
  capabilities: { companyControl: boolean; allocations: boolean; chat: boolean };
  receipts: Receipt[]; messages: ChatMessage[]; recipient: string; error?: string; busy: boolean; chatOpen: boolean;
  globalStopped?: boolean; ownerReserve?: OwnerReserve;
}
const defaults = (live = false) => Object.fromEntries(BUSINESSES.map((b) => [b.id, { lifecycle: live ? 'unknown' : 'running', weight: live ? 0 : 25, maxConcurrent: live ? 0 : b.id === 'uditus' ? 1 : 3 }])) as Record<string, CompanyPolicy>;
export class V2Store {
  private generation = 0;
  private refreshTicket = 0;
  private state: V2State = { source: 'demo', revision: 0, companies: defaults(), capabilities: { companyControl: true, allocations: true, chat: true }, receipts: [], messages: [], recipient: 'Hermes · simulated', busy: false, chatOpen: false };
  private listeners = new Set<() => void>();
  get = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  update(patch: Partial<V2State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }
  reset(source: 'demo' | 'live') {
    this.generation++;
    const companies = defaults(source === 'live');
    this.update({ source, revision: 0, companies, receipts: [], messages: [], capabilities: { companyControl: source === 'demo', allocations: source === 'demo', chat: source === 'demo' }, recipient: source === 'demo' ? 'Hermes · simulated' : 'Hermes · not connected', error: undefined, busy: false, globalStopped: source === 'demo' ? false : undefined, ownerReserve: source === 'demo' ? { maxConcurrent: 1, consumedTokens: 0, consumedRequests: 0, consumedCostMicros: 0, activeReservations: 0, usageProvenance: 'locally_measured' } : undefined });
    if (source === 'demo') for (const [id, policy] of Object.entries(companies)) store.demo?.companyPolicy(id, { lifecycle: 'running', weight: policy.weight, maxConcurrent: policy.maxConcurrent });
  }
  async refresh() {
    if (this.state.source !== 'live') return;
    const generation = this.generation, ticket = ++this.refreshTicket;
    try {
      const res = await fetch('/api/control', { credentials: 'same-origin' });
      const raw = await res.json();
      if (!res.ok) throw new Error(raw.error ?? raw.reason ?? `Owner service unavailable (${res.status})`);
      const data = normalizeControlView(raw);
      if (!data) throw new Error('Owner service returned an unsupported contract');
      if (generation !== this.generation || ticket !== this.refreshTicket || data.revision < this.state.revision) return;
      this.update({ revision: data.revision, companies: data.companies, capabilities: { ...data.capabilities, chat: data.capabilities.chat && data.globalStopped !== true }, receipts: data.receipts ?? [], recipient: data.recipient ?? 'Hermes · recipient unreported', error: undefined, ownerReserve: data.ownerReserve, globalStopped: data.globalStopped });
    } catch (e) { if (generation === this.generation && ticket === this.refreshTicket) this.update({ error: String(e instanceof Error ? e.message : e), capabilities: { companyControl: false, allocations: false, chat: false }, companies: defaults(true) }); }
  }
  async command(type: CommandType, businessId?: string, allocation?: Allocation) {
    if (this.state.busy) return;
    const generation = this.generation;
    const id = `owner-${crypto.randomUUID()}`;
    const at = Date.now();
    const receipt: Receipt = { id, type, state: 'requested', at };
    this.update({ busy: true, receipts: [...this.state.receipts, receipt].slice(-40), error: undefined });
    try {
      if (this.state.source === 'demo') {
        if (!store.demo) throw new Error('Simulation is unavailable');
        const ids = type.startsWith('global.') ? BUSINESSES.map((b) => b.id) : businessId ? [businessId] : [];
        const companies = { ...this.state.companies };
        for (const biz of ids) {
          if (!companies[biz]) throw new Error('Unknown company');
          const lifecycle = type.endsWith('.stop') ? 'stopped' : type.endsWith('.pause') ? 'draining' : type.endsWith('.resume') ? 'running' : companies[biz]!.lifecycle;
          if (allocation && (!validAllocation(allocation) || biz === 'uditus' && allocation.maxConcurrent > 1)) throw new Error('Allocation is outside supported bounds');
          companies[biz] = { ...companies[biz]!, ...allocation, lifecycle };
          store.demo.companyPolicy(biz, { ...allocation, lifecycle: lifecycle === 'unknown' || lifecycle === 'stopping' ? 'stopped' : lifecycle });
        }
        const globalStopped = type === 'global.stop' ? true : type === 'global.resume' ? false : this.state.globalStopped;
        this.update({ companies, globalStopped, capabilities: { ...this.state.capabilities, chat: !globalStopped }, revision: this.state.revision + 1, receipts: this.state.receipts.map((r) => r.id === id ? { ...r, state: 'effective', reason: 'Applied to deterministic simulation; no Mini operation performed.' } : r) });
      } else {
        const capability = type === 'allocation.set' ? 'allocations' : 'companyControl';
        if (!this.state.capabilities[capability]) throw new Error('Mini has not verified this control capability. No command sent.');
        const res = await fetch('/api/control/commands', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Armis-Owner': '1' }, body: JSON.stringify({ id, expectedRevision: this.state.revision, type, businessId, allocation, expiresAt: Date.now() + 60_000 }) });
        const data = await res.json();
        if (generation !== this.generation) return;
        if (!res.ok) throw new Error(data.reason ?? data.error ?? `Command rejected (${res.status})`);
        const receipt = normalizeReceipt(data);
        if (!receipt || receipt.id !== id || receipt.type !== type) throw new Error('Owner service returned an invalid command receipt');
        this.update({ receipts: this.state.receipts.map((r) => r.id === id ? receipt : r) });
        await this.refresh();
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (generation === this.generation) this.update({ error: reason, receipts: this.state.receipts.map((r) => r.id === id ? { ...r, state: 'rejected', reason } : r) });
    } finally { if (generation === this.generation) this.update({ busy: false }); }
  }
  async chat(text: string) {
    if (!text.trim() || !this.state.capabilities.chat) return;
    const id = `chat-${crypto.randomUUID()}`, at = Date.now();
    const generation = this.generation;
    this.update({ messages: [...this.state.messages, { id, role: 'owner' as const, text: text.trim(), state: 'sending', at }].slice(-60) });
    try {
      let reply: string;
      let replyState = 'completed';
      if (this.state.source === 'demo') {
        const state = store.get();
        const working = Object.values(state.statuses).filter((s) => s.state === 'active').length;
        const stopped = BUSINESSES.filter((b) => this.state.companies[b.id]?.lifecycle === 'stopped').map((b) => b.brand.displayName);
        reply = `Simulation report: ${working} agents working across ${Object.keys(state.capacity).length} configured provider scopes. ${stopped.length ? `${stopped.join(', ')} stopped by owner policy.` : 'No company is shut down.'} This is a local status assistant, not the installed Hermes. Use the building controls or Power station to apply a simulated operation; chat does not silently change policy.`;
      } else {
        const selected = ui.get().selection;
        const context = selected ? { kind: selected.kind, id: 'id' in selected ? selected.id : 'dot' in selected ? selected.dot.taskId : undefined } : undefined;
        const res = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Armis-Owner': '1' }, body: JSON.stringify({ id, text: text.trim(), context }) });
        const data = await res.json();
        if (generation !== this.generation) return;
        if (!res.ok || data.state === 'failed') throw new Error(data.reason ?? data.error ?? 'Hermes did not acknowledge this message');
        if (data.id !== id || !['queued','completed'].includes(data.state) || data.reply !== undefined && (typeof data.reply !== 'string' || data.reply.length > 16000)) throw new Error('Hermes returned an unsupported conversation contract');
        replyState = data.state === 'completed' && typeof data.reply === 'string' ? 'completed' : 'queued';
        reply = data.reply ?? 'Hermes acknowledged the message. A response has not been reported yet.';
      }
      if (generation === this.generation) this.update({ messages: [...this.state.messages.map((m) => m.id === id ? { ...m, state: 'sent' } : m), { id: `${id}-reply`, role: 'hermes' as const, text: reply, state: replyState, at: Date.now() }].slice(-60) });
    } catch (e) { if (generation === this.generation) this.update({ messages: this.state.messages.map((m) => m.id === id ? { ...m, state: 'failed' } : m), error: e instanceof Error ? e.message : String(e) }); }
  }
}
export const v2 = new V2Store();
export const useV2 = () => useSyncExternalStore(v2.subscribe, v2.get);
