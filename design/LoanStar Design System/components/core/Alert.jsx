import React from 'react';

const VARIANTS = {
  success: { bg: 'var(--color-success-50)', border: 'var(--color-success-200)', title: 'var(--color-success-text-strong)', text: 'var(--color-success-700)' },
  warning: { bg: 'var(--color-warning-50)', border: 'var(--color-warning-200)', title: 'var(--color-warning-text-strong)', text: 'var(--color-warning-700)' },
  error:   { bg: 'var(--color-danger-50)', border: 'var(--color-danger-200)', title: 'var(--color-danger-text-strong)', text: 'var(--color-danger-600)' },
  info:    { bg: 'var(--color-info-50)', border: 'var(--color-info-200)', title: 'var(--color-info-text-strong)', text: 'var(--color-info-700)' },
};

export function Alert({ variant = 'info', title, children }) {
  const v = VARIANTS[variant] || VARIANTS.info;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: v.bg, border: `1px solid ${v.border}`, borderRadius: 'var(--radius-md)',
      padding: '14px 16px', fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.title, marginTop: 5, flexShrink: 0 }} />
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: v.title, marginBottom: 2 }}>{title}</div>}
        <div style={{ fontSize: 13, color: v.text, lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}
