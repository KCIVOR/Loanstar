Loan-domain components built on the 6-step LoanStar workflow (Intake → Credit Investigation → Committee → Negotiation → Release → Monitoring). `StatusTimeline`, `DocumentChecklist`, and `SignatureConfirm` are restyled equivalents of the real `src/components/*.tsx` shared components; `Stepper` and `AmortizationTable` are additions used in the Loan Application and Borrower Portal mockups.

```jsx
<StatusTimeline steps={['Intake','Verification','Committee','Negotiation','Release','Monitoring']} currentIndex={2} />
<DocumentChecklist documents={docs} onUpload={handleUpload} />
<SignatureConfirm docName="Promissory Note" docType="Loan Agreement" onSign={sign} />
<Stepper steps={stepLabels} currentIndex={1} onStepClick={setStep} />
<AmortizationTable rows={scheduleRows} />
```

`DocumentChecklist` with `flagsOnly` renders a single Complete/Incomplete pill (Agent leads view). `SignatureConfirm` opens its own confirm-before-sign modal.
