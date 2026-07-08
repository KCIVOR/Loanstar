Async/empty/confirmation states: modal dialog, toast notification, progress bar, empty state, shimmer skeleton.

```jsx
<Modal open={open} onClose={close} title="Confirm Payment" footer={<><Button variant="ghost">Cancel</Button><Button>Confirm</Button></>}>…</Modal>
<Toast message="Payment of ₱7,540.50 confirmed" />
<ProgressBar label="Loan Repaid" value={49352} total={150000} />
<EmptyState title="No transactions yet" description="Your payment history will appear here." />
<Skeleton height={13} width="75%" />
```

Modal: fade+scale 200ms open, focus trap + Escape in production. Toast: dark for success/neutral, white+warning-border for warnings; auto-dismiss ~5s. Skeleton: prefer over spinners for lists/cards.
