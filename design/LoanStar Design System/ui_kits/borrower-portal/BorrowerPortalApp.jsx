function BorrowerPortalApp() {
  const [activeNav, setActiveNav] = React.useState('dashboard');
  const [showPayModal, setShowPayModal] = React.useState(false);
  const [payLoading, setPayLoading] = React.useState(false);

  const navDefs = [
    { id: 'dashboard', label: 'Dashboard', icon: 'M1.5 1.5h4v4h-4v-4zM8.5 1.5h4v4h-4v-4zM1.5 8.5h4v4h-4v-4zM8.5 8.5h4v4h-4v-4z' },
    { id: 'my-loan', label: 'My Loan', icon: 'M1 3.5h12v7a1 1 0 01-1 1H2a1 1 0 01-1-1V3.5zM1 6.5h12' },
    { id: 'payments', label: 'Payments', icon: 'M2 11.5V8M5 11.5V5M8 11.5V7M11 11.5V3' },
    { id: 'documents', label: 'Documents', icon: 'M3 2.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1zM9 2.5v3h3' },
    { id: 'apply', label: 'Apply for Loan', icon: 'M7 1.5v11M1.5 7h11' },
    { id: 'support', label: 'Support', icon: 'M7 5.5a2 2 0 100 4 2 2 0 000-4zM2.5 12c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4' },
  ];

  const stageData = [
    { label: 'Intake & Verification', sub: 'Documents received · Jun 10', done: true },
    { label: 'Credit Investigation', sub: 'CIG visit completed · Jun 12', done: true },
    { label: 'Committee Review', sub: 'Approved · Jun 13', done: true },
    { label: 'Negotiation & Docs', sub: 'Terms signed · Jun 14', done: true },
    { label: 'Briefing & Release', sub: 'Funds released · Jun 15', done: true },
    { label: 'Monitoring & Collection', sub: 'Active · payments on track', done: false, active: true },
  ];

  const schedule = [
    { num: '07', due: 'Jul 15, 2026', amount: '₱7,540.50', status: 'Due', warn: true },
    { num: '08', due: 'Aug 15, 2026', amount: '₱7,540.50', status: 'Upcoming' },
    { num: '09', due: 'Sep 15, 2026', amount: '₱7,540.50', status: 'Upcoming' },
    { num: '10', due: 'Oct 15, 2026', amount: '₱7,540.50', status: 'Upcoming', dim: true },
    { num: '11', due: 'Nov 15, 2026', amount: '₱7,540.50', status: 'Upcoming', dim: true },
  ];

  return (
    <div style={{ display: 'flex', height: 680, overflow: 'hidden', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", background: '#F8FAFC' }}>
      {/* SIDEBAR */}
      <aside style={{ width: 224, flexShrink: 0, background: '#fff', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#1A56DB,#1444B8)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z" fill="white"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px' }}>LoanStar</div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>My Account</div>
            </div>
          </div>
        </div>
        <nav style={{ padding: 10, flex: 1 }}>
          {navDefs.map((item) => {
            const active = activeNav === item.id;
            return (
              <div key={item.id} onClick={() => setActiveNav(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 5, cursor: 'pointer', background: active ? '#EFF6FF' : 'transparent', marginBottom: 1 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d={item.icon} stroke={active ? '#1A56DB' : '#475569'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#1A56DB' : '#475569' }}>{item.label}</span>
              </div>
            );
          })}
        </nav>
        <div style={{ padding: '14px 16px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#1A56DB,#60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>J</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Juan dela Cruz</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Borrower</div>
            </div>
          </div>
          <div style={{ background: '#ECFDF5', borderRadius: 4, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, background: '#059669', borderRadius: '50%' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#065F46' }}>Good Standing</span>
            <span style={{ fontSize: 10, color: '#6EE7B7', marginLeft: 'auto' }}>Credit Score 742</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <header style={{ height: 60, background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 40, padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Good morning, Juan 👋</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>June 16, 2026 · Loan LN-2026-00142</div>
          </div>
          <button style={{ height: 36, padding: '0 16px', background: '#1A56DB', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Apply New Loan</button>
        </header>

        <div style={{ padding: '24px 28px' }}>
          {/* HERO */}
          <div style={{ background: 'linear-gradient(135deg,#1E3A8A 0%,#1A56DB 55%,#2563EB 100%)', borderRadius: 8, padding: '26px 28px', marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>Outstanding Balance</div>
                <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: '-1.4px', fontVariantNumeric: 'tabular-nums' }}>₱ 120,648</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>16 installments remaining · LN-2026-00142</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '10px 16px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4, textTransform: 'uppercase' }}>Next Payment</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>₱7,540.50</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Due July 15, 2026</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 18 }}>
              {[['Principal', '₱150,000'], ['Interest Rate', '1.5% / mo'], ['Total Paid', '₱49,352'], ['Maturity', 'Nov 2027']].map(([l, v]) => (
                <div key={l}><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div><div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* ALERT + QUICK ACTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, background: '#FEF3C7', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="11" rx="2" stroke="#D97706" strokeWidth="1.5"/><path d="M5 2v4M13 2v4M2 8h14" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Payment Due in 29 Days</div>
                  <div style={{ fontSize: 12, color: '#B45309' }}>July 15, 2026 · Installment #9 of 24</div>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#92400E', fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>₱ 7,540.50</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPayModal(true)} style={{ flex: 1, height: 38, background: '#D97706', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Pay Now</button>
                <button style={{ height: 38, padding: '0 14px', background: 'transparent', color: '#B45309', border: '1.5px solid #FCD34D', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Schedule</button>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Quick Actions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['View Schedule', 'New Loan', 'Documents', 'Support'].map((label) => (
                  <button key={label} style={{ height: 48, background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#334155' }}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* PROGRESS + SCHEDULE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Loan Progress</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>₱49,352 paid of ₱150,000 (32.9%)</div>
              <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '32.9%', background: 'linear-gradient(90deg,#1A56DB,#60A5FA)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Application Stages</div>
              {stageData.map((s, i) => (
                <div key={s.label} style={{ display: 'flex', gap: 12, paddingBottom: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: s.done ? '#1A56DB' : s.active ? '#fff' : '#F8FAFC', border: `2px solid ${s.done || s.active ? '#1A56DB' : '#E2E8F0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: s.done ? '#fff' : '#1A56DB' }}>{s.done ? '✓' : '●'}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: s.active ? 700 : 600, color: s.active ? '#0F172A' : '#334155' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: s.active ? '#1A56DB' : '#94A3B8' }}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Upcoming Payments</div>
                <span style={{ fontSize: 12, color: '#1A56DB', fontWeight: 600, cursor: 'pointer' }}>View all →</span>
              </div>
              {schedule.map((row) => (
                <div key={row.num} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 80px', padding: '11px 18px', borderBottom: '1px solid #F8FAFC', alignItems: 'center', background: row.warn ? '#FFFCF5' : '#fff' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#CBD5E1' }}>{row.num}</div>
                  <div style={{ fontSize: 13, fontWeight: row.warn ? 700 : 400, color: row.warn ? '#D97706' : row.dim ? '#94A3B8' : '#334155' }}>{row.due}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: row.warn ? '#D97706' : '#334155' }}>{row.amount}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}><span style={{ background: row.warn ? '#FFFBEB' : '#F1F5F9', color: row.warn ? '#D97706' : '#64748B', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 3 }}>{row.status}</span></div>
                </div>
              ))}
              <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>+ 13 more installments</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Total: ₱ 120,648</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showPayModal && (
        <div onClick={() => setShowPayModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: 400, boxShadow: '0 24px 48px rgba(15,23,42,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Confirm Payment</div>
              <button onClick={() => setShowPayModal(false)} style={{ background: '#F8FAFC', border: 'none', borderRadius: 4, width: 28, height: 28, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 6, padding: 14, marginBottom: 18, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: '#64748B' }}>Installment</span><span style={{ fontWeight: 600 }}>#9 of 24</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #E2E8F0' }}><span style={{ fontWeight: 600 }}>Total</span><span style={{ fontWeight: 700, fontSize: 15 }}>₱7,540.50</span></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPayModal(false)} style={{ flex: 1, height: 40, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { setPayLoading(true); setTimeout(() => { setPayLoading(false); setShowPayModal(false); }, 1200); }} style={{ flex: 2, height: 40, background: '#1A56DB', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>{payLoading ? 'Processing…' : 'Confirm Payment'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.BorrowerPortalApp = BorrowerPortalApp;
