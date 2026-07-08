import React from 'react';

/** Generic branded sidebar used across all staff/admin/borrower portals (width varies 224–248px in the real screens). */
export function Sidebar({ items, activeId, onNavigate, footer, subtitle = 'My Account', width = 228 }) {
  return (
    <aside style={{ width, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--color-neutral-200)', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', fontFamily: 'var(--font-body)' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--color-neutral-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#1A56DB,#1444B8)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z" fill="white"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-neutral-900)', letterSpacing: '-0.4px' }}>LoanStar</div>
            <div style={{ fontSize: 10, color: 'var(--color-neutral-400)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{subtitle}</div>
          </div>
        </div>
      </div>
      <nav style={{ padding: 10, flex: 1 }}>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <div key={item.id} onClick={() => onNavigate?.(item)} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
              background: active ? 'var(--color-primary-50)' : 'transparent', marginBottom: 1,
            }}>
              {item.icon && <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d={item.icon} stroke={active ? 'var(--color-primary-600)' : 'var(--color-neutral-600)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--color-primary-600)' : 'var(--color-neutral-600)' }}>{item.label}</span>
            </div>
          );
        })}
      </nav>
      {footer && <div style={{ padding: '14px 16px', borderTop: '1px solid var(--color-neutral-100)', flexShrink: 0 }}>{footer}</div>}
    </aside>
  );
}

/** Sticky top bar: title/subtitle left, actions (search, notification bell, CTA) right. */
export function TopBar({ title, subtitle, actions }) {
  return (
    <header style={{ height: 60, background: '#fff', borderBottom: '1px solid var(--color-neutral-200)', position: 'sticky', top: 0, zIndex: 40, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-body)' }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-neutral-900)', letterSpacing: '-0.3px' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>}
    </header>
  );
}

/** Page-level header used inside content areas: back arrow (optional) + title + description + actions. */
export function PageHeader({ title, description, actions, onBack }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
      <div>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-500)', fontSize: 13, fontWeight: 500, marginBottom: 8, padding: 0 }}>← Back</button>
        )}
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--color-neutral-900)', margin: 0 }}>{title}</h1>
        {description && <p style={{ marginTop: 4, fontSize: 14, color: 'var(--color-neutral-500)' }}>{description}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  );
}
