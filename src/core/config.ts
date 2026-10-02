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
  ['research', 'Research', 3],
  ['creation', 'Creation', 3],
  ['audit', 'Audit', 3],
  ['lounge', 'Lounge', 0],
  ['fixes', 'Fixes', 3],
];

export const BUSINESSES: Business[] = [
  {
    id: 'hermes-hq',
    kind: 'hq',
    brand: {
      displayName: 'Hermes HQ',
      signText: 'HERMES HQ',
      provisional: true,
      provisionalNote: 'Provisional Armis/Hermes HQ identity - replace when final artwork exists.',
      colors: { primary: '#1a2233', secondary: '#2b3550', accent: '#f2b84b', glow: '#ffd27a' },
      assets: {},
    },
    departments: depts('hermes-hq', [
      ['dispatch', 'Dispatch', 2],
      ['capacity', 'AI Capacity', 1],
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
    departments: depts('aster-ledger', [
      ['feeds', 'Feeds', 2],
      ['research', 'Research', 2],
      ['rules', 'Rules', 2],
      ['lounge', 'Coffee Lounge', 0],
      ['trader_watch', 'Trader Watch', 1],
      ['audit', 'Audit', 1],
      ['portfolio', 'Paper Portfolio', 1],
    ]),
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
  const id = `${businessId}:${stage}`;
  return DEPARTMENT_BY_ID[id] ? id : undefined;
}

export function loungeOf(businessId: string): string {
  return `${businessId}:lounge`;
}

/**
 * The persistent roster. Characters are visual identities - they do not imply a
 * permanently running AI process.
 */
export const ROSTER: Worker[] = [
  // Hermes HQ
  w('hermes', 'Hermes', 'hermes-hq', 'Dispatcher', 'dispatch', ['#e0ac82', '#2b2b38', 'short', '#c9a227', '#2a2f45', 'none']),
  w('echo', 'Echo', 'hermes-hq', 'Capacity watcher', 'capacity', ['#8d5a3b', '#151515', 'bun', '#3f8f8a', '#24283a', 'headphones']),
  // Uditus
  w('nova', 'Nova', 'uditus', 'Researcher', 'research', ['#f1c7a3', '#2e1f1a', 'short', '#6b7a8f', '#283044', 'headphones']),
  w('kai', 'Kai', 'uditus', 'Creator', 'creation', ['#c68c5f', '#171313', 'short', '#2f3b52', '#1d2230', 'glasses']),
  w('mira', 'Mira', 'uditus', 'Creator', 'creation', ['#f0c29a', '#8a3b1f', 'long', '#9c4a3c', '#2a2433', 'none']),
  w('atlas', 'Atlas', 'uditus', 'Auditor', 'audit', ['#a8714a', '#3b2416', 'curly', '#30333d', '#1f2229', 'headphones']),
  w('iris', 'Iris', 'uditus', 'Auditor', 'audit', ['#efc9a8', '#5b2c86', 'bob', '#4c3a73', '#25213a', 'glasses']),
  w('juno', 'Juno', 'uditus', 'Fixer', 'fixes', ['#7a4a2c', '#101010', 'mohawk', '#2f6b5a', '#1c2427', 'none']),
  w('pip', 'Pip', 'uditus', 'Researcher', 'research', ['#f3d1b5', '#c98b3a', 'curly', '#8a6d3b', '#2b2a2a', 'beanie']),
  // Etsy Studio
  w('wren', 'Wren', 'etsy-studio', 'Researcher', 'research', ['#e8b48e', '#6e3b1e', 'long', '#7a5c8f', '#2c2533', 'none']),
  w('sol', 'Sol', 'etsy-studio', 'Creator', 'creation', ['#9a643f', '#1c1410', 'curly', '#c0703a', '#2a2420', 'none']),
  w('fern', 'Fern', 'etsy-studio', 'Auditor', 'audit', ['#f2cfb0', '#3d5c2a', 'bun', '#4f7a52', '#232a23', 'glasses']),
  w('oak', 'Oak', 'etsy-studio', 'Fixer', 'fixes', ['#6b4126', '#2a2a2a', 'bald', '#5a4a3a', '#22201e', 'beanie']),
  // Aster Ledger (paper trading)
  w('quill', 'Quill', 'aster-ledger', 'Feed watcher', 'feeds', ['#e9c09a', '#2b1d14', 'short', '#2f5e66', '#1d2427', 'headphones']),
  w('tess', 'Tess', 'aster-ledger', 'Feed watcher', 'feeds', ['#b07a52', '#1a1a1a', 'bun', '#4b6b8a', '#23262f', 'none']),
  w('vega', 'Vega', 'aster-ledger', 'Researcher', 'research', ['#8a5a3c', '#e8e0d0', 'bob', '#6a4c8c', '#262236', 'glasses']),
  w('rook', 'Rook', 'aster-ledger', 'Rules checker', 'rules', ['#f0cba8', '#5a3a20', 'curly', '#3a4a5a', '#1e2228', 'glasses']),
  w('lynx', 'Lynx', 'aster-ledger', 'Trader watch', 'trader_watch', ['#c48a5c', '#0f0f12', 'long', '#7a3b3b', '#241c1c', 'none']),
  w('sable', 'Sable', 'aster-ledger', 'Auditor', 'audit', ['#5e3b25', '#121212', 'short', '#2f5a48', '#1a2420', 'headphones']),
  w('penny', 'Penny', 'aster-ledger', 'Paper portfolio', 'portfolio', ['#f3d6bd', '#b5652c', 'long', '#a07a2a', '#2a2418', 'none']),
];

function w(
  slug: string,
  name: string,
  businessId: string,
  role: string,
  dept: DepartmentKind,
  [skin, hair, hairStyle, shirt, pants, accessory]: [string, string, Worker['appearance']['hairStyle'], string, string, NonNullable<Worker['appearance']['accessory']>],
): Worker {
  return {
    id: `w-${slug}`,
    name,
    businessId,
    role,
    homeDepartmentId: `${businessId}:${dept}`,
    appearance: { skin, hair, hairStyle, shirt, pants, accessory },
  };
}
