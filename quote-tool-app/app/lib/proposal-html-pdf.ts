import fs from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Page, type PDFOptions } from "puppeteer-core";

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
    args: await puppeteer.defaultArgs({ headless: true }),
    defaultViewport: {
      width: 1400,
      height: 1800,
      deviceScaleFactor: 1,
    },
    executablePath: localExecutablePath,
    headless: true as const,
  };
}

async function withPdfPage<T>(run: (page: Page) => Promise<T>) {
  const browser = await puppeteer.launch(await getLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.setCacheEnabled(false);
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
    // Puppeteer's font wait is timeout-bound, unlike a separate fonts.ready await.
    waitForFonts: true,
    timeout: 30_000,
    ...options,
  };
}

async function primePageStorage(
  page: Page,
  printUrl: string,
  storageState?: BrowserStorageState,
) {
  if (!storageState) return;

  await page.evaluateOnNewDocument((state, trustedUrl) => {
    // New-document scripts also run in child frames and after navigation.
    if (window !== window.top || window.location.href !== trustedUrl) return;

    Object.entries(state.localStorage ?? {}).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });

    Object.entries(state.sessionStorage ?? {}).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value);
    });
  }, storageState, printUrl);
}

async function restrictPageRequests(page: Page, printUrl?: URL) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    let target: URL;
    try {
      target = new URL(request.url());
    } catch {
      void request.abort().catch(() => {});
      return;
    }

    const inline = target.protocol === "data:" || target.protocol === "blob:";
    const sameOrigin = (target.protocol === "http:" || target.protocol === "https:") && target.origin === printUrl?.origin;
    const allowedNavigation = printUrl && request.frame() === page.mainFrame() && target.href === printUrl.href;
    if (target.username || target.password ||
        (request.method() !== "GET" && request.method() !== "HEAD") ||
        (request.isNavigationRequest() && !allowedNavigation) ||
        (!inline && !sameOrigin)) {
      void request.abort().catch(() => {});
      return;
    }

    // Only trusted HTTP(S) requests receive deployment credentials.
    if (inline) {
      void request.continue().catch(() => {});
    } else {
      const headers = { ...request.headers() };
      if (process.env.RAPIDQUOTE_ACCESS_MODE === "restricted") {
        headers.authorization = `Basic ${Buffer.from(`${process.env.RAPIDQUOTE_ACCESS_USER}:${process.env.RAPIDQUOTE_ACCESS_PASSWORD}`).toString("base64")}`;
      }
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      void request.continue({ headers }).catch(() => {});
    }
  });
}

export async function renderHtmlPdf(url: string, options?: PDFOptions, storageState?: BrowserStorageState) {
  let printUrl: URL;
  try {
    printUrl = new URL(url);
  } catch {
    throw new Error("Invalid proposal print URL.");
  }
  if ((printUrl.protocol !== "http:" && printUrl.protocol !== "https:") ||
      printUrl.username || printUrl.password || printUrl.pathname !== "/proposal/print") {
    throw new Error("Invalid proposal print URL.");
  }

  return withPdfPage(async (page) => {
    await restrictPageRequests(page, printUrl);
    await primePageStorage(page, printUrl.href, storageState);
    const response = await page.goto(printUrl.href, { waitUntil: "networkidle0", timeout: 45_000 });
    if (!response?.ok() || page.url() !== printUrl.href) throw new Error("The proposal print page could not be loaded.");
    await page.waitForFunction(
        () => document.querySelector(".proposal-shell")?.getAttribute("data-attachments-ready") === "true",
        { timeout: 30_000 },
      );
    const pdf = await page.pdf(buildPdfOptions(options));
    if (page.url() !== printUrl.href) throw new Error("The proposal print page changed during rendering.");
    return pdf;
  });
}

export async function renderHtmlContentPdf(html: string, options?: PDFOptions) {
  return withPdfPage(async (page) => {
    await page.setJavaScriptEnabled(false);
    await page.setOfflineMode(true);
    await restrictPageRequests(page);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf(buildPdfOptions(options));
    if (page.url() !== "about:blank") throw new Error("The HTML document changed during rendering.");
    return pdf;
  });
}
