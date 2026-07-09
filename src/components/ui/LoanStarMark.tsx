/** Gold star mark — same treatment as the staff shell sidebar. */
export function LoanStarMark({ size = 32 }: { size?: number }) {
  const icon = Math.round(size * 0.47);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold-300 to-gold-600"
      style={{ width: size, height: size }}
    >
      <svg width={icon} height={icon} viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z"
          className="fill-navy-900"
        />
      </svg>
    </div>
  );
}
