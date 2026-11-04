import { message, reset, write } from "./opensearch.js";

const info: [number, string] = [9, "INFO"];
const warn: [number, string] = [13, "WARN"];
const debug: [number, string] = [5, "DEBUG"];

// 40 status messages of the instances 0 and 1, 2 warnings and 5 debug messages within the last 20 min
export default async function globalSetup() {
  await reset();
  await write(
    ...Array.from({ length: 40 }, (_, i) =>
      message(`status ${i}`, info, 30000 * (40 - i), String(i % 2)),
    ),
    message("first warning", warn, 600000),
    message("second warning", warn, 300000),
    ...Array.from({ length: 5 }, (_, i) =>
      message(`debug ${i}`, debug, 60000 * (i + 1)),
    ),
  );
}
