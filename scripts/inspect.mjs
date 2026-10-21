import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await fs.mkdir("test-results", { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [390, 844],
  [375, 667],
  [844, 390],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000", {
    waitUntil: "networkidle",
  });
  await page.screenshot({ path: `test-results/${width}x${height}.png` });
  const result = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    document: [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ],
    cards: [...document.querySelectorAll("[data-card]")].map((e) => ({
      id: e.getAttribute("data-card"),
      rect: {
        top: e.getBoundingClientRect().top,
        bottom: e.getBoundingClientRect().bottom,
      },
      scroll: [e.scrollHeight, e.clientHeight],
    })),
  }));
  console.log(JSON.stringify({ width, height, ...result, errors }));
  await page.close();
}
await browser.close();
