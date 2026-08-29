# Payment Frequencies - Quick Reference Card
## For AI Agent Implementation

---

## 🎯 WHAT NEEDS TO BE BUILT

| Priority | Feature | Status | Time | Impact |
|----------|---------|--------|------|--------|
| 🔴 P1 | Auto/REM Fix | ⚠️ WRONG | 2-3 days | HIGH - Wrong calculations |
| 🔴 P1 | Invoice Financing | ❌ MISSING | 5-7 days | HIGH - Missing product |
| 🟡 P2 | Bi-Monthly | ❌ MISSING | 3 days | MEDIUM |
| 🟡 P2 | Quarterly/2-Month | ❌ MISSING | 4 days | MEDIUM |
| 🟢 P3 | Daily Interest | ❌ MISSING | 2 days | LOW |

**Total Time**: ~3 weeks for all priorities

---

## 📋 QUICK CHEAT SHEET

### 1. Auto/REM Fix (Fix WRONG calculation)
```
WRONG: Principal = Loan Desired + Fees (gross-up)
RIGHT: Principal = Loan Desired (net method)

File: src/lib/csa/computation.ts line 259
Action: Detect collateral_type, route to SF engine for Auto/REM
```

### 2. Invoice Financing (Weekly + escalating rates)
```
Week 1-4:  1% per week
Week 5-8:  2% per week
Week 9-12: 2.5% per week
Month 4:   Principal due + 5% penalty

File: CREATE src/lib/computation/invoice.ts
```

### 3. Bi-Monthly (Every 15 days, rolling)
```
Release Aug 20 → Pay every 15 days:
- Sep 4 (Day 15)
- Sep 19 (Day 30)
- Oct 4 (Day 45)
...

File: src/lib/ar/schedule.ts
Function: generateBiMonthlySchedule()
```

### 4. Quarterly (Every 3 months, interest-only)
```
Month 3: Interest only
Month 6: Interest only
Month 9: Interest only
Month 12: Interest + Principal

File: src/lib/ar/schedule.ts
Function: generateQuarterlySchedule()
```

### 5. Daily Interest (Actual days)
```
Interest = Principal × (Monthly Rate ÷ 30) × Days
Example: ₱100k × (3% ÷ 30) × 5 days = ₱500

File: CREATE src/lib/computation/daily.ts
```

---

## 📁 FILES TO CREATE/MODIFY

### NEW FILES (Create these)
- [ ] `src/lib/computation/invoice.ts`
- [ ] `src/lib/computation/daily.ts`
- [ ] `src/lib/computation/__tests__/invoice.test.ts`
- [ ] `src/lib/computation/__tests__/daily.test.ts`
- [ ] `src/lib/ar/__tests__/schedule-bimonthly.test.ts`
- [ ] `src/lib/ar/__tests__/schedule-quarterly.test.ts`
- [ ] `supabase/migrations/xxx_add_payment_frequencies.sql`

### MODIFY FILES (Update these)
- [ ] `src/lib/csa/computation.ts` (routing logic)
- [ ] `src/lib/ar/schedule.ts` (add frequency functions)
- [ ] `src/components/csa/ComputationPanel.tsx` (UI selectors)
- [ ] `src/lib/committee/negotiation.ts` (if committee overrides)

---

## 🎯 SUCCESS CRITERIA CHECKLIST

### Auto/REM Fix
- [ ] Auto loan with ₱100k calculates interest on ₱100k (not ₱110k)
- [ ] REM loan with ₱100k calculates interest on ₱100k (not ₱110k)
- [ ] SME clean loan still uses gross-up (unchanged)
- [ ] Monthly payment matches Excel output

### Invoice Financing
- [ ] Can select "Weekly (Invoice)" frequency
- [ ] Terms limited to 1-3 months
- [ ] Week 1-4 rate = 1%
- [ ] Week 5-8 rate = 2%
- [ ] Week 9-12 rate = 2.5%
- [ ] Principal due after last week
- [ ] Total interest matches Excel

### Bi-Monthly
- [ ] Can select "Bi-Monthly" frequency
- [ ] First payment = release + 15 days
- [ ] Each payment = 15 days apart
- [ ] Installments = terms × 2
- [ ] Amount = monthly ÷ 2

