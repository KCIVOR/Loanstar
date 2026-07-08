# Auth — Login & Verification

Recreates the LoanStar sign-in flow: role tabs (Borrower / Staff / Admin), email + password, and a 6-digit OTP step. Split layout — dark blue brand panel with live-metric tiles on the left, form on the right.

Source: `Login.dc.html` in the original mockups (see `/reference/original-mockups`).

Files:
- `App.jsx` — `AuthApp` component, self-contained state (role, step, OTP resend timer).
- `index.html` — mounts `AuthApp`.
