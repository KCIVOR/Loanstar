function AdminDashboardApp() {
  const [activeTab, setActiveTab] = React.useState('all');

  const kpis = [
    { label: 'Active Loans', value: '1,247', trend: '↑ +12%', up: true, change: 'vs last month' },
    { label: 'Disbursed (Jun)', value: '₱24.3M', trend: '↑ +8.3%', up: true, change: 'vs Jun 2025' },
    { label: 'Collection Rate', value: '94.2%', trend: '↑ +1.2pp', up: true, change: 'vs last month' },
    { label: 'Overdue Loans', value: '73', trend: '↓ −5', up: false, change: 'vs last month' },
  ];

  const donutData = [
    { label: 'Active', count: 856, color: '#1A56DB', pct: '68.6%' },
    { label: 'Pending', count: 218, color: '#D97706', pct: '17.5%' },
    { label: 'Overdue', count: 73, color: '#DC2626', pct: '5.8%' },
    { label: 'Closed', count: 100, color: '#CBD5E1', pct: '8.0%' },
  ];
  let cum = 0;
  const gradParts = donutData.map((d) => {
    const deg = (d.count / 1247) * 360;
    const part = `${d.color} ${cum.toFixed(1)}deg ${(cum + deg).toFixed(1)}deg`;
    cum += deg;
    return part;
  });

  const pipeline = [
    { stage: 'Intake & Verification', count: 48, role: 'CSA', color: '#1A56DB' },
    { stage: 'Credit Investigation', count: 32, role: 'CIG', color: '#0EA5E9' },
    { stage: 'Committee Review', count: 24, role: 'Committee', color: '#D97706' },
    { stage: 'Negotiation & Docs', count: 18, role: 'LRA', color: '#059669' },
    { stage: 'Briefing & Release', count: 12, role: 'LRA', color: '#8B5CF6' },
  ];

  const allApps = [
    { id: 'LN-2026-00248', name: 'Maria Santos', amount: '₱80,000', stage: 'Committee', date: 'Jun 15', status: 'pending' },
    { id: 'LN-2026-00247', name: 'Jose Reyes', amount: '₱150,000', stage: 'Release', date: 'Jun 15', status: 'approved' },
    { id: 'LN-2026-00246', name: 'Ana Garcia', amount: '₱50,000', stage: 'CIG', date: 'Jun 14', status: 'active' },
    { id: 'LN-2026-00245', name: 'Pedro Cruz', amount: '₱200,000', stage: 'Intake', date: 'Jun 14', status: 'pending' },
    { id: 'LN-2026-00244', name: 'Rosa Mendoza', amount: '₱75,000', stage: 'Monitoring', date: 'Jun 13', status: 'active' },
    { id: 'LN-2026-00241', name: 'Carlos Aquino', amount: '₱45,000', stage: 'CIG', date: 'Jun 11', status: 'overdue' },
  ];
  const statusCfg = { pending: ['#FFFBEB', '#D97706', 'Pending'], approved: ['#ECFDF5', '#059669', 'Approved'], active: ['#EFF6FF', '#1A56DB', 'Active'], overdue: ['#FEF2F2', '#DC2626', 'Overdue'] };
  const filtered = activeTab === 'all' ? allApps : allApps.filter((a) => a.status === activeTab);
  const avatarColors = ['#1A56DB', '#059669', '#D97706', '#8B5CF6', '#DC2626', '#0EA5E9'];

  const navDefs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'applications', label: 'Applications' },
    { id: 'active-loans', label: 'Active Loans' },
    { id: 'collections', label: 'Collections' },
    { id: 'borrowers', label: 'Borrowers' },
    { id: 'reports', label: 'Reports' },
    { id: 'overdue', label: 'Overdue', badge: '73' },
  ];
  const [activeNav, setActiveNav] = React.useState('dashboard');

  return (
    <div style={{ display: 'flex', height: 760, overflow: 'hidden', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", background: '#F8FAFC' }}>
      <aside style={{ width: 216, flexShrink: 0, background: '#fff', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#1A56DB,#1444B8)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z" fill="white"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>LoanStar</div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Admin Portal</div>
            </div>
          </div>
        </div>
        <nav style={{ padding: 10, flex: 1 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', padding: '6px 8px' }}>Main Menu</div>
          {navDefs.map((item) => {
            const active = activeNav === item.id;
            return (
              <div key={item.id} onClick={() => setActiveNav(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 5, cursor: 'pointer', background: active ? '#EFF6FF' : 'transparent' }}>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#1A56DB' : '#475569', flex: 1 }}>{item.label}</span>
                {item.badge && <span style={{ background: '#FEF2F2', color: '#DC2626', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9 }}>{item.badge}</span>}
              </div>
            );
          })}
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1A56DB,#0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>M</div>
          <div><div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>Maria Santos</div><div style={{ fontSize: 11, color: '#94A3B8' }}>Branch Manager</div></div>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <header style={{ height: 58, background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 40, padding: '0 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Dashboard</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>June 16, 2026 · Good morning, Maria</div>
          </div>
          <input placeholder="Search loans, borrowers…" style={{ width: 200, height: 34, padding: '0 12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 4, fontSize: 13 }} />
        </header>

        <div style={{ padding: '22px 26px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>{k.value}</div>
                <span style={{ background: k.up ? '#ECFDF5' : '#FEF2F2', color: k.up ? '#059669' : '#DC2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>{k.trend}</span>
                <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>{k.change}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Loan Status Mix</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>1,247 total loans</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${gradParts.join(', ')})`, flexShrink: 0, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 24, background: '#fff', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>1,247</div>
                    <div style={{ fontSize: 9, color: '#94A3B8' }}>Total</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {donutData.map((d) => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{d.label}</div><div style={{ fontSize: 10, color: '#94A3B8' }}>{d.pct}</div></div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{d.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Active Pipeline</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 18 }}>Applications currently in processing stages</div>
              {pipeline.map((row) => (
                <div key={row.stage} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{row.stage}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '2px 7px', borderRadius: 3, fontWeight: 600 }}>{row.role}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', minWidth: 24, textAlign: 'right' }}>{row.count}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((row.count / 60) * 100)}%`, background: row.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Recent Applications</div>
              <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', padding: 3, borderRadius: 5 }}>
                {['all', 'pending', 'active', 'overdue'].map((t) => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', background: activeTab === t ? '#fff' : 'transparent', color: activeTab === t ? '#0F172A' : '#64748B' }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 100px 80px 90px', padding: '8px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Loan ID', 'Borrower', 'Amount', 'Stage', 'Date', 'Status'].map((h) => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
              ))}
            </div>
            {filtered.map((row, i) => {
              const [bg, color, label] = statusCfg[row.status];
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 100px 80px 90px', padding: '11px 18px', borderBottom: '1px solid #F8FAFC', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', fontFamily: 'var(--font-mono)' }}>{row.id}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColors[i % avatarColors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{row.name.split(' ').map((w) => w[0]).join('')}</div>
                    <span style={{ fontSize: 13, color: '#334155' }}>{row.name}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{row.amount}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{row.stage}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{row.date}</div>
                  <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 3, width: 'fit-content' }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
window.AdminDashboardApp = AdminDashboardApp;
