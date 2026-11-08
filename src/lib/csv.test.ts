import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes, escapes and neutralises formulas", () => {
    const csv = toCsv([{ a: 'He said "hi"', b: '=HYPERLINK("x")', c: null }, { a: "x,y", b: "-5", c: { k: 1 } }], ["a", "b", "c"]);
    expect(csv).toBe('a,b,c\r\n"He said ""hi""","\'=HYPERLINK(""x"")",\r\n"x,y",\'-5,"{""k"":1}"\r\n');
  });
});
