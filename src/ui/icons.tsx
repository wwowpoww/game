const INK = "#36261c";

/** Brass magnifying glass in the game's ink-and-flat-colour style. */
export function MagnifierIcon({ size = 44, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M29 31 L41 43" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <path d="M29 31 L41 43" stroke="#7a4b2e" strokeWidth="5" strokeLinecap="round" />
      <path d="M31.5 33.5 L39 41" stroke="#a8693f" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="20" r="14" fill={active ? "#fff1cf" : "#d9ecf2"} stroke={INK} strokeWidth="2" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="#e3b450" strokeWidth="3.4" />
      <circle cx="20" cy="20" r="15.8" fill="none" stroke={INK} strokeWidth="1.2" />
      <circle cx="20" cy="20" r="11.6" fill="none" stroke={INK} strokeWidth="1" />
      <path d="M12 17 Q14 12 19 11" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.9" />
      {active && <circle cx="20" cy="20" r="2" fill="#d6372b" stroke={INK} strokeWidth="0.8" />}
    </svg>
  );
}

export function ChevronIcon({ dir, size = 40 }: { dir: "left" | "right"; size?: number }) {
  const flip = dir === "left" ? "scale(-1,1) translate(-48,0)" : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g transform={flip}>
        <path d="M17 9 L33 24 L17 39" stroke={INK} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 9 L33 24 L17 39" stroke="#e8c88a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="24" r="3" fill="#e8c88a" stroke={INK} strokeWidth="1.4" />
      </g>
    </svg>
  );
}

export function BackIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 16 H26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 9 L7 16 L14 23" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RestartIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M24.5 12 A10 10 0 1 0 26 18" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M25.5 5.5 L25 12.5 L18 12" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SoundIcon({ size = 26, on }: { size?: number; on: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 12 H10 L17 6 V26 L10 20 H5 Z" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      {on ? (
        <>
          <path d="M21 11 Q24.5 16 21 21" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M24.5 7.5 Q30 16 24.5 24.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d="M21 12 L28 20 M28 12 L21 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function HandIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M11 17 V7.5 a2 2 0 0 1 4 0 V15 V5.5 a2 2 0 0 1 4 0 V15 V7 a2 2 0 0 1 4 0 V18 c0 6 -3 9 -8 9 c-4 0 -6 -2 -8 -5 l-3.5 -5.5 a2 2 0 0 1 3.2 -2.4 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function PointerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 5 L24 17 L17 18 L21 26 L18 27.5 L14 19.5 L9 24 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function MicIcon({ size = 24, off = false }: { size?: number; off?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="12" y="4" width="8" height="15" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M7.5 15 a8.5 8.5 0 0 0 17 0 M16 23.5 V28 M11.5 28 H20.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      {off && <path d="M6 5 L26 27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}

/** A small ornamental flourish used to frame headings. */
export function Flourish({ width = 160 }: { width?: number }) {
  return (
    <svg width={width} height={14} viewBox="0 0 160 14" aria-hidden="true">
      <path d="M2 7 H62 M98 7 H158" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <path d="M80 1.5 L86 7 L80 12.5 L74 7 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="68" cy="7" r="1.6" fill="currentColor" />
      <circle cx="92" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}
