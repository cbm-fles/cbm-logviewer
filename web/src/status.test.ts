import { describe, expect, it } from "vitest";
import { describeFilters, liveText, queryText, shortTime } from "./status.js";

describe("the status of a query", () => {
  it("shows the effect of the filters", () => {
    expect(queryText({ shown: 1086, matching: 1086, all: 80520 })).toBe(
      "1,086 of 80,520 messages match",
    );
  });

  it("shows the number alone without an effect of filters", () => {
    expect(queryText({ shown: 80520, matching: 80520, all: 80520 })).toBe(
      "80,520 messages",
    );
    expect(queryText({ shown: 5, matching: 5, all: undefined })).toBe(
      "5 messages",
    );
  });

  it("shows the limit if it is reached", () => {
    expect(queryText({ shown: 100000, matching: 112000, all: 300000 })).toBe(
      "112,000 of 300,000 messages match, the newest 100,000 shown",
    );
    expect(queryText({ shown: 100000, matching: 112000, all: 112000 })).toBe(
      "112,000 messages, the newest 100,000 shown",
    );
  });
});

describe("the status of live mode", () => {
  const now = new Date("2026-11-04T15:00:00Z");
  const since = "2026-11-04T14:02:11.123456Z";
  const c = { since, limit: 100000, utc: true, now };

  it("shows the effect of the filters since the oldest message", () => {
    expect(liveText({ ...c, shown: 1086, all: 52310 })).toBe(
      "1,086 of 52,310 messages since 14:02:11 match",
    );
    expect(liveText({ ...c, shown: 52310, all: 52310 })).toBe(
      "52,310 messages since 14:02:11",
    );
    expect(liveText({ ...c, shown: 10, all: undefined })).toBe(
      "10 messages since 14:02:11",
    );
    expect(liveText({ ...c, shown: 0, all: 0, since: undefined })).toBe(
      "0 messages",
    );
  });

  it("shows the limit if it is reached", () => {
    expect(liveText({ ...c, shown: 100000, all: 400000 })).toBe(
      "the newest 100,000 messages since 14:02:11",
    );
  });

  it("shows the date of an older start", () => {
    expect(shortTime("2026-11-03T23:59:59.5Z", true, now)).toBe(
      "2026-11-03 23:59:59",
    );
  });
});

describe("the filters in the status", () => {
  it("are described by column", () => {
    expect(
      describeFilters({
        message: { match: "", exclude: "*shared memory*" },
        host: { match: " node9, node1* ", exclude: "" },
        service: { match: " , ", exclude: "" },
      }),
    ).toEqual(["Host node9, node1*", "not Message *shared memory*"]);
  });
});
