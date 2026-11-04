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
  await page.getByRole("menuitem", { name: "Exclude", exact: true }).click();
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
  expect(lines[0]).toBe(
    "Time,Severity,Host,Service,Instance,Timeslice,Message",
  );
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

test("shows and filters the instance, which not all messages have", async ({
  page,
}) => {
  const row = (text: string) => page.getByRole("row").filter({ hasText: text });
  await expect(row("status 7").getByRole("cell").nth(4)).toHaveText("1");
  await expect(row("second warning").getByRole("cell").nth(4)).toHaveText("");

  await page.getByLabel("Match instance").fill("1");
  await page.getByLabel("Match instance").press("Enter");
  await expect(status(page)).toHaveText(/^20 of 20/);
  await page.getByLabel("Match instance").fill("");
  await page.getByLabel("Exclude instance").fill("1");
  await page.getByLabel("Exclude instance").press("Enter");
  // instance 0 and the warnings without an instance
  await expect(status(page)).toHaveText(/^22 of 22/);
  await expect(
    page.getByRole("cell", { name: "second warning" }),
  ).toBeVisible();

  // an empty cell offers no filter on its value, but clearing the filter
  await row("second warning")
    .getByRole("cell")
    .nth(4)
    .click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Copy" })).toBeEnabled();
  await expect(
    page.getByRole("menuitem", { name: "Match", exact: true }),
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Clear filter" }).click();
  await expect(status(page)).toHaveText(/^42 of 42/);
});

test("closes the inspector when its message is filtered out", async ({
  page,
}) => {
  await page.getByRole("cell", { name: "first warning" }).click();
  const inspector = page.getByRole("complementary", { name: "Message" });
  await expect(inspector).toBeVisible();
  await page.getByLabel("Exclude message").fill("first");
  await page.getByLabel("Exclude message").press("Enter");
  await expect(status(page)).toHaveText(/^41 of 41/);
  await expect(inspector).toHaveCount(0);
});

test("shows the message of a cell in the inspector from its menu", async ({
  page,
}) => {
  await page.getByRole("cell", { name: "status 3", exact: true }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Inspect" }).click();
  await expect(
    page.getByRole("complementary", { name: "Message" }),
  ).toContainText("status 3");
});

test("lists all filters in a panel, also of hidden columns", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  await page.getByLabel("Match host").fill("node0*");
  await page.getByLabel("Match host").press("Enter");
  await expect(page.locator(".filter-count")).toHaveText("1 filter active");

  // a filter of a hidden column, from the panel
  await page.getByRole("button", { name: "Edit" }).click();
  const panel = page.getByRole("region", { name: "Filters" });
  await expect(panel.getByLabel("Match Host in all filters")).toHaveValue(
    "node0*",
  );
  await expect(panel).toContainText("PID (hidden)");
  await panel.getByLabel("Exclude Message in all filters").fill("status*");
  await panel.getByRole("button", { name: "Apply" }).click();
  await expect(status(page)).toHaveText(/^2 of 2/);
  await expect(page.locator(".filter-count")).toHaveText("2 filters active");
  // the same filter under the column header
  await expect(page.getByLabel("Exclude message", { exact: true })).toHaveValue(
    "status*",
  );

  await panel.getByRole("button", { name: "Clear all" }).click();
  await expect(status(page)).toHaveText(/^42 of 42/);
  await expect(page.locator(".filter-count")).toHaveCount(0);
  await panel.getByRole("button", { name: "Close filters" }).click();
  await expect(panel).toHaveCount(0);
});
