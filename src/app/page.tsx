import Link from "next/link";
import { redirect } from "next/navigation";

import { LoanStarLogo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="landing-page bg-canvas">
      <header className="landing-topnav">
        <div className="landing-topnav-in">
          <Link href="/" className="inline-flex items-center no-underline">
            <LoanStarLogo height={36} />
          </Link>
          <nav aria-label="Primary">
            <a href="#products">Products</a>
            <a href="#how">How it works</a>
            <a href="#why">Why LoanStar</a>
          </nav>
          <div className="right">
            <Link href="/login" className="login-link">
              Log in
            </Link>
            <Link href="/register" className="btn btn-accent">
              Apply now
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero landing-panel" id="top">
        <div className="landing-hero-grid" aria-hidden />
        <div className="landing-hero-in">
          <div className="landing-brand">
            <LoanStarLogo height={56} />
          </div>
          <div className="landing-kicker">Seafarer lending · Est. Manila</div>
          <h1>
            Lending, <em>charted clearly</em> for Filipino seafarers.
          </h1>
          <p className="sub">
            Apply before you board, get verified fast, and track every peso of
            your loan — from committee approval to final payment — in one
            transparent portal.
          </p>
          <div className="cta">
            <Link href="/register" className="btn btn-accent btn-lg">
              Start your application
            </Link>
            <a href="#how" className="btn btn-ghost-inv btn-lg">
              See how it works
            </a>
          </div>
        </div>
      </section>

      <section className="landing-sec landing-panel" id="products">
        <div className="landing-wrap">
          <div className="landing-sec-kicker">Products</div>
          <h2>Built around the seafarer&apos;s contract cycle.</h2>
          <p className="lede">
            Every product is designed to align repayment with allotment
            schedules — so payments happen while you earn, not after.
          </p>
          <div className="landing-feat-grid">
            <div className="landing-feat">
              <span className="ic" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12h20M2 12c0-3 4-9 10-9s10 6 10 9M2 12c0 3 4 9 10 9s10-6 10-9" />
                  <path d="M12 3v18" />
                </svg>
              </span>
              <h3>SF Loan</h3>
              <p>
                Our standard seafarer loan. Up to ₱300,000, released before
                deployment, repaid through allotment deductions across your
                contract.
              </p>
            </div>
            <div className="landing-feat">
              <span className="ic" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
              <h3>Allotment Advance</h3>
              <p>
                Bridge the gap between boarding and your first allotment.
                Smaller amounts, shorter terms, same-week release.
              </p>
            </div>
            <div className="landing-feat">
              <span className="ic" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-9-9" />
                  <path d="M21 3v6h-6" />
                </svg>
              </span>
              <h3>Reloan</h3>
              <p>
                Good payment history unlocks faster reloans — pre-verified
                documents, higher limits, and committee fast-tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-sec landing-how landing-panel" id="how">
        <div className="landing-wrap">
          <div className="landing-sec-kicker">How it works</div>
          <h2>From application to release in four charted steps.</h2>
          <div className="landing-how-steps">
            <div className="landing-how-step">
              <span className="pt">1</span>
              <h4>Apply online</h4>
              <p>
                Complete the form and upload your contract, seafarer&apos;s
                book, and allotment slip.
              </p>
              <span className="tag">~15 mins</span>
            </div>
            <div className="landing-how-step">
              <span className="pt">2</span>
              <h4>Get verified</h4>
              <p>
                Our credit team confirms your contract directly with your
                manning agency.
              </p>
              <span className="tag">1 business day</span>
            </div>
            <div className="landing-how-step">
              <span className="pt">3</span>
              <h4>Committee approval</h4>
              <p>
                Your application is reviewed and voted on — you can track the
                status live in your portal.
              </p>
              <span className="tag">~24 hrs</span>
            </div>
            <div className="landing-how-step">
              <span className="pt">4</span>
              <h4>Receive funds</h4>
              <p>
                Proceeds are transferred to your nominated bank account, with a
                full statement of account.
              </p>
              <span className="tag">Same day</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band landing-panel" id="why">
        <div className="landing-wrap">
          <div>
            <div
              className="landing-sec-kicker"
              style={{ color: "var(--teal-400)" }}
            >
              Why LoanStar
            </div>
            <h2>No surprises. Every peso accounted for.</h2>
            <p className="lede">
              Your portal shows the same ledger our officers see — the full
              computation, every fee, every payment posted.
            </p>
            <ul>
              <li>
                <CheckIcon />
                Transparent computation — see interest, fees, and net proceeds
                before you sign
              </li>
              <li>
                <CheckIcon />
                Live status tracking through verification, committee, and
                release
              </li>
              <li>
                <CheckIcon />
                Payment schedule aligned to your allotment dates
              </li>
              <li>
                <CheckIcon />
                SMS and email reminders before every due date
              </li>
            </ul>
          </div>
          <div className="landing-band-card">
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Sample statement ·{" "}
              <span
                className="mono"
                style={{ fontSize: 12, color: "var(--teal-400)" }}
              >
                LN-2026-004518
              </span>
            </div>
            <div className="row">
              <span>Principal</span>
              <b>₱150,000.00</b>
            </div>
            <div className="row">
              <span>Interest (4.50% × 10 mo)</span>
              <b>₱67,500.00</b>
            </div>
            <div className="row">
              <span>Service fee</span>
              <b>₱7,250.00</b>
            </div>
            <div className="row">
              <span>Net proceeds</span>
              <b className="ok">₱142,750.00</b>
            </div>
            <div className="row">
              <span>Monthly amortization</span>
              <b className="ok">₱21,750.00</b>
            </div>
            <div className="row">
              <span>Payments posted</span>
              <b>4 of 10 · on time</b>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta-final landing-panel">
        <div
          className="landing-sec-kicker"
          style={{ justifyContent: "center" }}
        >
          Ready when you are
        </div>
        <h2>Set your course before you sail.</h2>
        <p className="lede">
          Apply today and have your proceeds released before your next
          deployment.
        </p>
        <div className="btns">
          <Link href="/register" className="btn btn-accent btn-lg">
            Start your application
          </Link>
          <Link href="/login" className="btn btn-outline btn-lg">
            Log in to your portal
          </Link>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="landing-foot-in">
          <div className="landing-foot-top">
            <div>
              <Link href="/" className="logo">
                <LoanStarLogo height={40} />
              </Link>
              <p>
                Loan Star Lending Group Corp. — trusted lending for Filipino
                seafarers and their families.
              </p>
            </div>
            <div className="landing-foot-cols">
              <div>
                <h5>Products</h5>
                <a href="#products">SF Loan</a>
                <a href="#products">Allotment Advance</a>
                <a href="#products">Reloan</a>
              </div>
              <div>
                <h5>Company</h5>
                <a href="#why">About us</a>
                <a href="#how">How it works</a>
                <Link href="/login">Portal login</Link>
              </div>
              <div>
                <h5>Legal</h5>
                <span className="mb-2 block text-[13.5px] text-navy-200">
                  Privacy policy
                </span>
                <span className="mb-2 block text-[13.5px] text-navy-200">
                  Terms of service
                </span>
                <span className="mb-2 block text-[13.5px] text-navy-200">
                  Disclosure statement
                </span>
              </div>
            </div>
          </div>
          <div className="landing-foot-btm">
            <span>© 2026 LOAN STAR LENDING GROUP CORP.</span>
            <span>MERIDIAN DS V1.1</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
