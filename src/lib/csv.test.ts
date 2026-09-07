import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Astaldi")).toBe("Astaldi");
    expect(csvCell(12.5)).toBe("12.5");
  });

  it("writes a flag as true or false, not 1 or 0", () => {
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });

  it("writes an empty cell for an unmeasured value", () => {
    // A blank is not a zero: a firm with no measured slip has no figure, and
    // writing 0 would make it look on time in every spreadsheet downstream.
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes and escapes anything that would break the row", () => {
    expect(csvCell("Geiger, Max Bögl")).toBe('"Geiger, Max Bögl"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("does not quote an en dash, which is ordinary text here", () => {
    expect(csvCell("Sebeș–Turda")).toBe("Sebeș–Turda");
  });
});

describe("toCsv", () => {
  it("writes the header then one line per row", () => {
    const csv = toCsv(
      ["id", "lots"],
      [
        ["astaldi", 3],
        ["umb", 11],
      ],
    );
    expect(csv).toBe("id,lots\nastaldi,3\numb,11\n");
  });

  it("ends with a newline so the file concatenates cleanly", () => {
    expect(toCsv(["a"], [["x"]]).endsWith("\n")).toBe(true);
  });

  it("writes a header even with no rows", () => {
    expect(toCsv(["id", "lots"], [])).toBe("id,lots\n");
  });
});
