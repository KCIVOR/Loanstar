Form primitives — 40px field height, 4px radius, primary-blue focus ring (3px, 10% opacity).

```jsx
<Input label="Full Name" required placeholder="e.g. Juan dela Cruz" helper="As it appears on your government ID" />
<Input label="Loan Amount" prefix="₱" defaultValue="150,000" />
<Input label="Date of Birth" required error="Applicant must be at least 18 years old" />
<Select label="Loan Purpose"><option>Business Capital</option></Select>
<Checkbox label="I agree to the Loan Terms and Conditions" checked={true} />
<Toggle checked={true} label="Payment Reminders" sub="SMS before due date" />
```

Use `prefix="₱"` for currency fields (right-align + tabular-nums numerals in your own value formatting). Error state: red-tinted background + border + message below the field, always explaining how to fix it.
