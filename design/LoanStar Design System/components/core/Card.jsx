import React from 'react';

export function Card({ children, variant = 'base', style, ...props }) {
  const base = {
    borderRadius: 'var(--radius-md)',
    padding: 24,
    fontFamily: 'var(--font-body)',
  };
  const variants = {
    base:      { background: 'var(--color-neutral-0)', border: '1px solid var(--color-neutral-200)', boxShadow: 'var(--shadow-sm)' },
    highlight: { background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderLeft: '4px solid var(--color-primary-600)' },
    warning:   { background: 'var(--color-warning-50)', border: '1px solid var(--color-warning-200)', borderLeft: '4px solid var(--color-warning-600)' },
    danger:    { background: 'var(--color-danger-50)', border: '1px solid var(--color-danger-200)', borderLeft: '4px solid var(--color-danger-600)' },
    gradient:  { background: 'linear-gradient(135deg,#1E3A8A 0%,#1A56DB 100%)', color: '#fff' },
  };
  return (
    <div style={{ ...base, ...(variants[variant] || variants.base), ...style }} {...props}>
      {children}
    </div>
  );
}

/** Small KPI/stat card: label + big number + trend badge. */
export function StatCard({ label, value, trend, trendPositive = true, sub }) {
  return (
    <Card>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-neutral-900)', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', marginBottom: 10, lineHeight: 1 }}>{value}</div>
      {(trend || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trend && (
            <span style={{
              background: trendPositive ? 'var(--color-success-50)' : 'var(--color-danger-50)',
              color: trendPositive ? 'var(--color-success-600)' : 'var(--color-danger-600)',
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-xs)',
            }}>{trend}</span>
          )}
          {sub && <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{sub}</span>}
        </div>
      )}
    </Card>
  );
}
