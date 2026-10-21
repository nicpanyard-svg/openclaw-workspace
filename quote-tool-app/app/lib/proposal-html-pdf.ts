import fs from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer, { type PDFOptions } from "puppeteer-core";

const VERCEL_EXECUTION_ENV = Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);

type BrowserStorageState = {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
};

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

async function primePageStorage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>,
  storageState?: BrowserStorageState,
) {
  if (!storageState) return;

  await page.evaluateOnNewDocument((state) => {
    Object.entries(state.localStorage ?? {}).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });

    Object.entries(state.sessionStorage ?? {}).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value);
    });
  }, storageState);
}

export async function renderHtmlPdf(url: string, options?: PDFOptions, storageState?: BrowserStorageState) {
  return withPdfPage(async (page) => {
    const origin = new URL(url).origin;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const target = new URL(request.url());
      if (target.protocol === "data:" || target.protocol === "blob:") { void request.continue(); return; }
      if (target.origin !== origin) { void request.abort(); return; }
      const headers = { ...request.headers() };
      if (process.env.RAPIDQUOTE_ACCESS_MODE === "restricted") {
        headers.authorization = `Basic ${Buffer.from(`${process.env.RAPIDQUOTE_ACCESS_USER}:${process.env.RAPIDQUOTE_ACCESS_PASSWORD}`).toString("base64")}`;
      }
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      void request.continue({ headers });
    });
    await primePageStorage(page, storageState);
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });
    if (!response?.ok() || new URL(page.url()).pathname !== "/proposal/print") throw new Error("The proposal print page could not be loaded.");
    await page.evaluateHandle("document.fonts.ready");
    await page.waitForFunction(
        () => document.querySelector(".proposal-shell")?.getAttribute("data-attachments-ready") === "true",
        { timeout: 30_000 },
      );
    return page.pdf(buildPdfOptions(options));
  });
}

export async function renderHtmlContentPdf(html: string, options?: PDFOptions) {
  return withPdfPage(async (page) => {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    return page.pdf(buildPdfOptions(options));
  });
}
