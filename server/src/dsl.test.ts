import { describe, expect, it } from "vitest";
import { FilterError, buildQuery } from "./dsl.js";

describe("buildQuery", () => {
  it("matches all without filters", () => {
    expect(buildQuery({})).toEqual({ match_all: {} });
  });

  it("filters the time range", () => {
    expect(buildQuery({ from: "now-1h" })).toEqual({
      bool: { filter: [{ range: { "@timestamp": { gte: "now-1h" } } }] },
    });
  });

  it("filters severities by their code ranges", () => {
    expect(buildQuery({ severities: [13, 17] })).toEqual({
      bool: {
        filter: [
          {
            bool: {
              should: [
                { range: { severity_code: { gte: 13, lte: 16 } } },
                { range: { severity_code: { gte: 17, lte: 20 } } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    });
  });

  it("rejects unknown severities", () => {
    expect(() => buildQuery({ severities: [12] })).toThrow(FilterError);
  });

  it("matches keyword values and wildcards", () => {
    expect(
      buildQuery({ fields: { host: { match: ["node01", "node1*"] } } }),
    ).toEqual({
      bool: {
        filter: [
          {
            bool: {
              should: [
                { term: { host: "node01" } },
                {
                  wildcard: {
                    host: { value: "node1*", case_insensitive: true },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    });
  });

  it("excludes values", () => {
    expect(
      buildQuery({ fields: { service: { exclude: ["tsclient"] } } }),
    ).toEqual({ bool: { must_not: [{ term: { service: "tsclient" } }] } });
  });

  it("matches phrases in text fields", () => {
    expect(
      buildQuery({
        fields: {
          message: { match: ["build timeout"] },
          data: { match: ["1001"] },
        },
      }),
    ).toEqual({
      bool: {
        filter: [
          { match_phrase: { message: "build timeout" } },
          { match_phrase: { data_text: "1001" } },
        ],
      },
    });
  });

  it("matches integers exactly", () => {
    expect(
      buildQuery({ fields: { timeslice: { match: ["17900000123"] } } }),
    ).toEqual({ bool: { filter: [{ term: { timeslice: "17900000123" } }] } });
    expect(() => buildQuery({ fields: { pid: { match: ["12*"] } } })).toThrow(
      FilterError,
    );
  });
});
