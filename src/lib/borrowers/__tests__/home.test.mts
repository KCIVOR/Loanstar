import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  borrowerHomeMode,
  borrowerHomeDescription,
  pipelineProgressPercent,
  nextActionLabel,
  nextStepGuidance,
  formatBlockerLabel,
  docsUploadPercent,
  borrowerAppFocus,
  borrowerAppPageTitle,
} from "../home";

describe("borrowerHomeMode", () => {
  it("ready when no loan and no open application", () => {
    assert.equal(
      borrowerHomeMode({ hasOpenApplication: false, hasActiveLoan: false }),
      "ready",
    );
  });

  it("in_progress when open application and no loan", () => {
    assert.equal(
      borrowerHomeMode({ hasOpenApplication: true, hasActiveLoan: false }),
      "in_progress",
    );
  });

  it("active_loan wins when loan exists", () => {
    assert.equal(
      borrowerHomeMode({ hasOpenApplication: true, hasActiveLoan: true }),
      "active_loan",
    );
  });
});

describe("borrowerHomeDescription", () => {
  it("adapts copy per mode", () => {
    assert.match(borrowerHomeDescription("ready"), /start/i);
    assert.match(borrowerHomeDescription("in_progress"), /progress|document/i);
    assert.match(borrowerHomeDescription("active_loan"), /loan|payment/i);
  });
});

describe("pipelineProgressPercent", () => {
  it("returns 0 for unknown status", () => {
    assert.equal(pipelineProgressPercent("nope"), 0);
  });

  it("shows started progress for documents_pending", () => {
    const pct = pipelineProgressPercent("documents_pending");
    assert.ok(pct > 0);
    assert.ok(pct < 20);
  });

  it("increases along the pipeline", () => {
    const early = pipelineProgressPercent("documents_pending");
    const later = pipelineProgressPercent("for_approval");
    assert.ok(later > early);
  });
});

describe("nextActionLabel", () => {
  it("points documents_pending to uploads", () => {
    assert.match(nextActionLabel("documents_pending"), /document/i);
  });

  it("points committee_hold to hold details", () => {
    assert.match(nextActionLabel("committee_hold"), /committee hold/i);
  });
});

describe("borrowerAppFocus", () => {
  it("maps early statuses to documents", () => {
    assert.equal(borrowerAppFocus("documents_pending"), "documents");
  });

  it("maps confirmation to terms", () => {
    assert.equal(borrowerAppFocus("awaiting_confirmation"), "terms");
  });

  it("maps loan_active to loan", () => {
    assert.equal(borrowerAppFocus("loan_active"), "loan");
  });

  it("maps committee_hold to waiting", () => {
    assert.equal(borrowerAppFocus("committee_hold"), "waiting");
  });
});

describe("borrowerAppPageTitle", () => {
  it("titles documents stage clearly", () => {
    assert.match(borrowerAppPageTitle("documents_pending"), /document/i);
  });
});

describe("nextStepGuidance", () => {
  it("uses committee-pending copy for committee_hold (not CSA on_hold)", () => {
    const guidance = nextStepGuidance({ status: "committee_hold" });
    assert.equal(
      guidance.body,
      "Your application is on hold pending committee review.",
    );
    assert.doesNotMatch(guidance.body, /CSA/i);
  });

  it("asks for documents when pending", () => {
    const g = nextStepGuidance({
      status: "documents_pending",
      docsUploaded: 1,
      docsRequired: 5,
    });
    assert.match(g.title, /document/i);
    assert.match(g.body, /1 of 5/i);
  });

  it("explains waiting states", () => {
    const g = nextStepGuidance({ status: "for_verification" });
    assert.match(g.body, /verif|CIG|review/i);
  });
});

describe("formatBlockerLabel", () => {
  it("turns slugs into plain language", () => {
    assert.equal(
      formatBlockerLabel("awaiting_documents"),
      "Awaiting documents",
    );
  });

  it("returns null for empty", () => {
    assert.equal(formatBlockerLabel(null), null);
  });
});

describe("docsUploadPercent", () => {
  it("uses uploaded over required", () => {
    assert.equal(docsUploadPercent({ uploaded: 2, required: 4 }), 50);
  });

  it("is 100 when nothing required", () => {
    assert.equal(docsUploadPercent({ uploaded: 0, required: 0 }), 100);
  });
});
