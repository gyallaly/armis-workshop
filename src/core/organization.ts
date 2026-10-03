import registry from './control-registry.json';
/** Version-1 ARMIS Control uses these IDs; viewer IDs remain stable for saved links. */
export const CONTROL_BUSINESS_IDS: Readonly<Record<string,string>> = Object.freeze({armis:'hermes-hq',uditus:'uditus',aster:'aster-ledger',etsy:'etsy-studio'});
export type ControlRoleKind = 'group-ceo'|'business-ceo'|'cfo'|'efficiency'|'audit'|'operations'|'coordinator'|'worker';
export interface ControlRole { id:string; kind:ControlRoleKind; controlBusinessId:string; businessId:string; reportsTo:string|null; label:string; mandate:string; acceptsFrom:string[]; mayDelegateTo:string[]; prohibited:string[] }
/** Exact declaration snapshot from armis-control/src/organization.ts at this ref. */
export const CONTROL_REGISTRY_REF = registry.ref;
export const ORGANIZATION_ROLES: readonly ControlRole[] = registry.roles.map(source => {
  const suffix = source.id.split('.')[1]!;
  const businessName = source.business === 'uditus' ? 'Uditus' : source.business === 'aster' ? 'Aster' : 'Etsy';
  const label = source.kind === 'group-ceo' ? 'ARMIS CEO' : source.kind === 'business-ceo' ? businessName + ' CEO'
    : source.kind === 'cfo' ? 'CFO' : source.kind === 'coordinator' ? suffix[0]!.toUpperCase() + suffix.slice(1) + ' coordinator'
    : suffix[0]!.toUpperCase() + suffix.slice(1);
  return {...source, kind:source.kind as ControlRoleKind, controlBusinessId:source.business,
    businessId:CONTROL_BUSINESS_IDS[source.business]!, label};
});
