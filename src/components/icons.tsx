/** Iconos de trazo (24×24, 2px), dibujados para Forja. */
const P = {
  train: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  history: 'M4 5h16M4 12h16M4 19h10',
  exercises: 'M5 4h10l4 4v12H5zM15 4v4h4M9 12h6M9 16h6',
  progress: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  tools: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  minus: 'M5 12h14',
  coach: 'M4 20c0-4 3.5-6 8-6s8 2 8 6M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  trophy: 'M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 14v4M8 20h8',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  play: 'M7 5l12 7-12 7z',
  flask: 'M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3M7 15h10',
}

export type IconName = keyof typeof P

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}
