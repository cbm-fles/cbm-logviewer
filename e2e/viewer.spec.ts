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
  await expect(page.locator(".state")).toHaveText(/^Live · 0 messages/);
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
