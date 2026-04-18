import chromium from "@sparticuz/chromium";
import puppeteer, { type PDFOptions } from "puppeteer-core";

const VERCEL_EXECUTION_ENV = Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);

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

  const localExecutablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    process.env.CHROME_EXECUTABLE_PATH ??
    process.env.CHROMIUM_PATH;

  if (!localExecutablePath) {
    throw new Error(
      "No local Chrome/Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH (or CHROME_EXECUTABLE_PATH / CHROMIUM_PATH) for local PDF generation, or run this route on Vercel.",
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

export async function renderHtmlPdf(url: string, options?: PDFOptions) {
  const browser = await puppeteer.launch(await getLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      ...options,
    });

    await page.close();
    return pdf;
  } finally {
    await browser.close();
  }
}
