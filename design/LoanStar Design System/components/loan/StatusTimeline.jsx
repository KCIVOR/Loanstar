import React from 'react';

/** Horizontal (desktop) status stepper — past/current/future/denied states. Mirrors the real
 * StatusTimeline.tsx component's role (borrower application progress) restyled to the brand. */
export function StatusTimeline({ steps, currentIndex, denied = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', fontFamily: 'var(--font-body)' }}>
      {steps.map((label, i) => {
        const past = i < currentIndex;
        const current = i === currentIndex;
        const isDenied = denied && current;
        const circleBg = isDenied ? 'var(--color-danger-600)' : past ? 'var(--color-neutral-900)' : current ? '#fff' : 'var(--color-neutral-100)';
        const circleBorder = isDenied ? 'var(--color-danger-600)' : (past || current) ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)';
        const circleColor = isDenied || past ? '#fff' : current ? 'var(--color-primary-600)' : 'var(--color-neutral-400)';
        const labelColor = isDenied ? 'var(--color-danger-700)' : past ? 'var(--color-neutral-700)' : current ? 'var(--color-primary-700)' : 'var(--color-neutral-400)';
        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 80, position: 'relative' }}>
            {i > 0 && <div style={{ position: 'absolute', top: 13, left: 0, width: '50%', height: 2, background: (past || current) ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)' }} />}
            {i < steps.length - 1 && <div style={{ position: 'absolute', top: 13, left: '50%', right: 0, height: 2, background: past ? 'var(--color-neutral-900)' : 'var(--color-neutral-200)' }} />}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: circleBg, border: `2px solid ${circleBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
              boxShadow: current && !isDenied ? '0 0 0 3px rgba(26,86,219,0.15)' : 'none',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: circleColor }}>{isDenied ? '✕' : past ? '✓' : i + 1}</span>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, padding: '0 4px', fontSize: 11, fontWeight: current ? 700 : 500, color: labelColor, lineHeight: 1.3, maxWidth: 90 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}
