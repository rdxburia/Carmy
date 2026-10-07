import { presignR2 } from "./r2-signing.js";
import { supabaseRest } from "./supabase.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png"]);

function safeName(name) {
  return String(name || "document")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-180);
}

function assertCarId(carId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(carId || ""))) {
    throw new Error("Invalid vehicle ID.");
  }
}

async function verifyCar(env, user, userToken, carId) {
  assertCarId(carId);
  const rows = await supabaseRest(
    env,
    `cars?select=id&user_id=eq.${encodeURIComponent(user.id)}&id=eq.${encodeURIComponent(carId)}&limit=1`,
    { method: "GET" },
    userToken
  );
  if (!Array.isArray(rows) || !rows[0]) {
    const err = new Error("Vehicle not found.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
}

async function getDocument(env, user, userToken, documentId, carId = null) {
  if (!/^[0-9a-f-]{36}$/i.test(String(documentId || ""))) {
    throw new Error("Invalid document ID.");
  }

  const filters = [
    `id=eq.${encodeURIComponent(documentId)}`,
    `user_id=eq.${encodeURIComponent(user.id)}`,
  ];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  const rows = await supabaseRest(
    env,
    `documents?select=*&${filters.join("&")}&limit=1`,
    { method: "GET" },
    userToken
  );

  if (!Array.isArray(rows) || !rows[0]) {
    const err = new Error("Document not found.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  return rows[0];
}

function validateUploadInput(input) {
  const carId = String(input?.car_id || "");
  const fileName = safeName(input?.file_name);
  const mimeType = String(input?.mime_type || "");
  const fileSize = Number(input?.file_size || 0);
  const documentType = String(input?.document_type || "other");

  assertCarId(carId);
  if (!fileName || fileName.length > 180) throw new Error("Invalid file name.");
  if (!ALLOWED_MIME.has(mimeType)) throw new Error("Unsupported file type.");
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new Error("File size must be between 1 byte and 10 MB.");
  }

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXT.has(ext)) throw new Error("Unsupported file extension.");
  if (!["rc", "puc", "insurance", "other"].includes(documentType)) {
    throw new Error("Invalid document type.");
  }

  return { carId, fileName, mimeType, fileSize, documentType };
}

export async function presignUpload(env, user, userToken, input) {
  const data = validateUploadInput(input);
  await verifyCar(env, user, userToken, data.carId);

  const pendingKey = `pending/${user.id}/${data.carId}/${crypto.randomUUID()}-${data.fileName}`;
  const uploadUrl = await presignR2(env, "PUT", pendingKey, 300, data.mimeType);

  return {
    upload_url: uploadUrl,
    pending_key: pendingKey,
    expires_in: 300,
    storage_backend: "r2",
  };
}

export async function finalizeUpload(env, user, userToken, input) {
  const pendingKey = String(input?.pending_key || "");
  const carId = String(input?.car_id || "");

  assertCarId(carId);
  await verifyCar(env, user, userToken, carId);

  const expectedPrefix = `pending/${user.id}/${carId}/`;
  if (!pendingKey.startsWith(expectedPrefix) || pendingKey.includes("..")) {
    throw new Error("Invalid pending object path.");
  }

  const object = await env.R2.get(pendingKey);
  if (!object || !("body" in object) || !object.body) {
    const err = new Error("Uploaded R2 object was not found.");
    err.status = 404;
    err.code = "UPLOAD_NOT_FOUND";
    throw err;
  }

  // Enforce the same limits again at finalization. The client controls the
  // initial file_size metadata, so it must never be treated as authoritative.
  if (Number(object.size) <= 0 || Number(object.size) > MAX_FILE_SIZE) {
    await env.R2.delete(pendingKey);
    throw new Error("Uploaded file exceeds the 10 MB limit.");
  }

  const uploadedContentType = String(object.httpMetadata?.contentType || "");
  if (!ALLOWED_MIME.has(uploadedContentType)) {
    await env.R2.delete(pendingKey);
    throw new Error("Uploaded file type is not allowed.");
  }

  const finalKey = pendingKey.replace(/^pending\//, "documents/");
  const saved = await env.R2.put(finalKey, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: {
      ...(object.customMetadata || {}),
      car_id: carId,
      user_id: user.id,
    },
  });

  if (!saved) throw new Error("R2 finalization failed.");

  await env.R2.delete(pendingKey);

  return {
    storage_path: finalKey,
    storage_backend: "r2",
    size: saved.size,
    etag: saved.httpEtag || saved.etag || null,
  };
}

export async function presignDownload(env, user, userToken, documentId, carId) {
  const doc = await getDocument(env, user, userToken, documentId, carId);
  if ((doc.storage_backend || "supabase") !== "r2") {
    const err = new Error("This document is stored in legacy Supabase Storage.");
    err.status = 409;
    err.code = "LEGACY_STORAGE";
    throw err;
  }

  const key = String(doc.storage_path || "");
  const prefix = `documents/${user.id}/${doc.car_id}/`;
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new Error("Document storage path verification failed.");
  }

  return {
    url: await presignR2(env, "GET", key, 300),
    expires_in: 300,
  };
}

export async function deleteR2Document(env, user, userToken, documentId, carId) {
  const doc = await getDocument(env, user, userToken, documentId, carId);
  if ((doc.storage_backend || "supabase") !== "r2") {
    const err = new Error("This document is stored in legacy Supabase Storage.");
    err.status = 409;
    err.code = "LEGACY_STORAGE";
    throw err;
  }

  const key = String(doc.storage_path || "");
  const prefix = `documents/${user.id}/${doc.car_id}/`;
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new Error("Document storage path verification failed.");
  }

  // Delete the R2 object first. The document was already ownership-checked above.
  await env.R2.delete(key);

  // Remove metadata only after the R2 object deletion succeeds.
  // This keeps the operation atomic from the frontend's point of view.
  const deletedRows = await supabaseRest(
    env,
    `documents?id=eq.${encodeURIComponent(documentId)}&user_id=eq.${encodeURIComponent(user.id)}&car_id=eq.${encodeURIComponent(carId)}&storage_backend=eq.r2`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
    userToken
  );

  return {
    deleted: true,
    database_deleted: Array.isArray(deletedRows) ? deletedRows.length > 0 : false,
    storage_path: key,
  };
}
