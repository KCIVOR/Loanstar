import { BRANDING } from "@/lib/branding";
import { cn } from "./cn";

/* LoanStar star mark — from branding bucket (favicon / icon). */
export function LoanStarMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote branding asset; avoid next/image wrapper bg
    <img
      src={BRANDING.iconUrl}
      alt="LoanStar"
      width={size}
      height={size}
      className={cn("logo-mark shrink-0", className)}
      style={{ width: size, height: size, background: "transparent" }}
      decoding="async"
    />
  );
}

/* Full wordmark logo — Loan-Star-Logo from branding bucket. */
export function LoanStarLogo({
  height = 40,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * (189 / 65));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote branding asset; avoid next/image wrapper bg
    <img
      src={BRANDING.logoUrl}
      alt="Loan Star Lending Group"
      width={width}
      height={height}
      className={cn("logo-wordmark shrink-0", className)}
      style={{ height, width: "auto", background: "transparent" }}
      decoding="async"
    />
  );
}
