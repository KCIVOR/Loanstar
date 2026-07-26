import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseSmtpConfig,
  type SmtpConfigRow,
} from "../smtp-config";

function rows(partial: Record<string, unknown>): SmtpConfigRow[] {
  return Object.entries(partial).map(([key, value]) => ({ key, value }));
}

describe("parseSmtpConfig", () => {
  it("returns enabled=false when email_enabled is false", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: false,
        smtp_host: "smtp.gmail.com",
        smtp_port: 587,
        smtp_secure: false,
        smtp_user: "a@gmail.com",
        smtp_password: "app-pass",
        smtp_from: "LoanStar <a@gmail.com>",
      }),
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.host, "smtp.gmail.com");
    assert.equal(cfg.port, 587);
  });

  it("treats missing port as 587 and secure false", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "smtp.gmail.com",
        smtp_user: "a@gmail.com",
        smtp_password: "x",
        smtp_from: "a@gmail.com",
      }),
    );
    assert.equal(cfg.port, 587);
    assert.equal(cfg.secure, false);
  });

  it("lists incomplete when required fields blank and enabled", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "",
        smtp_user: "",
        smtp_password: "",
        smtp_from: "",
      }),
    );
    assert.equal(cfg.enabled, true);
    assert.ok(cfg.incomplete.length > 0);
  });

  it("incomplete empty when all required present", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "smtp.gmail.com",
        smtp_port: 465,
        smtp_secure: true,
        smtp_user: "a@gmail.com",
        smtp_password: "app-pass",
        smtp_from: "LoanStar <a@gmail.com>",
      }),
    );
    assert.deepEqual(cfg.incomplete, []);
    assert.equal(cfg.secure, true);
    assert.equal(cfg.port, 465);
  });
});
