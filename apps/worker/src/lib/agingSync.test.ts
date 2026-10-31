import { describe, expect, it } from "vitest";
import { isSendLikeChaseStatus, MEMBER_REPLACE_DELETE_LIMIT, replaceMayDelete, sodSafeChaseFields } from "./agingSync";

const sent = { status: "sent", at: "2026-10-01T00:00:00Z" };

describe("isSendLikeChaseStatus", () => {
  it("recognises statuses that claim a send", () => {
    for (const s of ["sent", "copied", "mailto", "tracked_copy", " SENT "]) expect(isSendLikeChaseStatus(s)).toBe(true);
  });
  it("leaves drafts and empty values alone", () => {
    for (const s of ["drafted", "multi-drafted", "", null, undefined]) expect(isSendLikeChaseStatus(s)).toBe(false);
  });
});

describe("sodSafeChaseFields", () => {
  it("does not let a sync claim a send on a new invoice", () => {
    expect(sodSafeChaseFields(sent, undefined)).toEqual({ status: null, at: null });
  });
  it("does not let a sync upgrade a draft to sent", () => {
    const drafted = { status: "drafted", at: "2026-09-01T00:00:00Z" };
    expect(sodSafeChaseFields(sent, drafted)).toEqual(drafted);
  });
  it("keeps an approved send through a replace sync", () => {
    expect(sodSafeChaseFields({ status: null, at: null }, sent)).toEqual(sent);
    expect(sodSafeChaseFields({ status: "drafted", at: "x" }, sent)).toEqual(sent);
  });
  it("passes non-send statuses through", () => {
    const drafted = { status: "drafted", at: "x" };
    expect(sodSafeChaseFields(drafted, { status: null, at: null })).toEqual(drafted);
  });
});

describe("replaceMayDelete", () => {
  const stored = Array.from({ length: 50 }, (_, i) => `inv-${i}`);

  it("always lets admins replace", () => {
    expect(replaceMayDelete("admin", stored, [])).toBe(true);
  });
  it("lets a member remove a few invoices, which is how the tool deletes", () => {
    expect(replaceMayDelete("member", stored, stored.slice(MEMBER_REPLACE_DELETE_LIMIT))).toBe(true);
  });
  it("stops a member's sync from wiping the workspace", () => {
    expect(replaceMayDelete("member", stored, [])).toBe(false);
    expect(replaceMayDelete("member", stored, stored.slice(MEMBER_REPLACE_DELETE_LIMIT + 1))).toBe(false);
  });
});
