Shell chrome shared by every portal: branded `Sidebar` (224–248px, white, 6px gradient logo mark), sticky `TopBar`, and in-content `PageHeader`.

```jsx
<Sidebar items={navItems} activeId="dashboard" subtitle="My Account" footer={<UserProfile />} />
<TopBar title="Dashboard" subtitle="June 16, 2026" actions={<Button size="sm">Apply New Loan</Button>} />
<PageHeader title="Loan Application" description="LN-2026-00142" onBack={goBack} />
```

Sidebar width varies slightly per portal in the source mockups (224px borrower, 228px admin, 246px staff) — pick one per surface, don't mix within a product.
