const MIME_BY_EXTENSION = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
]);

const SIGNATURES = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function validateFileSignature(fileName, mimeType, bytes) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase() || "";
  if (MIME_BY_EXTENSION.get(extension) !== mimeType) {
    throw new Error("File extension does not match its declared content type.");
  }

  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (mimeType === "application/pdf") {
    // PDF readers permit a header within the first 1024 bytes.
    const header = new TextDecoder("ascii").decode(data.subarray(0, 1024));
    if (!header.includes("%PDF-")) throw new Error("File content is not a valid PDF signature.");
    return true;
  }

  const signature = SIGNATURES[mimeType];
  if (!signature || data.length < signature.length ||
      !signature.every((byte, index) => data[index] === byte)) {
    throw new Error("File content does not match its declared content type.");
  }
  return true;
}
