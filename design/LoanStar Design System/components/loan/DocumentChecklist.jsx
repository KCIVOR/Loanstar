import React from 'react';

/** Per-document upload/verify row list. Restyled equivalent of the real DocumentChecklist.tsx
 * (borrower + agent + CSA/CIG views all read the same checklist shape). */
export function DocumentChecklist({ documents, flagsOnly = false, onUpload }) {
  if (flagsOnly) {
    const complete = documents.every((d) => d.status === 'confirmed' || d.status === 'uploaded');
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-sm)',
        fontSize: 12, fontWeight: 700,
        background: complete ? 'var(--color-success-50)' : 'var(--color-warning-50)',
        color: complete ? 'var(--color-success-600)' : 'var(--color-warning-600)',
      }}>{complete ? 'Complete' : 'Incomplete'}</span>
    );
  }
  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {documents.map((doc, i) => (
        <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < documents.length - 1 ? '1px solid var(--color-neutral-100)' : 'none' }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: doc.status === 'pending' ? 'var(--color-neutral-100)' : 'var(--color-success-50)',
          }}>
            {doc.status !== 'pending' && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="var(--color-success-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-700)' }}>{doc.name}</div>
            {doc.filename && <div style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{doc.filename}</div>}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
            color: doc.status === 'pending' ? 'var(--color-neutral-400)' : doc.status === 'confirmed' ? 'var(--color-success-600)' : 'var(--color-primary-600)',
          }}>{doc.status}</span>
          <button onClick={() => onUpload?.(doc)} style={{
            height: 30, padding: '0 12px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: doc.status === 'pending' ? 'var(--color-primary-50)' : 'var(--color-neutral-100)',
            color: doc.status === 'pending' ? 'var(--color-primary-600)' : 'var(--color-neutral-500)',
          }}>{doc.status === 'pending' ? 'Upload' : 'Replace'}</button>
        </div>
      ))}
    </div>
  );
}
