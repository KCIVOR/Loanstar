import React from 'react';

function AuthApp() {
  const [role, setRole] = React.useState('borrower');
  const [step, setStep] = React.useState('login');
  const [email, setEmail] = React.useState('juan.delacruz@email.com');
  const [password, setPassword] = React.useState('password123');
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [resend, setResend] = React.useState(45);

  React.useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => setResend((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const roleLabels = { borrower: 'Borrower', staff: 'Staff', admin: 'Admin' };
  const masked = email.replace(/^(.{2})(.*)(@.+)$/, (_, a, b, c) => a + b.replace(/./g, '•') + c);
  const otp = ['4', '7', '2', '', '', ''];

  function submit() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep('otp'); setResend(45); }, 1000);
  }
  function verify() {
    setLoading(true);
    setTimeout(() => { setLoading(false); alert(`Would navigate to the ${roleLabels[role]} portal.`); }, 800);
  }

  const tab = (r) => ({
    background: role === r ? '#FFFFFF' : 'transparent',
    color: role === r ? '#0F172A' : '#64748B',
    boxShadow: role === r ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
  });

  return (
    <div style={{ display: 'flex', minHeight: 640, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      {/* LEFT: brand */}
      <div style={{ width: 400, flexShrink: 0, background: 'linear-gradient(155deg,#1E2F5E 0%,#1A56DB 100%)', padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 44 }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.8 9.2 22 10.3 16.5 15.6 18 22 12 18.5 6 22 7.5 15.6 2 10.3 9.2 9.2z" fill="white"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>LoanStar</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lending System</div>
            </div>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-1.1px', lineHeight: 1.1, marginBottom: 14 }}>Smart loans,<br/>simpler lives.</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, maxWidth: 280 }}>A trusted platform for borrowers and lending professionals — from application to collection.</p>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {[['1,247', 'Active Loans'], ['₱124M', 'Disbursed'], ['94.2%', 'Collection Rate'], ['24hr', 'Processing']].map(([v, l]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.8px' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: form */}
      <div style={{ flex: 1, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 28px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {step === 'login' ? (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.6px', marginBottom: 6 }}>Welcome back</h2>
                <p style={{ fontSize: 14, color: '#64748B' }}>Sign in to your LoanStar account</p>
              </div>
              <div style={{ display: 'flex', gap: 3, background: '#E2E8F0', padding: 3, borderRadius: 6, marginBottom: 24 }}>
                {['borrower', 'staff', 'admin'].map((r) => (
                  <button key={r} onClick={() => setRole(r)} style={{ flex: 1, height: 34, border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', ...tab(r) }}>{roleLabels[r]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>Email Address</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', height: 42, padding: '0 14px', border: '1.5px solid #CBD5E1', borderRadius: 4, fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>Password</label>
                    <a href="#" style={{ fontSize: 12, color: '#1A56DB', fontWeight: 500 }}>Forgot password?</a>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', height: 42, padding: '0 42px 0 14px', border: '1.5px solid #CBD5E1', borderRadius: 4, fontSize: 14, outline: 'none' }} />
                    <button onClick={() => setShowPw((s) => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>👁</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div onClick={() => setRemember((r) => !r)} style={{ width: 18, height: 18, borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: remember ? '#1A56DB' : '#fff', border: `1.5px solid ${remember ? '#1A56DB' : '#CBD5E1'}` }}>
                    {remember && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: '#475569' }}>Remember me for 30 days</span>
                </div>
                <button onClick={submit} style={{ height: 46, background: '#1A56DB', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {loading ? 'Signing in…' : 'Sign In →'}
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 18, borderTop: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: 13, color: '#64748B' }}>New borrower? </span>
                <span style={{ fontSize: 13, color: '#1A56DB', fontWeight: 600, cursor: 'pointer' }}>Apply for a loan →</span>
              </div>
            </div>
          ) : (
            <div>
              <button onClick={() => setStep('login')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, fontWeight: 500, marginBottom: 28, padding: 0 }}>← Back to Sign In</button>
              <div style={{ textAlign: 'center', marginBottom: 30 }}>
                <div style={{ width: 56, height: 56, background: '#EFF6FF', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="26" height="26" viewBox="0 0 28 28" fill="none"><path d="M14 3L17 11.5 26 12.7 20 18.8 21.7 27.5 14 23.5 6.3 27.5 8 18.8 2 12.7 11 11.5z" stroke="#1A56DB" strokeWidth="1.8" fill="rgba(26,86,219,0.1)" strokeLinejoin="round"/></svg>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', marginBottom: 8 }}>Verify your identity</h2>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>Enter the 6-digit code sent to<br/><strong style={{ color: '#334155' }}>{masked}</strong></p>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                {otp.map((d, i) => (
                  <input key={i} maxLength={1} defaultValue={d} style={{ width: 42, height: 50, border: `1.5px solid ${d ? '#1A56DB' : '#CBD5E1'}`, borderRadius: 4, fontSize: 22, fontWeight: 700, textAlign: 'center', outline: 'none' }} />
                ))}
              </div>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>Didn't receive a code? </span>
                <span style={{ fontSize: 13, color: '#1A56DB', fontWeight: 600 }}>Resend in {resend}s</span>
              </div>
              <button onClick={verify} style={{ height: 46, width: '100%', background: '#1A56DB', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Verifying…' : 'Verify & Sign In →'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>Signing in as </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{roleLabels[role]}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.AuthApp = AuthApp;
