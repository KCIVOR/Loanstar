import React from 'react';
import { Modal } from '../feedback/Modal.jsx';

/** Sign-a-document card + confirmation modal. Restyled equivalent of the real SignatureConfirm.tsx. */
export function SignatureConfirm({ docName, docType, onSign, signed = false, signedAt }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  if (signed) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--color-success-200)', borderLeft: '4px solid var(--color-success-600)', borderRadius: 'var(--radius-md)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--color-success-600)' }}>
          <span>✓</span> Signed on {signedAt}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-neutral-200)', borderLeft: '4px solid var(--color-primary-600)', borderRadius: 'var(--radius-md)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-900)' }}>{docName}</div>
        {docType && <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--color-primary-50)', color: 'var(--color-primary-600)', padding: '2px 8px', borderRadius: 3 }}>{docType}</span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-neutral-500)', marginBottom: 16 }}>By confirming, you acknowledge you have reviewed this document in full.</div>
      <button onClick={() => setConfirmOpen(true)} style={{ width: '100%', height: 44, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        I have reviewed this document — Sign &amp; Confirm
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Confirm signature`} footer={
        <>
          <button onClick={() => setConfirmOpen(false)} style={{ flex: 1, height: 40, background: '#fff', border: '1px solid var(--color-neutral-200)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { setConfirmOpen(false); onSign?.(); }} style={{ flex: 1, height: 40, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>Yes, sign document</button>
        </>
      }>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>Confirm signature on: <strong>{docName}</strong>. This cannot be undone.</div>
      </Modal>
    </div>
  );
}
