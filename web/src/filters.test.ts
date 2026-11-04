import { describe, expect, it } from "vitest";
import {
  addPattern,
  countFilters,
  defaultView,
  literalPattern,
  liveFilters,
  parsePatterns,
  queryFilters,
  viewFromSearch,
  viewToSearch,
} from "./filters.js";

describe("patterns", () => {
  it("are separated by commas", () => {
    expect(parsePatterns(" node1*, node02 ,,")).toEqual(["node1*", "node02"]);
    expect(parsePatterns("")).toEqual([]);
  });

  it("can be quoted", () => {
    expect(parsePatterns('"a, b", c, "say ""hi""" , ""')).toEqual([
      "a, b",
      "c",
      'say "hi"',
    ]);
  });

  it("match values exactly", () => {
    expect(literalPattern("node01")).toBe("node01");
    expect(literalPattern("15: * checked 5 ts, 30 c")).toBe(
      '"15: \\* checked 5 ts, 30 c"',
    );
    expect(literalPattern('a "b"? c\\d')).toBe('"a ""b""\\? c\\\\d"');
    const value = 'x, "y" * z';
    expect(parsePatterns(addPattern("node01", literalPattern(value)))).toEqual([
      "node01",
      'x, "y" \\* z',
    ]);
  });

  it("are added once", () => {
    expect(addPattern("", "node01")).toBe("node01");
    expect(addPattern("node01", "node02")).toBe("node01, node02");
    expect(addPattern("node01, node02", "node01")).toBe("node01, node02");
  });
});

describe("filters", () => {
  it("of the default view are the time range and severities", () => {
    expect(queryFilters(defaultView)).toEqual({
      from: "now-1h",
      severities: [9, 11, 13, 17, 21],
    });
  });

  it("leave out severities if all are chosen", () => {
    const view = { ...defaultView, severities: [1, 5, 9, 11, 13, 17, 21] };
    expect(liveFilters(view)).toEqual({});
  });

  it("have the patterns of the fields", () => {
    const view = {
      ...defaultView,
      fields: {
        host: { match: "node1*, node02", exclude: "" },
        service: { match: "", exclude: "tsclient" },
        message: { match: " ", exclude: "" },
      },
    };
    expect(liveFilters(view).fields).toEqual({
      host: { match: ["node1*", "node02"] },
      service: { exclude: ["tsclient"] },
    });
  });
});

describe("the number of filters", () => {
  it("counts match and exclude with patterns", () => {
    expect(countFilters({})).toBe(0);
    expect(
      countFilters({
        host: { match: "node1*", exclude: "node12" },
        service: { match: " , ", exclude: "" },
        message: { match: "", exclude: "x" },
      }),
    ).toBe(3);
  });
});

describe("the URL of a view", () => {
  it("is empty for the default view", () => {
    expect(viewToSearch(defaultView)).toBe("");
    expect(viewFromSearch("")).toEqual(defaultView);
  });

  it("has what differs from the default", () => {
    const view = {
      ...defaultView,
      mode: "live" as const,
      severities: [13, 17, 21],
      fields: {
        host: { match: "node1*", exclude: "" },
        service: { match: "", exclude: "tsclient" },
      },
    };
    const search = viewToSearch(view);
    expect(search).toBe(
      "?mode=live&severities=13%2C17%2C21&host=node1*&-service=tsclient",
    );
    expect(viewFromSearch(search)).toEqual(view);
  });

  it("has a custom time range", () => {
    const view = {
      ...defaultView,
      range: "custom" as const,
      customFrom: "2026-11-04T10:00",
      customTo: "2026-11-04T11:00",
    };
    expect(viewFromSearch(viewToSearch(view))).toEqual(view);
  });

  it("ignores what it does not know", () => {
    expect(
      viewFromSearch("?mode=x&range=1y&severities=12,13&nofield=1"),
    ).toEqual({
      ...defaultView,
      severities: [13],
    });
  });
});
