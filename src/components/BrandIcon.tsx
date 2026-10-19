/** The four-dot BetterHealth mark on a dark tile, as JSX for next/og's ImageResponse. */
export function BrandIcon({ size, maskable = false }: { size: number; maskable?: boolean }) {
  // Maskable icons get cropped to a circle or squircle by the OS, so keep the mark well inside the safe zone.
  const d = Math.round(size * (maskable ? 0.2 : 0.26));
  const gap = Math.round(size * 0.035);
  const dot = (color: string) => ({ width: d, height: d, borderRadius: d, background: color });
  return (
    <div
      style={{
        width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0b1f1d", borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", width: d * 2 + gap, gap }}>
        <div style={dot("#ff5a1f")} />
        <div style={dot("#ffd23f")} />
        <div style={dot("#ff8cc6")} />
        <div style={dot("#0fb5a6")} />
      </div>
    </div>
  );
}
