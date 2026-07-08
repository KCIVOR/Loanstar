function LoanApplicationApp() {
  const [step, setStep] = React.useState(1);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [loanAmount, setLoanAmount] = React.useState(150000);
  const [loanMonths, setLoanMonths] = React.useState(24);
  const [docs, setDocs] = React.useState([false, false, true, true, false, false]);
  const [terms, setTerms] = React.useState([true, false, false]);

  const stepLabels = ['Personal Info', 'Loan Details', 'Documents', 'Review'];
  const r = 0.015, n = Math.max(1, loanMonths);
  const monthly = loanAmount > 0 ? (loanAmount * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1) : 0;
  const totalPayment = monthly * n;
  const totalInterest = totalPayment - loanAmount;
  const fmt = (v) => '₱' + Math.round(v).toLocaleString('en-PH');

  const docDefs = [
    { label: 'Valid Government ID', hint: "Passport, Driver's License, SSS, PhilHealth", required: true },
    { label: 'Income Tax Return (ITR)', hint: 'Latest BIR Form 2316', required: true },
    { label: 'Certificate of Employment', hint: 'Signed by HR — not older than 3 months', required: true },
    { label: 'Latest 3 Months Payslips', hint: 'Or audited financials for business owners', required: true },
    { label: 'Proof of Billing', hint: 'Utility bill or bank statement', required: false },
    { label: 'Collateral Documents', hint: 'Land title, vehicle OR — if applicable', required: false },
  ];
  const uploadedCount = docs.filter(Boolean).length;
  const canNext = step === 4 ? terms.every(Boolean) : true;

  function next() {
    if (step < 4) { setStep(step + 1); return; }
    if (!canNext) return;
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setSuccess(true); }, 1200);
  }
  function prev() { if (step > 1) setStep(step - 1); }

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 32px', textAlign: 'center', fontFamily: "'Albert Sans',system-ui,sans-serif" }}>
        <div style={{ width: 76, height: 76, background: '#EAF7E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="19" stroke="#3E8E3C" strokeWidth="2" fill="rgba(5,150,105,0.08)"/><path d="M11 20l6.5 6.5 11.5-13" stroke="#3E8E3C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#16233F', letterSpacing: '-0.6px', marginBottom: 10 }}>Application Submitted!</h2>
        <p style={{ fontSize: 14, color: '#64708C', lineHeight: 1.7, maxWidth: 420, marginBottom: 10 }}>Your loan application has been received. Our CSA team will contact you within <strong>1–3 business days</strong>.</p>
        <div style={{ fontSize: 13, color: '#8B99BC', fontFamily: 'var(--font-mono)', background: '#F3F5FA', padding: '6px 16px', borderRadius: 4, border: '1px solid #DFE5F0', marginBottom: 28 }}>LN-2026-00512</div>
        <button onClick={() => { setSuccess(false); setStep(1); }} style={{ height: 42, padding: '0 20px', background: '#F3F5FA', color: '#4F5A78', border: '1px solid #DFE5F0', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>Start New Application</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 640, background: '#F3F5FA', fontFamily: "'Albert Sans',system-ui,sans-serif" }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #DFE5F0', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, background: 'linear-gradient(135deg,#2F55B4,#22407F)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1L8.57 4.84 13 5.38 9.9 8.3l.86 4.7L7 10.5l-3.76 2.5.86-4.7L1 5.38l4.43-.54z" fill="white"/></svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#16233F' }}>LoanStar</span>
          </div>
          <div style={{ fontSize: 12, color: '#8B99BC' }}>Step {step} of 4 · {stepLabels[step - 1]}</div>
        </div>
        <div style={{ height: 3, background: '#E8EDF7' }}><div style={{ height: '100%', background: '#2F55B4', width: `${step * 25}%`, transition: 'width .3s' }} /></div>
      </header>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 28px 0' }}>
        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 34 }}>
          {stepLabels.map((label, i) => {
            const num = i + 1;
            const done = num < step, active = num === step;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                <div onClick={() => done && setStep(num)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: done ? 'pointer' : 'default' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? '#2F55B4' : active ? '#fff' : '#F3F5FA', border: `2px solid ${num <= step ? '#2F55B4' : '#DFE5F0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active ? '0 0 0 4px rgba(26,86,219,0.12)' : 'none' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#fff' : active ? '#2F55B4' : '#C3CCDE' }}>{done ? '✓' : num}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: done ? '#3D4A68' : active ? '#16233F' : '#C3CCDE' }}>{label}</span>
                </div>
                {i < 3 && <div style={{ width: 64, height: 2, background: num < step ? '#2F55B4' : '#DFE5F0', marginBottom: 16, marginLeft: 4, marginRight: 4 }} />}
              </div>
            );
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '18px 26px', borderBottom: '1px solid #E8EDF7', background: '#FAFBFF' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#16233F' }}>Personal Information</div>
              <div style={{ fontSize: 13, color: '#64708C', marginTop: 3 }}>Please ensure all details match your government-issued ID.</div>
            </div>
            <div style={{ padding: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              {[['First Name', 'Juan'], ['Last Name', 'dela Cruz'], ['Mobile Number', '+63 912 345 6789']].map(([label, val]) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4A68', marginBottom: 6 }}>{label} <span style={{ color: '#C24638' }}>*</span></label>
                  <input defaultValue={val} style={{ width: '100%', height: 40, padding: '0 14px', border: '1.5px solid #C3CCDE', borderRadius: 4, fontSize: 14, outline: 'none' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4A68', marginBottom: 6 }}>Monthly Income <span style={{ color: '#C24638' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 13, top: 11, fontSize: 14, fontWeight: 600, color: '#64708C' }}>₱</span>
                  <input defaultValue="45,000" style={{ width: '100%', height: 40, padding: '0 14px 0 28px', border: '1.5px solid #C3CCDE', borderRadius: 4, fontSize: 14, outline: 'none' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '18px 26px', borderBottom: '1px solid #E8EDF7', background: '#FAFBFF' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#16233F' }}>Loan Details</div>
              <div style={{ fontSize: 13, color: '#64708C', marginTop: 3 }}>Tell us how much you need and how you plan to use it.</div>
            </div>
            <div style={{ padding: 26 }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4A68' }}>Loan Amount</label>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#2F55B4', fontVariantNumeric: 'tabular-nums' }}>₱ {loanAmount.toLocaleString('en-PH')}</div>
                </div>
                <input type="range" min="10000" max="500000" step="5000" value={loanAmount} onChange={(e) => setLoanAmount(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#2F55B4' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4A68', marginBottom: 10 }}>Loan Term</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[6, 12, 18, 24, 36].map((m) => (
                    <button key={m} onClick={() => setLoanMonths(m)} style={{ height: 34, padding: '0 16px', background: loanMonths === m ? '#2F55B4' : '#E8EDF7', color: loanMonths === m ? '#fff' : '#4F5A78', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{m} mo</button>
                  ))}
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg,#16233F,#2F55B4)', borderRadius: 6, padding: '18px 22px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: 12 }}>Estimated Repayment (1.5% / month)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {[['Monthly', fmt(monthly)], ['Interest', fmt(totalInterest)], ['Total', fmt(totalPayment)]].map(([l, v]) => (
                    <div key={l}><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div><div style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '18px 26px', borderBottom: '1px solid #E8EDF7', background: '#FAFBFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 17, fontWeight: 700, color: '#16233F' }}>Required Documents</div><div style={{ fontSize: 13, color: '#64708C', marginTop: 3 }}>Upload clear, readable copies.</div></div>
              <div style={{ background: '#F3F5FA', color: '#2F55B4', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 4 }}>{uploadedCount} / {docDefs.length} uploaded</div>
            </div>
            {docDefs.map((d, i) => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 26px', borderBottom: '1px solid #F3F5FA' }}>
                <div style={{ width: 34, height: 34, borderRadius: 6, background: docs[i] ? '#EAF7E9' : '#E8EDF7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: docs[i] ? '#3E8E3C' : '#8B99BC' }}>{docs[i] ? '✓' : '＋'}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3D4A68' }}>{d.label} {d.required && <span style={{ color: '#C24638' }}>*</span>}</div>
                  <div style={{ fontSize: 12, color: '#8B99BC' }}>{d.hint}</div>
                </div>
                <button onClick={() => setDocs((prev2) => prev2.map((v, j) => (j === i ? !v : v)))} style={{ height: 32, padding: '0 14px', background: docs[i] ? '#EAF7E9' : '#F3F5FA', color: docs[i] ? '#3E8E3C' : '#2F55B4', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{docs[i] ? 'Uploaded ✓' : 'Upload'}</button>
              </div>
            ))}
            <div style={{ padding: '14px 26px', background: '#FFFBEB', borderTop: '1px solid #FDE68A', fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>All uploaded documents are encrypted and stored securely.</div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 12 }}>Personal Info</div>
                {[['Full Name', 'Juan dela Cruz'], ['Mobile', '+63 912 345 6789'], ['Monthly Income', '₱45,000']].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}><span style={{ fontSize: 13, color: '#64708C' }}>{l}</span><span style={{ fontSize: 13, fontWeight: 600, color: '#3D4A68' }}>{v}</span></div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 12 }}>Loan Details</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}><span style={{ fontSize: 13, color: '#64708C' }}>Amount</span><span style={{ fontSize: 13, fontWeight: 700, color: '#2F55B4' }}>₱ {loanAmount.toLocaleString('en-PH')}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}><span style={{ fontSize: 13, color: '#64708C' }}>Term</span><span style={{ fontSize: 13, fontWeight: 600, color: '#3D4A68' }}>{loanMonths} months</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13, color: '#64708C' }}>Monthly Payment</span><span style={{ fontSize: 13, fontWeight: 700, color: '#16233F' }}>{fmt(monthly)}</span></div>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #DFE5F0', borderRadius: 6, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8B99BC', textTransform: 'uppercase', marginBottom: 12 }}>Terms &amp; Agreements</div>
              {['I have read and agree to the Loan Terms and Conditions.', 'I authorize a credit investigation of my financial records.', 'I confirm all information provided is accurate and complete.'].map((txt, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
                  <div onClick={() => setTerms((t) => t.map((v, j) => (j === i ? !v : v)))} style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0, marginTop: 1, background: terms[i] ? '#2F55B4' : '#fff', border: `1.5px solid ${terms[i] ? '#2F55B4' : '#C3CCDE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {terms[i] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: '#3D4A68', lineHeight: 1.5 }}>{txt}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0 36px' }}>
          <button onClick={prev} style={{ height: 42, padding: '0 20px', background: '#fff', color: '#4F5A78', border: '1.5px solid #DFE5F0', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>{step === 1 ? 'Cancel' : '← Back'}</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? '#2F55B4' : i < step ? '#C9D6EE' : '#DFE5F0', transition: 'all .2s' }} />
            ))}
          </div>
          <button onClick={next} disabled={step === 4 && !canNext} style={{ height: 42, padding: '0 26px', background: step === 4 ? (canNext ? '#3E8E3C' : '#C3CCDE') : '#2F55B4', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: step === 4 && !canNext ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Submitting…' : step === 4 ? 'Submit Application' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}
window.LoanApplicationApp = LoanApplicationApp;
