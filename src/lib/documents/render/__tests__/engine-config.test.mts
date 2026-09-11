import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDocRenderConfig } from "../engine-config";

type Row = { key: string; value: unknown };

function rows(partial: Record<string, unknown>): Row[] {
  return Object.entries(partial).map(([key, value]) => ({ key, value }));
}

const NO_ENV = {};

describe("parseDocRenderConfig", () => {
  it("defaults to pdfmake with an empty connection when nothing is set", () => {
    const cfg = parseDocRenderConfig([], NO_ENV);
    assert.equal(cfg.engine, "pdfmake");
    assert.deepEqual(cfg.connection, { url: "", user: "", pass: "" });
    assert.equal(cfg.misconfigured, false);
  });

  it("DB engine 'chromium' selects chromium", () => {
    const cfg = parseDocRenderConfig(
      rows({ doc_render_engine: "chromium", gotenberg_url: "https://g.example" }),
      NO_ENV,
    );
    assert.equal(cfg.engine, "chromium");
    assert.equal(cfg.connection.url, "https://g.example");
    assert.equal(cfg.misconfigured, false);
  });

  it("falls back to the DOC_RENDER_ENGINE env var when the DB value is blank/invalid", () => {
    const cfg = parseDocRenderConfig(rows({ doc_render_engine: "" }), {
      DOC_RENDER_ENGINE: "chromium",
    });
    assert.equal(cfg.engine, "chromium");
  });

  it("DB value wins over the env var", () => {
    const cfg = parseDocRenderConfig(rows({ doc_render_engine: "pdfmake" }), {
      DOC_RENDER_ENGINE: "chromium",
    });
    assert.equal(cfg.engine, "pdfmake");
  });

  it("DB connection fields win over env fields", () => {
    const cfg = parseDocRenderConfig(
      rows({
        doc_render_engine: "chromium",
        gotenberg_url: "https://db.example",
        gotenberg_basic_auth_user: "dbuser",
        gotenberg_basic_auth_pass: "dbpass",
      }),
      {
        GOTENBERG_URL: "https://env.example",
        GOTENBERG_BASIC_AUTH_USER: "envuser",
        GOTENBERG_BASIC_AUTH_PASS: "envpass",
      },
    );
    assert.deepEqual(cfg.connection, {
      url: "https://db.example",
      user: "dbuser",
      pass: "dbpass",
    });
  });

  it("uses env connection fields when the DB rows are blank", () => {
    const cfg = parseDocRenderConfig(rows({ doc_render_engine: "chromium" }), {
      GOTENBERG_URL: "https://env.example/",
      GOTENBERG_BASIC_AUTH_USER: "envuser",
      GOTENBERG_BASIC_AUTH_PASS: "envpass",
    });
    assert.equal(cfg.connection.url, "https://env.example");
    assert.equal(cfg.connection.user, "envuser");
  });

  it("strips a trailing slash from the URL (DB or env)", () => {
    const cfg = parseDocRenderConfig(
      rows({ gotenberg_url: "https://db.example/sub/" }),
      NO_ENV,
    );
    assert.equal(cfg.connection.url, "https://db.example/sub");
  });

  it("flags misconfigured when chromium is selected but no URL is available", () => {
    const cfg = parseDocRenderConfig(
      rows({ doc_render_engine: "chromium" }),
      NO_ENV,
    );
    assert.equal(cfg.engine, "chromium");
    assert.equal(cfg.misconfigured, true);
  });

  it("does not flag misconfigured for pdfmake without a URL", () => {
    const cfg = parseDocRenderConfig(
      rows({ doc_render_engine: "pdfmake" }),
      NO_ENV,
    );
    assert.equal(cfg.misconfigured, false);
  });
});
