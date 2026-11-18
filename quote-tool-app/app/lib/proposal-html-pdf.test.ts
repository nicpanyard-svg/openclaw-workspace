import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import test, { type TestContext } from "node:test";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type ContinueRequestOverrides, type HTTPRequest, type LaunchOptions, type Page, type PDFOptions } from "puppeteer-core";
import { renderHtmlContentPdf, renderHtmlPdf } from "./proposal-html-pdf";

const printUrl = "https://quotes.example/proposal/print?token=test-export";
type StorageState = NonNullable<Parameters<typeof renderHtmlPdf>[2]>;

function mockBrowser(t: TestContext) {
  const events: string[] = [];
  const mainFrame = {};
  let currentUrl = "about:blank";
  let requestHandler: (request: HTTPRequest) => void;
  let initializeStorage: (state: StorageState, trustedUrl: string) => void;
  let storageArgs: [StorageState, string];
  let onReady = () => {};
  const page = {
    setBypassServiceWorker: async (value: boolean) => { events.push(`service-worker:${value}`); },
    setCacheEnabled: async (value: boolean) => { events.push(`cache:${value}`); },
    emulateMediaType: async () => {},
    setViewport: async () => {},
    setRequestInterception: async (value: boolean) => { events.push(`interception:${value}`); },
    setJavaScriptEnabled: async (value: boolean) => { events.push(`javascript:${value}`); },
    setOfflineMode: async () => { throw new Error("New offline protocol is unavailable on serverless Chromium"); },
    createCDPSession: async () => ({
      send: async (method: string, params?: Record<string, unknown>) => {
        if (method === "Network.emulateNetworkConditions") {
          assert.deepEqual(params, { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
          events.push("offline:true");
        } else assert.equal(method, "Network.enable");
      },
      detach: async () => { events.push("network-detach"); },
    }),
    on: (event: string, handler: typeof requestHandler) => {
      assert.equal(event, "request");
      requestHandler = handler;
    },
    mainFrame: () => mainFrame,
    evaluateOnNewDocument: async (initialize: typeof initializeStorage, state: StorageState, url: string) => {
      initializeStorage = initialize;
      storageArgs = [state, url];
    },
    goto: async (url: string) => {
      events.push("goto");
      currentUrl = url;
      return { ok: () => true };
    },
    url: () => currentUrl,
    setContent: async () => { events.push("content"); },
    waitForFunction: async () => { onReady(); },
    pdf: async (options?: PDFOptions) => {
      assert.equal(options?.timeout, 30_000);
      assert.equal(options?.waitForFonts, true);
      events.push("pdf");
      return new Uint8Array([1, 2, 3]);
    },
    close: async () => { events.push("page-close"); },
  };
  const browser = {
    newPage: async () => page as unknown as Page,
    close: async () => { events.push("browser-close"); },
  };
  t.mock.method(fs, "existsSync", () => true);
  t.mock.method(chromium, "executablePath", async () => "test-chrome");
  const launch = t.mock.method(puppeteer, "launch", async () => browser as unknown as Browser);
  return {
    events,
    launch,
    page,
    onReady: (action: () => void) => { onReady = action; },
    setUrl: (url: string) => { currentUrl = url; },
    seedStorage: () => initializeStorage(...storageArgs),
    request: (url: string, options: { navigation?: boolean; childFrame?: boolean; method?: string } = {}) => {
      let action: "abort" | "continue" | undefined;
      let overrides: ContinueRequestOverrides | undefined;
      requestHandler({
        url: () => url,
        method: () => options.method ?? "GET",
        isNavigationRequest: () => options.navigation ?? false,
        frame: () => options.childFrame ? {} : mainFrame,
        headers: () => ({ accept: "*/*" }),
        abort: async () => { action = "abort"; },
        continue: async (value?: ContinueRequestOverrides) => { action = "continue"; overrides = value; },
      } as unknown as HTTPRequest);
      return { action, overrides };
    },
  };
}

function setEnvironment(t: TestContext, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test("invalid print URLs fail before browser launch without echoing input", async (t) => {
  const { launch } = mockBrowser(t);
  for (const url of [
    "not a URL", "file:///proposal/print", "ftp://quotes.example/proposal/print",
    "data:text/html,proposal/print", "blob:https://quotes.example/proposal/print",
    "https://user:fake-password@quotes.example/proposal/print", "https://quotes.example/workspace",
  ]) {
    await assert.rejects(renderHtmlPdf(url), { message: "Invalid proposal print URL." });
  }
  assert.equal(launch.mock.callCount(), 0);
});

test("print rendering allows same-origin assets and inline resources, never external or file requests", async (t) => {
  const browser = mockBrowser(t);
  setEnvironment(t, {
    RAPIDQUOTE_ACCESS_MODE: "restricted",
    RAPIDQUOTE_ACCESS_USER: "test-user",
    RAPIDQUOTE_ACCESS_PASSWORD: "test-password-not-a-secret",
    VERCEL_AUTOMATION_BYPASS_SECRET: "test-bypass-not-a-secret",
  });
  await renderHtmlPdf(printUrl);
  for (const url of [printUrl, "https://quotes.example/_next/static/app.js", "https://quotes.example/logo.png"]) {
    const result = browser.request(url);
    assert.equal(result.action, "continue");
    assert.deepEqual(result.overrides?.headers, {
      accept: "*/*",
      authorization: `Basic ${Buffer.from("test-user:test-password-not-a-secret").toString("base64")}`,
      "x-vercel-protection-bypass": "test-bypass-not-a-secret",
    });
  }
  for (const url of ["data:image/png;base64,AA==", "blob:https://quotes.example/test-image"]) {
    assert.deepEqual(browser.request(url), { action: "continue", overrides: undefined });
  }
  for (const url of [
    "https://external.example/image.png", "https://quotes.example.attacker.example/image.png",
    "http://quotes.example/image.png", "https://quotes.example:444/image.png",
    "http://127.0.0.1/private", "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd", "file:///C:/Windows/win.ini", "file://server/share/private",
    "ftp://quotes.example/file", "javascript:alert(1)", "about:blank", "malformed",
    "https://user:fake-password@quotes.example/image.png",
  ]) {
    assert.equal(browser.request(url).action, "abort", url);
  }
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    assert.equal(browser.request("https://quotes.example/api/proposal-pdf", { method }).action, "abort");
  }
  assert.equal(browser.request("https://quotes.example/font.woff2", { method: "HEAD" }).action, "continue");
  assert.ok(browser.events.indexOf("service-worker:true") < browser.events.indexOf("goto"));
  assert.ok(browser.events.indexOf("cache:false") < browser.events.indexOf("goto"));
  assert.ok(!browser.events.includes("javascript:false"), "print route must retain its nonce-authorized scripts");
});

test("navigation is limited to the exact main-frame print URL, including redirects", async (t) => {
  const browser = mockBrowser(t);
  await renderHtmlPdf(printUrl);
  assert.equal(browser.request(printUrl, { navigation: true }).action, "continue");
  assert.equal(browser.request(printUrl, { navigation: true, childFrame: true }).action, "abort");
  for (const url of [
    "https://quotes.example/proposal/print?token=another-export", "https://quotes.example/workspace",
    "https://external.example/proposal/print", "data:text/html,<h1>Other document</h1>",
    "blob:https://quotes.example/other-document", "about:blank", "file:///etc/passwd",
  ]) {
    assert.equal(browser.request(url, { navigation: true }).action, "abort", url);
  }
});

test("quote storage is seeded only in the exact top-level print document", async (t) => {
  const browser = mockBrowser(t);
  await renderHtmlPdf(printUrl, undefined, { localStorage: { quote: "private test quote" }, sessionStorage: { draft: "private test draft" } });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  for (const [href, childFrame, allowed] of [
    [printUrl, false, true], [printUrl, true, false],
    ["https://external.example/proposal/print", false, false],
    ["https://quotes.example/workspace", false, false],
    ["https://quotes.example/proposal/print?token=other", false, false],
    ["about:blank", true, false], ["about:srcdoc", true, false],
  ] as const) {
    const local = new Map<string, string>();
    const session = new Map<string, string>();
    const window = { location: { href }, top: {} as unknown, localStorage: { setItem: local.set.bind(local) }, sessionStorage: { setItem: session.set.bind(session) } };
    if (!childFrame) window.top = window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: window });
    browser.seedStorage();
    assert.deepEqual([...local], allowed ? [["quote", "private test quote"]] : []);
    assert.deepEqual([...session], allowed ? [["draft", "private test draft"]] : []);
  }
});