### Quarterly/2-Month
- [ ] Can select "Quarterly" or "2-Month"
- [ ] Terms validation (divisible by 2 or 3)
- [ ] First N-1 payments = interest only
- [ ] Last payment = interest + principal
- [ ] Payment spacing correct (2 or 3 months)

### Daily Interest
- [ ] Can select "Daily Interest"
- [ ] Can input payment date
- [ ] Daily rate = monthly ÷ 30
- [ ] Interest = principal × daily rate × days
- [ ] Single payment generated

---

## 📚 DOCUMENTATION REFERENCES

**Read these in order:**

1. **START HERE**: `payment-frequency-implementation-brief.md`
   - Complete context for AI agent
   - All business rules with evidence
   - Technical implementation guides

2. **Business Rules**: `payment-frequency-audit.md`
   - Technical details with code
   - Exact formulas from Excel
   - Line-by-line comparison

3. **Client Source**: `transcription.md`
   - Lines 900-1100
   - Client explaining each payment type
   - Real-world examples

4. **Excel Analysis**: `sme-calculator-extraction.md`
   - Excel formula extraction
   - Verified against 35 real loans
   - Mathematical proof

---

## 🔧 TESTING DATA

Use these for verification:

**SME (Existing - Keep working)**:
```
Loan: ₱100,000
PF: 10%
Interest: 3% monthly
Terms: 6 months
Expected Principal: ₱110,000
Expected Monthly: ₱21,633.33
```

**Auto/REM (Fix this)**:
```
Loan: ₱100,000
PF: 10%
Interest: 3% monthly
Terms: 6 months
Expected Principal: ₱100,000 (NOT ₱110,000!)
Expected Monthly: ₱19,666.67 (NOT ₱21,633.33!)
```

**Invoice (Build new)**:
```
Principal: ₱100,000
Month 1: 4 weeks × 1% = ₱4,000
Month 2: 4 weeks × 2% = ₱8,000
Month 3: 4 weeks × 2.5% = ₱10,000
Total Interest: ₱22,000
```

---

## 💡 IMPLEMENTATION TIPS

1. **Start with Auto/REM** - Easiest, highest impact
2. **Test after each change** - Don't break existing features
3. **Follow existing patterns** - Look at `sme.ts` and `sf.ts` structure
4. **Match Excel exactly** - Client has been using it for years
5. **Add comprehensive tests** - Each frequency needs full coverage

---

## 🚨 COMMON PITFALLS TO AVOID

❌ **DON'T**: Modify `sme.ts` or `sf.ts` directly  
✅ **DO**: Create routing logic in `computation.ts`

❌ **DON'T**: Change existing monthly/semi-monthly logic  
✅ **DO**: Add new frequency types alongside existing

❌ **DON'T**: Skip validation rules  
✅ **DO**: Add term divisibility checks for quarterly

❌ **DON'T**: Forget database migrations  
✅ **DO**: Update payment_frequency enum first

❌ **DON'T**: Guess at formulas  
✅ **DO**: Use exact formulas from Excel extraction

---

## 🎯 DEPLOYMENT ORDER

```
Week 1: Auto/REM Fix
├── Stage 1: Fix routing logic
├── Stage 2: Test with sample loans
└── Stage 3: Deploy to production

Week 2: Invoice Financing
├── Stage 1: Build computation engine
├── Stage 2: Add UI selectors
├── Stage 3: Test weekly schedules
└── Stage 4: Deploy to production

Week 3: Bi-Monthly + Quarterly
├── Stage 1: Build schedule generators
├── Stage 2: Add validations
├── Stage 3: Test all frequencies
└── Stage 4: Deploy together

Week 4: Daily Interest + Final Testing
├── Stage 1: Build daily calculator
├── Stage 2: Full regression test
├── Stage 3: Client UAT
└── Stage 4: Production rollout
```

---

## 📞 QUESTIONS?

All details are in: **payment-frequency-implementation-brief.md**

That document contains:
- ✅ Complete business context
- ✅ Current codebase analysis
- ✅ All business rules with evidence
- ✅ Technical implementation guides
- ✅ Code examples to follow
- ✅ Testing strategy
- ✅ Success criteria

**Read that document first, then start building!** 🚀
