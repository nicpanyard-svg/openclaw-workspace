import fs from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer, { type PDFOptions } from "puppeteer-core";

const VERCEL_EXECUTION_ENV = Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);

function resolveLocalChromeExecutable() {
  const configuredPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    process.env.CHROME_EXECUTABLE_PATH ??
    process.env.CHROMIUM_PATH;

  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function getLaunchOptions() {
  if (VERCEL_EXECUTION_ENV) {
    return {
      args: chromium.args,
      defaultViewport: {
        width: 1400,
        height: 1800,
        deviceScaleFactor: 1,
      },
      executablePath: await chromium.executablePath(),
      headless: true as const,
    };
  }

  const localExecutablePath = resolveLocalChromeExecutable();

  if (!localExecutablePath) {
    throw new Error(
      "No local Chrome/Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH (or CHROME_EXECUTABLE_PATH / CHROMIUM_PATH), or install Chrome/Edge for local PDF generation.",
    );
  }

  return {
    args: puppeteer.defaultArgs({ headless: true }),
    defaultViewport: {
      width: 1400,
      height: 1800,
      deviceScaleFactor: 1,
    },
    executablePath: localExecutablePath,
    headless: true as const,
  };
}

async function withPdfPage<T>(run: (page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>) => Promise<T>) {
  const browser = await puppeteer.launch(await getLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setViewport({ width: 1400, height: 1800, deviceScaleFactor: 1 });
    const result = await run(page);
    await page.close();
    return result;
  } finally {
    await browser.close();
  }
}

function buildPdfOptions(options?: PDFOptions): PDFOptions {
  return {
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
    ...options,
  };
}

export async function renderHtmlPdf(url: string, options?: PDFOptions) {
  return withPdfPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
    return page.pdf(buildPdfOptions(options));
  });
}

export async function renderHtmlContentPdf(html: string, options?: PDFOptions) {
  return withPdfPage(async (page) => {
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
    return page.pdf(buildPdfOptions(options));
  });
}
