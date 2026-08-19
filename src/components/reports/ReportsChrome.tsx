"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card, Input, SegmentedControl } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { AssistantSpacer } from "@/components/reports/assistant/AssistantSpacer";
import type { Period } from "@/lib/reports/metrics/types";
import { PERIOD_PRESETS, presetPeriod, type PeriodPreset } from "@/lib/reports/period";
import { REPORT_TABS, isReportTabActive } from "@/lib/reports/tabs";

type CustomPreset = "custom";

function matchPreset(period: Period): PeriodPreset | CustomPreset {
  for (const p of PERIOD_PRESETS) {
    const computed = presetPeriod(p.id);
    if (computed.from === period.from && computed.to === period.to) return p.id;
  }
  return "custom";
}

function periodFromSearch(from: string | null, to: string | null): Period {
  if (from && to) return { from, to };
  return presetPeriod("mtd");
}

export function ReportsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");
  const period = useMemo(() => periodFromSearch(urlFrom, urlTo), [urlFrom, urlTo]);

  const [preset, setPreset] = useState<PeriodPreset | CustomPreset>(() =>
    urlFrom && urlTo ? matchPreset({ from: urlFrom, to: urlTo }) : "mtd",
  );

  useEffect(() => {
    if (!urlFrom || !urlTo) {
      setPreset("mtd");
      return;
    }
    setPreset(matchPreset({ from: urlFrom, to: urlTo }));
  }, [urlFrom, urlTo]);

  function replacePeriod(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onPresetChange(next: PeriodPreset | CustomPreset) {
    setPreset(next);
    if (next === "custom") return;
    const nextPeriod = presetPeriod(next);
    replacePeriod(nextPeriod.from, nextPeriod.to);
  }

  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">
      <Card className="no-print mb-6 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-ink-500">Period</span>
          <div className="min-w-0 max-w-full overflow-x-auto">
            <SegmentedControl
              value={preset}
              onChange={onPresetChange}
              options={[
                ...PERIOD_PRESETS.map((p) => ({ value: p.id as PeriodPreset | CustomPreset, label: p.label })),
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>
          {preset === "custom" ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={period.from}
                onChange={(e) => replacePeriod(e.target.value, period.to)}
                style={{ width: 150, height: 34 }}
              />
              <span className="text-xs text-ink-400">to</span>
              <Input
                type="date"
                value={period.to}
                onChange={(e) => replacePeriod(period.from, e.target.value)}
                style={{ width: 150, height: 34 }}
              />
            </div>
          ) : null}
          <span className="mono text-xs text-ink-400">
            {period.from} → {period.to}
          </span>
        </div>
      </Card>

      <nav className="no-print mb-6 overflow-x-auto" aria-label="Report sections">
        <div className="flex items-center gap-4 border-b border-line-soft">
          {REPORT_TABS.map((tab) => {
            const active = isReportTabActive(pathname, tab);
            const params = new URLSearchParams();
            params.set("from", period.from);
            params.set("to", period.to);
            return (
              <Link
                key={tab.href}
                href={`${tab.href}?${params.toString()}`}
                className={cn(
                  "flex shrink-0 items-center border-b-2 py-2 text-[12.5px] font-semibold transition-colors",
                  active
                    ? "border-teal-600 text-ink-900"
                    : "border-transparent text-ink-400 hover:text-ink-700",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
      </div>
      <AssistantSpacer />
    </div>
  );
}
