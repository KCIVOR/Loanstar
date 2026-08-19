import { Badge } from "@/components/ui";
import { segmentBadgeVariant, segmentLabel } from "@/lib/reports/segments";

export function SegmentBadge({ segment }: { segment: string | null | undefined }) {
  if (
    segment !== "sme" &&
    segment !== "seafarer" &&
    segment !== "individual" &&
    segment !== "mixed"
  ) {
    return <span className="text-ink-400">—</span>;
  }
  return (
    <Badge variant={segmentBadgeVariant(segment)} dot={segment !== "mixed"}>
      {segmentLabel(segment)}
    </Badge>
  );
}