test("raw HTML is offline and script-free before parsing while retaining inline assets", async (t) => {
  const browser = mockBrowser(t);
  await renderHtmlContentPdf('<img src="data:image/png;base64,AA=="><script>fetch("http://localhost/private")</script>');
  for (const event of ["javascript:false", "offline:true", "interception:true"]) {
    assert.ok(browser.events.indexOf(event) >= 0 && browser.events.indexOf(event) < browser.events.indexOf("content"));
  }
  for (const url of ["https://quotes.example/logo.png", "http://127.0.0.1/private", "http://169.254.169.254/", "file:///etc/passwd"]) {
    assert.equal(browser.request(url).action, "abort");
  }
  for (const url of ["data:image/png;base64,AA==", "blob:null/test-image"]) {
    assert.deepEqual(browser.request(url), { action: "continue", overrides: undefined });
    assert.equal(browser.request(url, { navigation: true }).action, "abort");
  }
  assert.ok(browser.events.includes("pdf"));
  assert.ok(browser.events.includes("network-detach"));
});

test("raw HTML fails closed when offline isolation cannot be established", async (t) => {
  const browser = mockBrowser(t);
  t.mock.method(browser.page, "createCDPSession", async () => ({
    send: async () => { throw new Error("Offline isolation unavailable"); },
    detach: async () => { browser.events.push("network-detach"); },
  }));
  await assert.rejects(renderHtmlContentPdf("<h1>Invoice</h1>"), /Offline isolation unavailable/);
  assert.equal(browser.events.includes("content"), false);
  assert.equal(browser.events.includes("pdf"), false);
  assert.ok(browser.events.includes("network-detach"));
  assert.equal(browser.events.at(-1), "browser-close");
});

