Status pill for loan/application states — colored dot + label, never color alone.

```jsx
<Badge status="approved">Approved</Badge>
<Badge status="pending">Pending Review</Badge>
<Badge status="overdue">Overdue</Badge>
```

Statuses map 1:1 to LoanStar's workflow states (registered, pending, submitted, approved, active, denied, overdue, closed). Pass `dot={false}` for a plain text pill.
