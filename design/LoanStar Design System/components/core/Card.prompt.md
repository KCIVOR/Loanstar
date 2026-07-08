Surfaces for financial info — amount first, then status, then secondary data. `Card` is the base container; `StatCard` is the KPI-card pattern used across dashboards.

```jsx
<Card variant="highlight">Left-border-4 primary card for callouts</Card>
<StatCard label="Active Loans" value="1,247" trend="↑ +12%" sub="vs last month" />
```

Variants: `base` (white, subtle shadow), `highlight`/`warning`/`danger` (tinted + left accent border, for callouts), `gradient` (dark blue gradient, used for the loan-balance hero card).
