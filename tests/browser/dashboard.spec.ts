import { test, expect, type Page } from "@playwright/test";
const cards = ["hero", "french", "health", "activity", "focus"];
const pages = ["Progress", "French", "Health", "Activity", "Focus"];
async function contain(page: Page, label: string) {
  const problems = await page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (
      root.scrollHeight > innerHeight + 1 ||
      root.scrollWidth > innerWidth + 1
    )
      problems.push(
        `page ${root.scrollWidth}x${root.scrollHeight} > ${innerWidth}x${innerHeight}`,
      );
    for (const e of document.querySelectorAll<HTMLElement>(
      ".card,.card-body,.overview-card,.dialog-body",
    )) {
      if (!e.getClientRects().length) continue;
      const r = e.getBoundingClientRect();
      if (
        r.bottom > innerHeight + 2 ||
        r.right > innerWidth + 2 ||
        r.left < -2 ||
        r.top < -2
      )
        problems.push(`${e.className} outside viewport`);
      if (
        e.scrollHeight > e.clientHeight + 3 ||
        e.scrollWidth > e.clientWidth + 3
      )
        problems.push(
          `${e.className}: content ${e.scrollWidth}x${e.scrollHeight} > ${e.clientWidth}x${e.clientHeight}`,
        );
    }
    return problems;
  });
  expect.soft(problems, label).toEqual([]);
}
for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [390, 844],
  [375, 667],
  [844, 390],
  [640, 360],
]) {
  test(`all modes and card states fit ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|hydrated/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.locator("[data-card=hero]")).toBeVisible();
    const compact = width < 1100 || height < 650;
    for (const mode of ["Day", "Week", "Month", "Year"]) {
      await page
        .getByRole("navigation", { name: "Dashboard perspective" })
        .getByRole("button", { name: mode, exact: true })
        .click();
      for (let c = 0; c < cards.length; c++) {
        if (compact)
          await page
            .getByRole("navigation", { name: "Dashboard cards" })
            .getByRole("button", { name: pages[c], exact: true })
            .click();
        const card = page.locator(`[data-card=${cards[c]}]`);
        const views = cards[c] === "activity" ? 2 : 3;
        for (let state = 0; state < views; state++) {
          await page.waitForTimeout(220);
          await contain(
            page,
            `${width}x${height} ${mode} ${cards[c]} state ${state}`,
          );
          await card.locator(".card-navigation").click();
        }
      }
    }
    expect(errors).toEqual([]);
  });
}
test("dialogs, keyboard controls, reduced motion and offline recovery", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-card=hero]")).toBeVisible();
  const tile = page.getByRole("button", { name: /Routine balance/ });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await contain(page, "mobile expanded tile");
  await page.keyboard.press("Escape");
  await expect(tile).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Dashboard settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await contain(page, "mobile balance dialog");
  await page.locator("#weight-health").fill("20");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: /Open connection details/ }).click();
  await contain(page, "mobile connection dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await context.setOffline(true);
  await expect(page.locator(".footer-status")).toContainText("Offline");
  await expect(page.locator("[data-card=hero]")).toBeVisible();
  await context.setOffline(false);
  await page.keyboard.press("t");
  await contain(page, "after reconnect");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await contain(page, "landscape overview dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dashboard settings" }).click();
  await contain(page, "landscape balance dialog");
});
test("server response contains actual metrics before JavaScript runs", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Monthly progress" }),
  ).toBeVisible();
  await expect(page.locator("[data-card=hero] .hero-count")).toContainText(
    "scheduled",
  );
  await expect(page.locator("[data-card=hero] .card-body")).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator("[data-card=french] .progress-ring")).toHaveCSS(
    "box-shadow",
    "none",
  );
  await page.goto("/?mode=day&date=2026-10-20");
  await expect(
    page.getByRole("heading", { name: "Daily completion" }),
  ).toBeVisible();
  await context.close();
});
