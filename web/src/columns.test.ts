import { describe, expect, it } from "vitest";
import { defaultColumns, move, normalize, shown, width } from "./columns.js";

describe("columns", () => {
  it("are shown in their order", () => {
    expect(shown(defaultColumns)).toEqual([
      "@timestamp",
      "severity_text",
      "host",
      "service",
      "instance",
      "timeslice",
      "message",
    ]);
  });

  it("have default widths until set", () => {
    expect(width(defaultColumns, "host")).toBe(80);
    expect(width({ ...defaultColumns, widths: { host: 150 } }, "host")).toBe(
      150,
    );
  });

  it("move before another one or to the end", () => {
    const order = ["a", "b", "c", "d"];
    expect(move(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(move(order, "a", "c")).toEqual(["b", "a", "c", "d"]);
    expect(move(order, "b", undefined)).toEqual(["a", "c", "d", "b"]);
    expect(move(order, "b", "b")).toBe(order);
    expect(move(order, "b", "x")).toBe(order);
  });
});

describe("stored columns", () => {
  it("are the default if there are none", () => {
    expect(normalize(undefined)).toEqual(defaultColumns);
  });

  it("drop unknown fields and add new ones", () => {
    const order = defaultColumns.order.filter((id) => id !== "host");
    const columns = normalize({
      order: ["nofield", "message", ...order.filter((id) => id !== "message")],
      visible: { host: false, nofield: true },
      widths: { message: 600, nofield: 100, pid: 10 },
    });
    expect(columns.order.slice(0, 4)).toEqual([
      "message",
      "@timestamp",
      "host",
      "severity_text",
    ]);
    expect(columns.order).toHaveLength(defaultColumns.order.length);
    expect(columns.visible.host).toBe(false);
    expect(columns.widths).toEqual({ message: 600 });
  });
});
