import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.staging.toml", import.meta.url), "utf8");

test("staging Worker config never references production resources", () => {
  assert.doesNotMatch(config, /57c85007-[0-9a-f-]{20,}/i, "production D1 database ID must not appear in staging config");
  assert.doesNotMatch(config, /namespace_id\s*=\s*["']?2601008\b/, "production rate-limit namespace must not appear in staging config");
  assert.doesNotMatch(config, /bucket_name\s*=\s*["']carmy-files["']/, "production R2 bucket must not appear in staging config");
});

test("staging Worker config points to isolated staging resources", () => {
  assert.match(config, /database_id\s*=\s*["']803810b8-77d0-42bb-bdd6-7e8b1cc4afdb["']/);
  assert.match(config, /bucket_name\s*=\s*["']carmy-staging-files["']/);
  assert.match(config, /namespace_id\s*=\s*["']2601019["']/);
  assert.match(config, /https:\/\/vejccahjrlwhaniajgez\.supabase\.co/);
});
