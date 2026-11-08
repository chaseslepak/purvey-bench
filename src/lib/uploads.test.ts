import { describe, expect, it } from "vitest";
import { checkPdf, sniffImage } from "./uploads";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("recognises PNG, JPEG and WebP by content", () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(enc("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("refuses SVG and renamed files", () => {
    expect(sniffImage(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(enc("%PDF-1.7"))).toBeNull();
  });
});

describe("checkPdf", () => {
  it("accepts a plain PDF", () => {
    expect(checkPdf(enc("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"))).toEqual({ ok: true });
  });
  it("refuses non-PDFs and PDFs with active content", () => {
    expect(checkPdf(enc("hello")).ok).toBe(false);
    for (const bad of ["/JavaScript (app.alert(1))", "/JS (x)", "/OpenAction 5 0 R", "/Launch << >>", "/EmbeddedFile 3 0 R"]) {
      expect(checkPdf(enc(`%PDF-1.7\n1 0 obj << ${bad} >> endobj`)).ok).toBe(false);
    }
  });
});