test("a changed document fails closed and closes the browser", async (t) => {
  const browser = mockBrowser(t);
  browser.onReady(() => browser.setUrl("https://external.example/proposal/print"));
  await assert.rejects(renderHtmlPdf(printUrl), /print page changed/);
  assert.equal(browser.events.at(-1), "browser-close");
});

test("raw HTML navigation during PDF creation cannot return a replacement document", async (t) => {
  const browser = mockBrowser(t);
  t.mock.method(browser.page, "pdf", async () => {
    browser.setUrl("chrome-error://chromewebdata/");
    return new Uint8Array([1, 2, 3]);
  });
  await assert.rejects(renderHtmlContentPdf("<h1>Invoice</h1>"), /HTML document changed during rendering/);
  assert.equal(browser.events.at(-1), "browser-close");
});

test("real Chromium preserves nonce scripts and inline assets without leaking network requests", {
  skip: process.env.RAPIDQUOTE_PDF_BROWSER_TEST !== "1",
  timeout: 45_000,
}, async (t) => {
  async function listen(server: Server) {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  }

  const leakedRequests: string[] = [];
  const externalOrigin = await listen(createServer((request, response) => {
    leakedRequests.push(request.url ?? "");
    response.end("unexpected request");
  }));
  const received: string[] = [];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>';
  const dataImage = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const origin = await listen(createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    received.push(`${request.method} ${path}`);
    if (path === "/logo.svg") {
      response.setHeader("Content-Type", "image/svg+xml");
      response.end(svg);
    } else if (path === "/redirect-image") {
      response.writeHead(302, { Location: `${externalOrigin}/redirect-leak` });
      response.end();
    } else if (path === "/proposal/print") {
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'nonce-pdf-test'; style-src 'self' 'nonce-pdf-test'; img-src * data: blob:; connect-src *; frame-src * data: blob:");
      response.end(`<!doctype html><html><head><style nonce="pdf-test">body { color: rgb(0, 128, 0); }</style></head><body>
        <main class="proposal-shell" data-attachments-ready="true">PDF security fixture</main>
        <img id="same" src="/logo.svg"><img id="data" src="${dataImage}">
        <img src="${externalOrigin}/image-leak"><img src="/redirect-image">
        <iframe src="/other-document"></iframe>
        <script nonce="pdf-test">
          document.documentElement.dataset.scriptRan = "yes";
          const image = document.createElement("img");
          image.id = "blob";
          image.src = URL.createObjectURL(new Blob([${JSON.stringify(svg)}], { type: "image/svg+xml" }));
          document.body.append(image);
          fetch("/read-probe").catch(() => {});
          fetch("/write-probe", { method: "POST", body: "no-write" }).catch(() => {});
          fetch(${JSON.stringify(`${externalOrigin}/fetch-leak`)}).catch(() => {});
        </script></body></html>`);
    } else {
      response.end("fixture");
    }
  }));

  type Snapshot = { scriptRan: string | null; quote: string | null; images: Record<string, number>; color: string };
  const snapshots: Snapshot[] = [];
  const originalLaunch = puppeteer.launch.bind(puppeteer);
  t.mock.method(puppeteer, "launch", async (options?: LaunchOptions) => {
    const browser = await originalLaunch(options);
    const newPage = browser.newPage.bind(browser);
    t.mock.method(browser, "newPage", async () => {
      const page = await newPage();
      const pdf = page.pdf.bind(page);
      t.mock.method(page, "pdf", async (options?: PDFOptions) => {
        snapshots.push(await page.evaluate(() => ({
          scriptRan: document.documentElement.dataset.scriptRan ?? null,
          quote: location.protocol === "http:" ? localStorage.getItem("quote") : null,
          images: Object.fromEntries(Array.from(document.querySelectorAll<HTMLImageElement>("img[id]")).map(image => [image.id, image.naturalWidth])),
          color: getComputedStyle(document.body).color,
        })));
        return pdf(options);
      });
      return page;
    });
    return browser;
  });

  const proposal = await renderHtmlPdf(`${origin}/proposal/print?token=fixture`, undefined, { localStorage: { quote: "test quote" } });
  assert.ok(proposal.length > 1000);
  assert.deepEqual(snapshots[0], { scriptRan: "yes", quote: "test quote", images: { same: 20, data: 20, blob: 20 }, color: "rgb(0, 128, 0)" });
  assert.ok(received.includes("GET /read-probe"));
  assert.ok(received.includes("GET /redirect-image"));
  assert.ok(!received.includes("GET /other-document"));
  assert.ok(!received.includes("POST /write-probe"));

  const content = await renderHtmlContentPdf(`<!doctype html><html><body style="color: rgb(0, 128, 0)">
    <h1>Offline invoice fixture</h1><img id="data" src="${dataImage}">
    <img src="${externalOrigin}/raw-image-leak"><iframe src="file:///etc/passwd"></iframe>
    <script>document.documentElement.dataset.scriptRan = "yes"; fetch("${externalOrigin}/raw-script-leak");</script></body></html>`);
  assert.ok(content.length > 1000);
  assert.deepEqual(snapshots[1], { scriptRan: null, quote: null, images: { data: 20 }, color: "rgb(0, 128, 0)" });
  await assert.rejects(renderHtmlContentPdf(`<!doctype html><html><body><h1>Blocked navigation</h1><meta http-equiv="refresh" content="0;url=${externalOrigin}/raw-navigation-leak"></body></html>`));
  assert.deepEqual(leakedRequests, []);
});
