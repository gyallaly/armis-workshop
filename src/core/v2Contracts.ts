import { BUSINESSES } from './config';
export type Lifecycle = 'running' | 'draining' | 'stopping' | 'stopped' | 'unknown';
export interface Allocation { weight: number; maxConcurrent: number; tokenLimit?: number | null; requestLimit?: number | null; spendLimitMicros?: number | null; allowedProviders?: string[] | null }
export interface CompanyPolicy extends Allocation { lifecycle: Lifecycle; consumedTokens?: number; consumedRequests?: number; consumedCostMicros?: number; usageProvenance?: 'unreported' | 'locally_measured' | 'reservation_upper_bound' }
export interface OwnerReserve { maxConcurrent: number; consumedTokens?: number; consumedRequests?: number; consumedCostMicros?: number; activeReservations?: number; usageProvenance?: 'unreported' | 'locally_measured' | 'reservation_upper_bound' }
export type CommandType = 'company.stop' | 'company.pause' | 'company.resume' | 'allocation.set' | 'global.stop' | 'global.resume';
export interface Receipt { id: string; type: CommandType; state: 'requested' | 'acknowledged' | 'effective' | 'rejected'; reason?: string; at: number }
export interface ControlView { revision: number; companies: Record<string, CompanyPolicy>; capabilities: { companyControl: boolean; allocations: boolean; chat: boolean }; receipts: Receipt[]; recipient?: string; globalStopped?: boolean; ownerReserve?: OwnerReserve }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const safe = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const bounded = (v: unknown, limit: number): v is string => typeof v === 'string' && v.length <= limit;
const id = (v: unknown): v is string => bounded(v,120) && /^[A-Za-z0-9_.:-]+$/.test(v) && !['__proto__','constructor','prototype'].includes(v);
const commandTypes = ['company.stop','company.pause','company.resume','allocation.set','global.stop','global.resume'];
export function validAllocation(v: unknown): v is Allocation {
  return object(v) && Number.isFinite(v.weight) && Number(v.weight) >= 0 && Number(v.weight) <= 100 && safe(v.maxConcurrent) && Number(v.maxConcurrent) <= 12 && ['tokenLimit','requestLimit','spendLimitMicros'].every((k) => v[k] === undefined || v[k] === null || safe(v[k])) && (v.allowedProviders === undefined || v.allowedProviders === null || Array.isArray(v.allowedProviders) && v.allowedProviders.length <= 32 && v.allowedProviders.every(id));
}
export function normalizeReceipt(value: unknown): Receipt | null {
  if (!object(value) || !id(value.id) || !commandTypes.includes(String(value.type)) || !['requested','acknowledged','effective','rejected'].includes(String(value.state)) || !safe(value.at) || value.reason !== undefined && !bounded(value.reason,2000)) return null;
  return { id: value.id, type: value.type as CommandType, state: value.state as Receipt['state'], at: value.at as number, ...(value.reason === undefined ? {} : { reason: value.reason as string }) };
}
export function normalizeControlView(value: unknown): ControlView | null {
  if (!object(value) || value.version !== 2 || !safe(value.revision) || !object(value.companies) || Object.keys(value.companies).length !== BUSINESSES.length || !object(value.capabilities) || !['companyControl','allocations','chat'].every((k) => typeof (value.capabilities as Record<string,unknown>)[k] === 'boolean') || !Array.isArray(value.receipts) || value.receipts.length > 500 || value.recipient !== undefined && !bounded(value.recipient,160)) return null;
  const companies: Record<string, CompanyPolicy> = {};
  for (const business of BUSINESSES) {
    const p = value.companies[business.id];
    if (!validAllocation(p) || !object(p) || !['running','draining','stopping','stopped','unknown'].includes(String(p.lifecycle)) || !['consumedTokens','consumedRequests','consumedCostMicros'].every((k) => p[k] === undefined || safe(p[k])) || p.usageProvenance !== undefined && !['unreported','locally_measured','reservation_upper_bound'].includes(String(p.usageProvenance))) return null;
    companies[business.id] = { lifecycle: p.lifecycle as Lifecycle, weight: p.weight as number, maxConcurrent: p.maxConcurrent as number, tokenLimit: p.tokenLimit as number | null | undefined, requestLimit: p.requestLimit as number | null | undefined, spendLimitMicros: p.spendLimitMicros as number | null | undefined, allowedProviders: p.allowedProviders as string[] | null | undefined, consumedTokens: p.consumedTokens as number | undefined, consumedRequests: p.consumedRequests as number | undefined, consumedCostMicros: p.consumedCostMicros as number | undefined };
    companies[business.id]!.usageProvenance = p.usageProvenance as CompanyPolicy['usageProvenance'];
  }
  const receipts = value.receipts.map(normalizeReceipt);
  if (receipts.some((r) => !r) || new Set(receipts.map((r) => r!.id)).size !== receipts.length) return null;
  if (value.globalStopped !== undefined && typeof value.globalStopped !== 'boolean') return null;
  const owner = value.ownerReserve;
  if (owner !== undefined && (!object(owner) || !safe(owner.maxConcurrent) || Number(owner.maxConcurrent) > 12 || !['consumedTokens','consumedRequests','consumedCostMicros','activeReservations'].every((k) => owner[k] === undefined || safe(owner[k])) || owner.usageProvenance !== undefined && !['unreported','locally_measured','reservation_upper_bound'].includes(String(owner.usageProvenance)))) return null;
  return { revision: value.revision as number, companies, receipts: receipts as Receipt[], capabilities: { companyControl: value.capabilities.companyControl as boolean, allocations: value.capabilities.allocations as boolean, chat: value.capabilities.chat as boolean }, ...(value.recipient === undefined ? {} : { recipient: value.recipient as string }), ...(value.globalStopped === undefined ? {} : { globalStopped: value.globalStopped as boolean }), ...(owner === undefined ? {} : { ownerReserve: { maxConcurrent: owner.maxConcurrent as number, consumedTokens: owner.consumedTokens as number | undefined, consumedRequests: owner.consumedRequests as number | undefined, consumedCostMicros: owner.consumedCostMicros as number | undefined, activeReservations: owner.activeReservations as number | undefined, usageProvenance: owner.usageProvenance as OwnerReserve['usageProvenance'] } }) };
}
