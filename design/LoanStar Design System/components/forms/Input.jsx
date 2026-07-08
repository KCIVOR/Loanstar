import React from 'react';

export function Input({ label, required, error, helper, prefix, style, inputStyle, ...props }) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? 'var(--color-danger-600)' : (focused ? 'var(--color-primary-600)' : 'var(--color-neutral-300)');
  return (
    <div style={style}>
      {label && (
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-700)', marginBottom: 6 }}>
          {label} {required && <span style={{ color: 'var(--color-danger-600)' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {prefix && (
          <div style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-500)', pointerEvents: 'none' }}>{prefix}</div>
        )}
        <input
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          style={{
            width: '100%', height: 40, padding: prefix ? '0 14px 0 30px' : '0 14px',
            background: error ? 'var(--color-danger-50)' : '#fff',
            border: `1.5px solid ${borderColor}`, borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-neutral-900)',
            outline: 'none', boxShadow: focused ? '0 0 0 3px rgba(47,85,180,0.12)' : 'none',
            ...inputStyle,
          }}
          {...props}
        />
      </div>
      {error ? (
        <div style={{ fontSize: 12, color: 'var(--color-danger-600)', fontWeight: 500, marginTop: 5 }}>{error}</div>
      ) : helper ? (
        <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginTop: 5 }}>{helper}</div>
      ) : null}
    </div>
  );
}

export function Select({ label, children, style, ...props }) {
  return (
    <div style={style}>
      {label && <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-700)', marginBottom: 6 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <select style={{
          width: '100%', height: 40, padding: '0 40px 0 14px', background: '#fff',
          border: '1.5px solid var(--color-neutral-300)', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-neutral-900)',
          outline: 'none', appearance: 'none', cursor: 'pointer',
        }} {...props}>
          {children}
        </select>
        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-neutral-500)' }}>▾</div>
      </div>
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <div onClick={() => !disabled && onChange?.(!checked)} style={{
        width: 18, height: 18, borderRadius: 3, flexShrink: 0, marginTop: 1,
        background: checked ? 'var(--color-primary-600)' : '#fff',
        border: checked ? 'none' : '1.5px solid var(--color-neutral-300)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.55 }}>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      {(label || sub) && (
        <div>
          {label && <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-700)' }}>{label}</div>}
          {sub && <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{sub}</div>}
        </div>
      )}
      <div onClick={() => onChange?.(!checked)} style={{
        width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--color-primary-600)' : 'var(--color-neutral-200)', transition: 'background 150ms',
      }}>
        <div style={{
          width: 18, height: 18, background: '#fff', borderRadius: '50%', position: 'absolute',
          top: 3, left: checked ? 23 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 150ms',
        }} />
      </div>
    </div>
  );
}
