"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_TICK, CATEGORY_COLORS, CHART, TOOLTIP_STYLE } from "./theme";

type SeriesDef = { key: string; name: string; color: string };

type Datum = Record<string, string | number | null>;

const numberFormat = new Intl.NumberFormat("en-PH");

function formatValue(value: unknown): string {
  return typeof value === "number" ? numberFormat.format(value) : String(value ?? "");
}

const LEGEND_STYLE = { fontSize: 11, color: CHART.inkFaint };

/** Vertical bars, optionally stacked, with an optional line overlay. */
export function BarMini({
  data,
  xKey,
  bars,
  line,
  height = 140,
  stacked = false,
  showLegend = false,
}: {
  data: Datum[];
  xKey: string;
  bars: SeriesDef[];
  line?: SeriesDef;
  height?: number;
  stacked?: boolean;
  /** Opt-in — ships a legend for ≥2-series charts per the accessibility rule
   * that identity must never be color-alone. Off by default so existing
   * single-series usages are unaffected. */
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(v)} />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            stackId={stacked ? "stack" : undefined}
            radius={stacked ? undefined : [3, 3, 0, 0]}
            maxBarSize={26}
          />
        ))}
        {line ? (
          <Line
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Horizontal stacked bars — one row per category. */
export function HBarMini({
  data,
  yKey,
  bars,
  height = 140,
  showLegend = false,
}: {
  data: Datum[];
  yKey: string;
  bars: SeriesDef[];
  height?: number;
  /** Opt-in — ships a legend for ≥2-series charts. Off by default so
   * existing single-series usages are unaffected. */
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey={yKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={92}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(v)} />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            stackId="stack"
            maxBarSize={16}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars — one row, one value, optional per-row color and
 * a direct label on every bar. Use for ordered/severity scales (pass a
 * sequential ramp color per row) or ranked lists (pass one flat color —
 * color follows the entity, not its rank, so re-sorting never repaints). */
export function RankedBarMini({
  data,
  yKey,
  valueKey,
  color = CHART.gold,
  height = 140,
}: {
  data: Array<Datum & { color?: string }>;
  yKey: string;
  valueKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey={yKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(v)} />
        <Bar
          dataKey={valueKey}
          radius={[0, 3, 3, 0]}
          maxBarSize={18}
          label={{ position: "right", fontSize: 11, fill: CHART.ink, formatter: formatValue }}
        >
          {data.map((row) => (
            <Cell key={String(row[yKey])} fill={row.color ?? color} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Single- or multi-line trend chart. */
export function LineMini({
  data,
  xKey,
  lines,
  height = 140,
  showLegend = false,
}: {
  data: Datum[];
  xKey: string;
  lines: SeriesDef[];
  height?: number;
  /** Opt-in — ships a legend for ≥2-series charts. Off by default so
   * existing single-series usages are unaffected. */
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(v)} />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        {lines.map((line) => (
          <Line
            key={line.key}
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            type="monotone"
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Donut of named slices; colors default to the categorical palette. */
export function DonutMini({
  data,
  height = 140,
  showLegend = false,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
  height?: number;
  /** Opt-in — a donut's slices are categorical identity, which the
   * accessibility rule says must never be color-alone once there are ≥2. */
  showLegend?: boolean;
}) {
  const slices = data.filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(v)} />
        {showLegend ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {slices.map((slice, i) => (
            <Cell
              key={slice.name}
              fill={slice.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Tiny axis-less sparkline for KPI rows. */
export function SparkMini({
  data,
  dataKey,
  color = CHART.gold,
  height = 36,
}: {
  data: Datum[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          type="monotone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
