function StaffOperationsApp() {
  const roles = [
    { id: 'csa', label: 'CSA', stage: 'Intake & Verification' },
    { id: 'cig', label: 'CIG', stage: 'Credit Investigation' },
    { id: 'committee', label: 'Committee', stage: 'Committee Review' },
    { id: 'lra', label: 'LRA', stage: 'Negotiation' },
    { id: 'collection', label: 'Collection', stage: 'Monitoring' },
  ];
  const allApps = {
    csa: [
      { id: 'LN-2026-00248', name: 'Maria Santos', amount: '₱80,000', status: 'pending', purpose: 'Business', date: 'Jun 15', term: '18 months',
        info: [['Date of Birth', 'Mar 12, 1985'], ['Address', '123 Rizal St, Manila'], ['Employment', 'Business Owner'], ['Monthly Income', '₱45,000']],
        docs: [['Valid Gov ID', 'Submitted', true], ['Income Tax Return', 'Submitted', true], ['Utility Bill', 'Missing', false]] },
      { id: 'LN-2026-00245', name: 'Pedro Cruz', amount: '₱200,000', status: 'pending', purpose: 'Real Estate', date: 'Jun 14', term: '36 months',
        info: [['Date of Birth', 'Jul 8, 1978'], ['Address', '456 Mabini Ave, QC'], ['Employment', 'Self-employed'], ['Monthly Income', '₱80,000']],
        docs: [['Valid Gov ID', 'Submitted', true], ['Income Tax Return', 'Missing', false], ['Bank Statements', 'Missing', false]] },
    ],
    cig: [
      { id: 'LN-2026-00246', name: 'Ana Garcia', amount: '₱50,000', status: 'active', purpose: 'Education', date: 'Jun 14', term: '12 months',
        info: [['Date of Birth', 'Sep 3, 1992'], ['Employment', 'Teacher — DepEd'], ['Monthly Income', '₱28,000']],
        docs: [['Valid Gov ID', 'Verified', true], ['Character References', 'Pending visit', false]] },
    ],
    committee: [
      { id: 'LN-2026-00248', name: 'Maria Santos', amount: '₱80,000', status: 'pending', purpose: 'Business', date: 'Jun 15', term: '18 months',
        info: [['Recommended by', 'CIG — Ana Reyes'], ['CIG Score', 'B+'], ['Credit Risk', 'Low-Medium']],
        docs: [['CIG Report', 'Complete', true], ['Committee Decision', 'Pending vote', false]] },
    ],
    lra: [
      { id: 'LN-2026-00247', name: 'Jose Reyes', amount: '₱150,000', status: 'approved', purpose: 'Home Improvement', date: 'Jun 15', term: '24 months',
        info: [['Interest Rate', '1.5% / month'], ['Monthly Payment', '₱7,540.50'], ['PDC Count', '24 checks']],
        docs: [['Loan Agreement', 'Signed', true], ['Disclosure Statement', 'Pending signature', false]] },
    ],
    collection: [
      { id: 'LN-2026-00241', name: 'Carlos Aquino', amount: '₱45,000', status: 'overdue', purpose: 'Emergency', date: 'Jun 11', term: '12 months',
        info: [['Overdue Since', 'May 15, 2026'], ['Overdue Amount', '₱2,354.20'], ['Assigned To', 'Col. Rosa T.']],
        docs: [['Payment Notice Sent', 'Jun 1', true], ['Restructuring Offer', 'Pending response', false]] },
    ],
  };
  const actionsByRole = {
    csa: [['Forward to CIG', '#2F55B4', '#fff'], ['Request Documents', '#fff', '#3D4A68'], ['Decline Application', '#FCEBE9', '#C24638']],
    cig: [['Forward to Committee', '#2F55B4', '#fff'], ['Schedule Visit', '#fff', '#3D4A68'], ['Needs More Docs', '#FFFBEB', '#D97706']],
    committee: [['Approve Loan', '#3E8E3C', '#fff'], ['Counter Offer', '#2F55B4', '#fff'], ['Reject Application', '#FCEBE9', '#C24638']],
    lra: [['Confirm Release', '#3E8E3C', '#fff'], ['Update Terms', '#2F55B4', '#fff'], ['Hold Release', '#FFFBEB', '#D97706']],
    collection: [['Mark Paid', '#3E8E3C', '#fff'], ['Offer Restructuring', '#2F55B4', '#fff'], ['Escalate', '#FCEBE9', '#C24638']],
  };
  const statusCfg = { pending: ['#FFFBEB', '#D97706', 'Pending'], approved: ['#EAF7E9', '#3E8E3C', 'Approved'], active: ['#F3F5FA', '#2F55B4', 'Active'], overdue: ['#FCEBE9', '#C24638', 'Overdue'] };
  const avatarColors = ['#2F55B4', '#3E8E3C', '#D97706', '#8B5CF6', '#C24638'];

  const [activeRole, setActiveRole] = React.useState('csa');
  const queue = allApps[activeRole];
  const [selectedId, setSelectedId] = React.useState(queue[0].id);
  React.useEffect(() => { setSelectedId(allApps[activeRole][0].id); }, [activeRole]);
  const sel = queue.find((a) => a.id === selectedId) || queue[0];
  const currentRole = roles.find((r) => r.id === activeRole);

  return (
    <div style={{ display: 'flex', height: 720, overflow: 'hidden', fontFamily: "'Albert Sans',system-ui,sans-serif", background: '#F3F5FA' }}>
      <aside style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid #DFE5F0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px', borderBottom: '1px solid #E8EDF7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2F55B4,#22407F)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z" fill="white"/></svg>
            </div>
            <div><div style={{ fontSize: 14, fontWeight: 800, color: '#16233F' }}>LoanStar</div><div style={{ fontSize: 10, color: '#8B99BC', fontWeight: 600, textTransform: 'uppercase' }}>Staff Portal</div></div>
          </div>
        </div>
        <nav style={{ padding: '14px 10px', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8B99BC', padding: '0 6px 8px' }}>Assigned to Ana Reyes</div>
          <div style={{ fontSize: 12, color: '#64708C', padding: '0 6px' }}>Use the role switcher (top bar) to change queue.</div>
        </nav>
        <div style={{ padding: 14, borderTop: '1px solid #E8EDF7', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#3E8E3C,#0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>A</div>
          <div><div style={{ fontSize: 12, fontWeight: 600, color: '#16233F' }}>Ana Reyes</div><div style={{ fontSize: 11, color: '#8B99BC' }}>{currentRole.stage}</div></div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{ height: 58, background: '#fff', borderBottom: '1px solid #DFE5F0', flexShrink: 0, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#16233F' }}>Operations Queue</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2F55B4', marginLeft: 10 }}>{currentRole.stage}</span>
          </div>
          <div style={{ display: 'flex', gap: 2, background: '#E8EDF7', padding: 3, borderRadius: 9 }}>
            {roles.map((r) => {
              const active = activeRole === r.id;
              return (
                <button key={r.id} onClick={() => setActiveRole(r.id)} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#2F55B4' : '#64708C', boxShadow: active ? '0 1px 3px rgba(15,23,42,0.12)' : 'none' }}>{r.label}</button>
              );
            })}
          </div>
        </header>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid #DFE5F0', overflowY: 'auto', background: '#fff' }}>
            {queue.map((app, i) => {
              const [bg, color, label] = statusCfg[app.status];
              const isSel = app.id === selectedId;
              return (
                <div key={app.id} onClick={() => setSelectedId(app.id)} style={{ padding: '12px 14px', borderBottom: '1px solid #F3F5FA', cursor: 'pointer', background: isSel ? '#F0F7FF' : '#fff', position: 'relative' }}>
                  {isSel && <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: '#2F55B4', borderRadius: '0 2px 2px 0' }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColors[i % avatarColors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{app.name.split(' ').map((w) => w[0]).join('')}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: '#16233F' }}>{app.name}</div><div style={{ fontSize: 11, color: '#8B99BC', fontFamily: 'var(--font-mono)' }}>{app.id}</div></div>
                    </div>
                    <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 3, height: 'fit-content' }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#16233F' }}>{app.amount}</span>
                    <span style={{ fontSize: 11, color: '#8B99BC' }}>{app.date}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ overflowY: 'auto', padding: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: '18px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Application</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16233F' }}>{sel.name}</div>
                  <div style={{ fontSize: 12, color: '#64708C', fontFamily: 'var(--font-mono)' }}>{sel.id}</div>
                </div>
                <span style={{ ...{ background: statusCfg[sel.status][0], color: statusCfg[sel.status][1] }, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 4, height: 'fit-content' }}>{statusCfg[sel.status][2]}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, paddingTop: 14, borderTop: '1px solid #E8EDF7' }}>
                <div><div style={{ fontSize: 11, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 4 }}>Loan Amount</div><div style={{ fontSize: 19, fontWeight: 700, color: '#16233F' }}>{sel.amount}</div></div>
                <div><div style={{ fontSize: 11, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 4 }}>Purpose</div><div style={{ fontSize: 15, fontWeight: 600, color: '#16233F' }}>{sel.purpose}</div></div>
                <div><div style={{ fontSize: 11, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 4 }}>Term</div><div style={{ fontSize: 15, fontWeight: 600, color: '#16233F' }}>{sel.term}</div></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Borrower Information</div>
                {sel.info.map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F5FA' }}>
                    <span style={{ fontSize: 12, color: '#64708C' }}>{l}</span><span style={{ fontSize: 12, fontWeight: 600, color: '#3D4A68' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Document Checklist</div>
                {sel.docs.map(([label, status, ok]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #F3F5FA' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: ok ? '#EAF7E9' : '#FCEBE9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: ok ? '#3E8E3C' : '#C24638' }}>{ok ? '✓' : '✕'}</span>
                    </div>
                    <span style={{ fontSize: 12, color: ok ? '#3D4A68' : '#C24638', flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: ok ? '#3E8E3C' : '#D97706' }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {actionsByRole[activeRole].map(([label, bg, color]) => (
                <button key={label} style={{ height: 40, padding: '0 18px', background: bg, color, border: bg === '#fff' ? '1.5px solid #DFE5F0' : 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
window.StaffOperationsApp = StaffOperationsApp;
