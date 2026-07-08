import React from 'react';

/** Clickable circle+label stepper used on the Loan Application flow header. */
export function Stepper({ steps, currentIndex, onStepClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', fontFamily: 'var(--font-body)' }}>
      {steps.map((label, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={label} onClick={() => onStepClick?.(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 90, position: 'relative', cursor: onStepClick ? 'pointer' : 'default' }}>
            {i > 0 && <div style={{ position: 'absolute', top: 17, left: 0, width: '50%', height: 2, background: (done || active) ? 'var(--color-primary-600)' : 'var(--color-neutral-200)' }} />}
            {i < steps.length - 1 && <div style={{ position: 'absolute', top: 17, left: '50%', right: 0, height: 2, background: done ? 'var(--color-primary-600)' : 'var(--color-neutral-200)' }} />}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', zIndex: 1,
              background: done ? 'var(--color-primary-600)' : active ? '#fff' : 'var(--color-neutral-50)',
              border: `2px solid ${(done || active) ? 'var(--color-primary-600)' : 'var(--color-neutral-200)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: active ? '0 0 0 4px rgba(26,86,219,0.15)' : 'none',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: done ? '#fff' : active ? 'var(--color-primary-600)' : 'var(--color-neutral-300)' }}>{done ? '✓' : i + 1}</span>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, fontWeight: active ? 700 : done ? 600 : 400, color: active ? 'var(--color-neutral-900)' : done ? 'var(--color-neutral-700)' : 'var(--color-neutral-300)', maxWidth: 100 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Amortization schedule table with per-row status tinting. */
export function AmortizationTable({ rows }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 110px 110px 110px 90px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-neutral-200)', padding: '10px 16px' }}>
        {['#', 'Due Date', 'Principal', 'Interest', 'Payment', 'Status'].map((h, i) => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</div>
        ))}
      </div>
      {rows.map((r) => {
        const bg = r.status === 'paid' ? '#FAFFFE' : r.status === 'due' ? '#FFFBEB' : '#fff';
        const badge = r.status === 'paid'
          ? { bg: 'var(--color-success-50)', color: 'var(--color-success-600)' }
          : r.status === 'due'
          ? { bg: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }
          : { bg: 'var(--color-neutral-100)', color: 'var(--color-neutral-500)' };
        return (
          <div key={r.num} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 110px 110px 110px 90px', padding: '11px 16px', borderBottom: '1px solid var(--color-neutral-50)', alignItems: 'center', background: bg }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-400)', fontVariantNumeric: 'tabular-nums' }}>{r.num}</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>{r.dueDate}</div>
            <div style={{ fontSize: 13, textAlign: 'right', color: 'var(--color-neutral-700)', fontVariantNumeric: 'tabular-nums' }}>{r.principal}</div>
            <div style={{ fontSize: 13, textAlign: 'right', color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>{r.interest}</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--color-neutral-700)', fontVariantNumeric: 'tabular-nums' }}>{r.payment}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 3, textTransform: 'capitalize' }}>{r.status}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
