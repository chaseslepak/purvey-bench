/**
 * Server-side checks on uploaded bytes. The browser's file type and name are
 * never trusted: we look at the content.
 */
export const LOGO_MAX = 2 * 1024 * 1024;
export const DOC_MAX = 10 * 1024 * 1024;

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

export function sniffImage(bytes: Uint8Array): LogoType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  return null; // SVG and everything else are refused (SVG can carry script).
}

/**
 * PDFs must start with %PDF- and contain no active content. Rather than try
 * to strip scripts (fragile), we refuse files that contain JavaScript,
 * launch actions, auto-run actions or embedded files.
 */
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA|SubmitForm|ImportData)\b/;

export function checkPdf(bytes: Uint8Array): { ok: true } | { ok: false; reason: string } {
  if (bytes.length < 5 || ascii(bytes, 0, 5) !== "%PDF-") return { ok: false, reason: "That file isn't a PDF." };
  if (ACTIVE_PDF.test(latin1(bytes))) {
    return { ok: false, reason: "This PDF contains scripts or embedded actions, which we don't accept. Re-save it with “Print to PDF” and upload it again." };
  }
  return { ok: true };
}

function ascii(b: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...b.slice(start, end));
}
function latin1(b: Uint8Array) {
  return new TextDecoder("latin1").decode(b);
}
