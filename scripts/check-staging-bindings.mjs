import { readFileSync } from "node:fs";

const path = "wrangler.staging.toml";
const config = readFileSync(path, "utf8");
const forbidden = [
  ["production D1", "57c85007-1cf7-470f-bb4d-3b28cbb555b7"],
  ["production rate-limit namespace", "2601008"],
  ["production R2 bucket", 'bucket_name = "carmy-files"'],
  ["production Supabase project", "https://hlrmuvzmaegnbgzvvfsn.supabase.co"],
];
const missingStaging = [
  ["staging D1", "803810b8-77d0-42bb-bdd6-7e8b1cc4afdb"],
  ["staging rate-limit namespace", "2601019"],
  ["staging R2 bucket", 'bucket_name = "carmy-staging-files"'],
  ["staging Supabase project", "https://vejccahjrlwhaniajgez.supabase.co"],
];
const failures = [];
for (const [label, value] of forbidden) {
  if (config.includes(value)) failures.push(`Forbidden ${label} found in ${path}`);
}
for (const [label, value] of missingStaging) {
  if (!config.includes(value)) failures.push(`Expected ${label} not found in ${path}`);
}
if (!/^name = "carmy-api-staging"$/m.test(config)) {
  failures.push(`Worker name is not carmy-api-staging in ${path}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS: staging Worker config contains only the expected staging resource identifiers.");
