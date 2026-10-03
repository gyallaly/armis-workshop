import { ORGANIZATION_ROLES } from './organization';
import type { Business, Department, DepartmentKind, Worker } from './types';

/**
 * Business configuration. Branding is data, not code: replace the provisional
 * Etsy Studio and Hermes HQ entries here (and the files under public/brand/)
 * once the real names and emblems are supplied.
 */

const UDITUS_FONT = 'Manrope, "Segoe UI", Arial, sans-serif';

function depts(businessId: string, kinds: [DepartmentKind, string, number][]): Department[] {
  return kinds.map(([kind, label, desks]) => ({ id: `${businessId}:${kind}`, businessId, kind, label, desks }));
}

const STANDARD: [DepartmentKind, string, number][] = [
  ['leadership', 'Business CEO', 1],
  ['delivery', 'Delivery', 3],
  ['research', 'Research', 2],
  ['quality', 'Quality', 2],
  ['lounge', 'Lounge', 0],
];

export const BUSINESSES: Business[] = [
  {
    id: 'hermes-hq',
    kind: 'hq',
    brand: {
      displayName: 'Armis Syndicate HQ',
      signText: 'ARMIS HQ',
      provisional: true,
      provisionalNote: 'Provisional Armis/Hermes HQ identity - replace when final artwork exists.',
      colors: { primary: '#1a2233', secondary: '#2b3550', accent: '#f2b84b', glow: '#ffd27a' },
      assets: {},
    },
    departments: depts('hermes-hq', [
      ['leadership', 'ARMIS CEO', 1],
      ['finance', 'CFO', 1],
      ['efficiency', 'Efficiency', 1],
      ['quality', 'Group Audit', 2],
      ['operations', 'Operations', 2],
      ['lounge', 'Lounge', 0],
    ]),
  },
  {
    id: 'uditus',
    kind: 'business',
    brand: {
      displayName: 'Uditus',
      signText: 'UDITUS',
      provisional: false,
      // Uditus design tokens: navy 900 / navy 800 / blue 700 / blue 500 / blue 300.
      colors: { primary: '#0C2F51', secondary: '#123D68', accent: '#3C7AB0', glow: '#8FB6D6' },
      assets: {
        lockupOnDark: '/brand/uditus/lockup-inline-white.png',
        markOnDark: '/brand/uditus/mark-white.png',
        markOnLight: '/brand/uditus/mark-navy.png',
      },
      fontFamily: UDITUS_FONT,
    },
    departments: depts('uditus', STANDARD),
  },
  {
    id: 'etsy-studio',
    kind: 'business',
    brand: {
      displayName: 'Etsy Studio',
      signText: 'ETSY STUDIO',
      provisional: true,
      provisionalNote: 'Provisional shop name and neutral placeholder emblem. Not the Etsy corporate logo.',
      colors: { primary: '#3a2a22', secondary: '#5a3d2c', accent: '#e08a4f', glow: '#ffc58a' },
      assets: {
        markOnDark: '/brand/etsy-studio/placeholder-emblem.svg',
        markOnLight: '/brand/etsy-studio/placeholder-emblem.svg',
      },
    },
    departments: depts('etsy-studio', STANDARD),
  },
  {
    // Independent business: not owned by or nested within Uditus.
    id: 'aster-ledger',
    kind: 'business',
    brand: {
      displayName: 'Aster Ledger',
      signText: 'ASTER LEDGER',
      provisional: true,
      provisionalNote: 'Provisional name and original placeholder emblem. Paper trading only; no affiliation with any venue.',
      colors: { primary: '#0f2a2e', secondary: '#173b40', accent: '#f2b84b', glow: '#5fe3d0' },
      assets: {
        markOnDark: '/brand/aster-ledger/placeholder-emblem.svg',
        markOnLight: '/brand/aster-ledger/placeholder-emblem.svg',
      },
    },
    departments: depts('aster-ledger', STANDARD),
  },
];

/** Businesses whose workflow is the paper-trading candidate pipeline. */
export const TRADING_BUSINESSES = new Set(['aster-ledger']);

export const BUSINESS_BY_ID: Record<string, Business> = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));

export const DEPARTMENT_BY_ID: Record<string, Department> = Object.fromEntries(
  BUSINESSES.flatMap((b) => b.departments).map((d) => [d.id, d]),
);

/** Explicit stage -> department mapping. Never inferred from prompt text. */
export function departmentForStage(businessId: string, stage: string): string | undefined {
  const room = ({creation:'delivery', fixes:'delivery', audit:'quality', feeds:'research', rules:'quality', trader_watch:'research', portfolio:'delivery'} as Record<string,string>)[stage] ?? stage;
  const id = `${businessId}:${room}`;
  return DEPARTMENT_BY_ID[id] ? id : undefined;
}

export function loungeOf(businessId: string): string {
  return `${businessId}:lounge`;
}

/** Stable identities come directly from the inspected Control registry. */
export const ROSTER: Worker[] = ORGANIZATION_ROLES.map((role, index) => {
  const suffix = role.id.split('.')[1]!;
  const home = role.kind === 'group-ceo' || role.kind === 'business-ceo' ? 'leadership'
    : role.kind === 'cfo' ? 'finance' : role.kind === 'efficiency' ? 'efficiency'
    : role.kind === 'audit' || suffix === 'quality' || suffix === 'reviewer' ? 'quality'
    : role.kind === 'operations' ? 'operations'
    : suffix === 'research' || suffix === 'researcher' ? 'research' : 'delivery';
  const skins = ['#e0ac82','#8d5a3b','#f1c7a3','#a8714a','#f2cfb0'];
  const hair = ['#2b2b38','#151b24','#6e3b1e','#3d5c2a'];
  const styles: Worker['appearance']['hairStyle'][] = ['short','bun','curly','bob','long','bald'];
  return { id: role.id, name: role.label, businessId: role.businessId, role: role.kind,
    homeDepartmentId: role.businessId + ':' + home, reportsTo: role.reportsTo, mandate: role.mandate,
    appearance: { skin: skins[index % skins.length]!, hair: hair[index % hair.length]!, hairStyle: styles[index % styles.length]!,
      shirt: BUSINESS_BY_ID[role.businessId]!.brand.colors.accent, pants:'#273246', accessory:index % 3 === 0 ? 'glasses' : 'none' } };
});
