import type { ReactElement } from 'react';

/** Small stroke icons (original, drawn for this project). */
const PATHS: Record<string, ReactElement> = {
  research: (
    <>
      <rect x="4" y="3" width="13" height="18" rx="1" />
      <path d="M7 8h7M7 12h7M7 16h4" />
    </>
  ),
  creation: (
    <>
      <path d="M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3Z" />
      <path d="M9.5 20h5" />
    </>
  ),
  audit: (
    <>
      <path d="M12 4v16M6 20h12M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0Zm14 0-3 6a3 3 0 0 0 6 0Z" />
    </>
  ),
  fixes: (
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L4 17l3 3 5.4-5.3a4 4 0 0 0 5.3-5.4l-2.5 2.5-2.4-.6-.6-2.4Z" />
    </>
  ),
  lounge: (
    <>
      <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
      <path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3Z" />
      <path d="M5 17v2M19 17v2" />
    </>
  ),
  dispatch: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    </>
  ),
  capacity: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  play: <path d="M7 5v14l11-7Z" />,
  pause: <path d="M7 5h3v14H7zM14 5h3v14h-3z" />,
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  redirect: (
    <>
      <path d="M4 12h14M13 6l6 6-6 6" />
    </>
  ),
  folder: <path d="M3 6h6l2 2h10v11H3Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5l8-2v18M12 8l8 2v11M2 21h20" />
      <path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  wifi: (
    <>
      <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r=".8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9Z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
};

export function Icon({ name, size = 18, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name] ?? null}
    </svg>
  );
}
