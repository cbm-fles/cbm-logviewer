import { expect, test } from "@playwright/test";

const status = (page: import("@playwright/test").Page) =>
  page.locator(".state");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(status(page)).toHaveText(/^42 of 42 messages/, {
    timeout: 10000,
  });
});

test("filters by match and exclude, applied with Enter", async ({ page }) => {
  const match = page.getByLabel("Match message");
  await match.fill("warning");
  await expect(status(page)).toHaveText(/^42 of 42/);
  await match.press("Enter");
  await expect(status(page)).toHaveText(/^2 of 2/);
  await page.getByLabel("Exclude message").fill("first");
  await page.getByLabel("Exclude message").press("Enter");
  await expect(status(page)).toHaveText(/^1 of 1/);
  await expect(
    page.getByRole("cell", { name: "second warning" }),
  ).toBeVisible();

  // in the URL, and back from it
  expect(new URL(page.url()).search).toBe("?message=warning&-message=first");
  await page.reload();
  await expect(status(page)).toHaveText(/^1 of 1/);
  await expect(page.getByLabel("Match message")).toHaveValue("warning");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(status(page)).toHaveText(/^42 of 42/);
  expect(new URL(page.url()).search).toBe("");
});

test("opens a link with filters", async ({ page }) => {
  await page.goto("/?severities=13&host=node0*");
  await expect(status(page)).toHaveText(/^2 of 2/);
  await expect(
    page.getByRole("button", { name: "INFO", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Match host")).toHaveValue("node0*");
});

test("shows a message in the inspector and filters on its fields", async ({
  page,
}) => {
  await page.getByRole("cell", { name: "second warning" }).click();
  const inspector = page.getByRole("complementary", { name: "Message" });
  await expect(inspector).toContainText("WARN");
  await expect(inspector).toContainText("tsclient");
  // the severity is filtered by the buttons above
  await expect(
    inspector.getByRole("button", { name: "Match this Severity" }),
  ).toHaveCount(0);
  await inspector.getByRole("button", { name: "Match this Message" }).click();
  await expect(status(page)).toHaveText(/^1 of 1/);
  await expect(page.getByLabel("Match message")).toHaveValue("second warning");
  await inspector.getByRole("button", { name: "Close" }).click();
  await expect(inspector).toHaveCount(0);
});

test("filters from the menu of a cell", async ({ page }) => {
  const cell = page
    .getByRole("row")
    .filter({ hasText: "status 7" })
    .getByRole("cell")
    .nth(2);
  const host = await cell.innerText();
  await cell.click({ button: "right" });
  await expect(page.getByRole("menu", { name: `Host: ${host}` })).toBeVisible();
  await page.getByRole("menuitem", { name: "Exclude this value" }).click();
  await expect(page.getByLabel("Exclude host")).toHaveValue(host);
  await expect(status(page)).not.toHaveText(/^42 of 42/);
  await expect(page.getByRole("row").filter({ hasText: host })).toHaveCount(0);
});

test("moves the selection with the keyboard", async ({ page }) => {
  await page.getByRole("cell", { name: "status 39" }).click();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("complementary", { name: "Message" }),
  ).toContainText("status 38");
  await page.keyboard.press("Home");
  await expect(page.getByRole("row", { selected: true })).toContainText(
    "status 0",
  );
  await expect(page.getByRole("row", { selected: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { selected: true })).toHaveCount(0);
});

test("downloads the messages", async ({ page }) => {
  await page.getByRole("button", { name: "Download" }).click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /CSV/ }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^logs-.*\.csv$/);
  const text = await (await csv.createReadStream()).toArray();
  const lines = Buffer.concat(text).toString().trim().split("\r\n");
  expect(lines[0]).toBe("Time,Severity,Host,Service,Timeslice,Message");
  expect(lines).toHaveLength(43);

  await page.getByRole("button", { name: "Download" }).click();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /JSON/ }).click(),
  ]);
  const body = Buffer.concat(
    await (await json.createReadStream()).toArray(),
  ).toString();
  expect(
    body
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).message),
  ).toContain("first warning");
});
