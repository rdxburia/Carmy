const textEncoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const input = typeof value === "string" ? textEncoder.encode(value) : value;
  return toHex(await crypto.subtle.digest("SHA-256", input));
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value)));
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function amzDate(date) {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return iso;
}

function shortDate(date) {
  return amzDate(date).slice(0, 8);
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export async function presignR2(env, method, key, expiresIn = 300, contentType = null) {
  if (!env.R2_S3_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 presign configuration is incomplete.");
  }

  const expires = Math.max(1, Math.min(Number(expiresIn) || 300, 604800));
  const now = new Date();
  const date = amzDate(now);
  const dateStamp = shortDate(now);
  const region = "auto";
  const service = "s3";
  const host = new URL(env.R2_S3_ENDPOINT).host;
  const bucket = "carmy-files";
  const canonicalUri = `/${bucket}/${encodePath(key)}`;

  const headers = { host };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${String(headers[name]).trim().replace(/\\s+/g, " ")}\n`)
    .join("");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const query = new URLSearchParams();
  query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  query.set("X-Amz-Credential", `${env.R2_ACCESS_KEY_ID}/${credentialScope}`);
  query.set("X-Amz-Date", date);
  query.set("X-Amz-Expires", String(expires));
  query.set("X-Amz-SignedHeaders", signedHeaderNames.join(";"));
  query.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD");

  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`)
    .join("&");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(textEncoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  query.set("X-Amz-Signature", signature);
  const finalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`)
    .join("&");

  return `${env.R2_S3_ENDPOINT.replace(/\/$/, "")}${canonicalUri}?${finalQuery}`;
}
