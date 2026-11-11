import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Accepted document types, each with a check of the file's actual first bytes. */
export const DOC_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => String.fromCharCode(...b.slice(0, 5)) === "%PDF-",
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/webp": (b) => String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "text/csv": (b) => !b.slice(0, 2048).some((x) => x === 0),
  // Office files are zip containers (PK\x03\x04); old .xls/.ppt are OLE (D0 CF 11 E0).
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/vnd.ms-excel": (b) => b[0] === 0xd0 && b[1] === 0xcf,
  "application/vnd.ms-powerpoint": (b) => b[0] === 0xd0 && b[1] === 0xcf,
};

/**
 * Check an upload that went straight from the browser to Storage: the bytes
 * must match the declared type, stay under 25 MB, and PDFs can't carry
 * scripts. Anything that fails is deleted.
 */
export async function verifyStoredUpload(bucket: string, path: string, mime: string): Promise<{ bytes?: Uint8Array; error?: string }> {
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(bucket).download(path);
  if (error || !blob) return { error: "Upload not found. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const check = DOC_TYPES[mime];
  if (!check || !check(bytes) || bytes.length > 25 * 1024 * 1024 || (mime === "application/pdf" && /\/(JavaScript|JS|Launch|OpenAction|EmbeddedFile)\b/.test(new TextDecoder("latin1").decode(bytes)))) {
    await admin.storage.from(bucket).remove([path]);
    return { error: "That file type isn't accepted, or the file doesn't match its type. PDFs can't contain scripts." };
  }
  return { bytes };
}
