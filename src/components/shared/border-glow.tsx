/**
 * Animated border glow effect used by floating workspace bars.
 * Extracted for reuse across homepage and app page.
 */
export function BorderGlow({ radius = 'rounded-2xl' }: { radius?: string }) {
  return (
    <div
      className={`pointer-events-none absolute -inset-px -z-10 overflow-hidden ${radius}`}
      style={{
        padding: '1.5px',
        WebkitMask:
          'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'exclude',
      }}
    >
      <div className="absolute left-1/2 top-1/2 aspect-square h-[max(300%,1200px)] -translate-x-1/2 -translate-y-1/2 animate-[spin_8s_ease-in-out_infinite] bg-[conic-gradient(from_0deg,transparent_44%,#b34a4a80_46%,#b34a4a_48%,#b39a2b_49%,#8ab342_50%,#42b396_51%,#4268b3_52%,#4268b380_54%,transparent_56%)]" />
      <div className="absolute left-1/2 top-1/2 aspect-square h-[max(300%,1200px)] -translate-x-1/2 -translate-y-1/2 animate-[spin_8s_ease-in-out_infinite] bg-[conic-gradient(from_180deg,transparent_44%,#b34a4a80_46%,#b34a4a_48%,#b39a2b_49%,#8ab342_50%,#42b396_51%,#4268b3_52%,#4268b380_54%,transparent_56%)]" />
    </div>
  );
}
