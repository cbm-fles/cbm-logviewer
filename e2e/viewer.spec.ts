import { expect, test } from "@playwright/test";
import { message, write } from "./opensearch.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/of [\d,]+ messages/)).toBeVisible();
});

test("shows the messages of the last hour, without debug", async ({ page }) => {
  await expect(page.getByText("42 of 42 messages")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "second warning" }),
  ).toHaveClass(/sev-row-WARN/);
  // the newest message is in view
  await expect(page.getByRole("cell", { name: "status 39" })).toBeInViewport();
  await expect(page.locator(".counts")).toHaveText(/INFO 40\s*WARN 2/);
});

test("filters by severity", async ({ page }) => {
  await page.getByRole("button", { name: "INFO", exact: true }).click();
  await page.getByRole("button", { name: "DEBUG", exact: true }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("7 of 7 messages")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "status 1", exact: true }),
  ).toHaveCount(0);
});

test("shows and hides columns", async ({ page }) => {
  await expect(page.getByRole("columnheader", { name: "PID" })).toHaveCount(0);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "PID" }).click();
  await expect(page.getByRole("columnheader", { name: "PID" })).toBeVisible();
  await page.getByRole("menuitemcheckbox", { name: "Host" }).click();
  await expect(page.getByRole("columnheader", { name: "Host" })).toHaveCount(0);
  // kept after a reload
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "PID" })).toBeVisible();
});

test("shows new messages in live mode", async ({ page }) => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  // first the newest messages there are
  await expect(page.locator(".state")).toHaveText(/^Live · 42 messages/);
  await expect(page.getByRole("cell", { name: "status 39" })).toBeInViewport();
  await write(
    message("arrived live", [17, "ERROR"], 0),
    message("debug live", [5, "DEBUG"], 0),
  );
  await expect(
    page.getByRole("row").filter({ hasText: "arrived live" }),
  ).toHaveClass(/sev-row-ERROR/);
  await expect(page.getByText("debug live")).toHaveCount(0);

  // paused, new messages wait
  await page.getByRole("button", { name: "Pause" }).click();
  await write(message("while paused", [9, "INFO"], 0));
  await expect(page.locator(".state")).toHaveText(/paused, 1 new/);
  await expect(page.getByText("while paused")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("while paused")).toBeVisible();
});

test("applies filters in live mode to the messages shown", async ({ page }) => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".state")).toHaveText(/^Live · \d+ messages/);
  await expect(
    page.getByRole("cell", { name: "second warning" }),
  ).toBeVisible();

  await page
    .getByRole("cell", { name: "second warning" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Exclude this value" }).click();
  await expect(page.getByRole("cell", { name: "second warning" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("cell", { name: "first warning" })).toBeVisible();

  // and to new ones
  await write(
    message("second warning", [13, "WARN"], 0),
    message("third warning", [13, "WARN"], 0),
  );
  await expect(page.getByRole("cell", { name: "third warning" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "second warning" })).toHaveCount(
    0,
  );
});

test("resizes and moves columns", async ({ page }) => {
  const header = (name: string) =>
    page.getByRole("columnheader", { name, exact: true });
  const box = async (name: string) => (await header(name).boundingBox())!;

  // Message takes the remaining width, and can be made narrower
  const before = await box("Message");
  const resizer = page.getByRole("separator", { name: "Resize Message" });
  const r = (await resizer.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x - 200, r.y + r.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await box("Message")).width).toBeCloseTo(before.width - 200, -1);
  await resizer.dblclick();
  expect((await box("Message")).width).toBeCloseTo(before.width, -1);

  // Host before Time
  await header("Host")
    .locator(".th-label")
    .dragTo(header("Time"), {
      targetPosition: { x: 5, y: 10 },
    });
  const names = await page
    .getByRole("columnheader")
    .evaluateAll((hs) => hs.map((h) => h.getAttribute("aria-label")));
  expect(names.slice(0, 3)).toEqual(["Host", "Time", "Severity"]);
  await page.reload();
  await expect(page.getByRole("columnheader").first()).toHaveAttribute(
    "aria-label",
    "Host",
  );

  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("button", { name: "Reset columns" }).click();
  await expect(page.getByRole("columnheader").first()).toHaveAttribute(
    "aria-label",
    "Time",
  );
});
