import React from 'react';

const STATUS_MAP = {
  registered:   { bg: 'var(--color-neutral-100)', color: 'var(--color-neutral-500)' },
  pending:      { bg: 'var(--color-warning-50)', color: 'var(--color-warning-600)' },
  submitted:    { bg: 'var(--color-info-50)', color: 'var(--color-info-600)' },
  approved:     { bg: 'var(--color-success-50)', color: 'var(--color-success-600)' },
  active:       { bg: 'var(--color-primary-50)', color: 'var(--color-primary-600)' },
  denied:       { bg: 'var(--color-danger-50)', color: 'var(--color-danger-600)' },
  overdue:      { bg: '#FFF7ED', color: '#EA580C' },
  closed:       { bg: 'var(--color-neutral-50)', color: 'var(--color-neutral-500)' },
};

export function Badge({ children, status = 'active', dot = true, style }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color,
      padding: '5px 11px', borderRadius: 'var(--radius-sm)',
      fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
      fontFamily: 'var(--font-body)',
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />}
      {children}
    </span>
  );
}
