import React from 'react';

export function Modal({ open, onClose, title, children, footer, width = 420 }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 'var(--radius-md)', width, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-neutral-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' }}>{title}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, background: 'var(--color-neutral-50)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 18, color: 'var(--color-neutral-400)' }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-neutral-100)', display: 'flex', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ message, variant = 'default' }) {
  const dark = variant === 'default';
  const dot = variant === 'warning' ? 'var(--color-warning-600)' : 'var(--color-success-600)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: dark ? 'var(--color-neutral-900)' : '#fff',
      color: dark ? '#fff' : 'var(--color-neutral-700)',
      border: dark ? 'none' : '1px solid var(--color-warning-200)',
      padding: '11px 14px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', minWidth: 280,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{message}</span>
      <span style={{ fontSize: 16, color: dark ? 'var(--color-neutral-500)' : 'var(--color-neutral-400)', cursor: 'pointer', lineHeight: 1 }}>×</span>
    </div>
  );
}

export function ProgressBar({ label, value, total, color = 'var(--color-primary-600)' }) {
  const pct = total ? Math.round((value / total) * 100) : value;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-neutral-700)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-900)' }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--color-neutral-100)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)', padding: '36px 20px', textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, background: 'var(--color-neutral-100)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="3" y="5" width="20" height="16" rx="2" stroke="#CBD5E1" strokeWidth="1.8"/><path d="M8 11h10M8 15h6" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-700)', marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: 'var(--color-neutral-400)', lineHeight: 1.6, marginBottom: 20, maxWidth: 260, marginLeft: 'auto', marginRight: 'auto' }}>{description}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 13 }) {
  return (
    <div style={{
      width, height, borderRadius: 3,
      background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EEF4 50%,#F1F5F9 75%)',
      backgroundSize: '400px 100%', animation: 'ls-shimmer 1.5s infinite',
    }}>
      <style>{'@keyframes ls-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}'}</style>
    </div>
  );
}
