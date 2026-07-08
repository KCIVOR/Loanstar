import React from 'react';

const VARIANTS = {
  primary:   { bg: 'var(--color-primary-600)', hoverBg: 'var(--color-primary-700)', color: '#fff', border: 'none' },
  secondary: { bg: 'var(--color-primary-50)',  hoverBg: 'var(--color-primary-100)', color: 'var(--color-primary-600)', border: 'none' },
  outline:   { bg: 'transparent', hoverBg: 'var(--color-primary-50)', color: 'var(--color-primary-600)', border: '1.5px solid var(--color-primary-600)' },
  ghost:     { bg: 'transparent', hoverBg: 'var(--color-neutral-100)', color: 'var(--color-neutral-500)', border: 'none' },
  danger:    { bg: 'var(--color-danger-600)',  hoverBg: 'var(--color-danger-700)', color: '#fff', border: 'none' },
  success:   { bg: 'var(--color-success-600)', hoverBg: 'var(--color-success-700)', color: '#fff', border: 'none' },
};

const SIZES = {
  sm: { height: 32, padding: '0 14px', fontSize: 12 },
  md: { height: 40, padding: '0 20px', fontSize: 14 },
  lg: { height: 48, padding: '0 28px', fontSize: 15 },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...props
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const [hover, setHover] = React.useState(false);
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: s.height,
        padding: s.padding,
        width: fullWidth ? '100%' : undefined,
        background: isDisabled ? 'var(--color-neutral-100)' : (hover ? v.hoverBg : v.bg),
        color: isDisabled ? 'var(--color-neutral-300)' : v.color,
        border: v.border,
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-body)',
        fontSize: s.fontSize,
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'background 150ms',
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'currentColor',
          animation: 'ls-spin 0.8s linear infinite', flexShrink: 0,
        }} />
      )}
      {children}
      <style>{'@keyframes ls-spin{to{transform:rotate(360deg)}}'}</style>
    </button>
  );
}
