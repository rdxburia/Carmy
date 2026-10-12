import test from "node:test";
import assert from "node:assert/strict";
import { validateFileSignature } from "../worker/src/file-validation.mjs";

test("accepts JPEG signature and matching extension", () => {
  assert.equal(validateFileSignature("rc.jpg", "image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), true);
});

test("accepts PNG signature and matching extension", () => {
  assert.equal(validateFileSignature("document.png", "image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
});

test("accepts PDF header within the first 1024 bytes", () => {
  const prefix = new TextEncoder().encode("metadata\n%PDF-1.7\n");
  assert.equal(validateFileSignature("policy.pdf", "application/pdf", prefix), true);
});

test("rejects a spoofed JPEG with text content", () => {
  assert.throws(() => validateFileSignature("rc.jpg", "image/jpeg", new TextEncoder().encode("not an image")), /does not match/);
});

test("rejects extension/content-type mismatch", () => {
  assert.throws(() => validateFileSignature("rc.pdf", "image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff])), /extension does not match/);
});

test("rejects an unknown declared type", () => {
  assert.throws(() => validateFileSignature("file.exe", "application/octet-stream", Uint8Array.from([0x00])), /extension does not match/);
});
