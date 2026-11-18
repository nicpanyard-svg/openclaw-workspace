import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3018");
  const live = process.env.RAPIDQUOTE_LIVE_QA === "1" && base.origin === "https://quote-tool-app.vercel.app";
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) || live);
  const output = path.resolve(`tmp/security-browser-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    const first = await page.goto(new URL("/login", base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    assert.ok(first);
    assert.ok(first.ok());
    const policy = first.headers()["content-security-policy"];
    assert.ok(policy?.includes("'strict-dynamic'"));
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    assert.ok(!policy.split(";").find(value => value.trim().startsWith("script-src "))?.includes("'unsafe-inline'"));
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', "qa@example.test");
    assert.equal(await page.$eval('input[type="email"]', element => (element as HTMLInputElement).value), "qa@example.test");
    assert.equal(await page.evaluate(nonce => [...document.scripts].some(script => script.nonce === nonce), nonce), true);
    assert.deepEqual(errors, []);
    // DevTools evaluation is privileged. Test a parser-inserted script in an
    // intercepted response, while retaining the server's actual CSP and nonce.
    const probe = await browser.newPage();
    const source = await fetch(new URL("/login", base));
    const html = (await source.text()).replace("</head>", "<script>window.__rqInjectedScriptRan = true</script></head>");
    const headers = Object.fromEntries(source.headers.entries());
    for (const name of ["content-length", "content-encoding", "transfer-encoding"]) delete headers[name];
    await probe.setRequestInterception(true);
    probe.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === probe.mainFrame()) {
        void request.respond({ status: 200, headers, body: html });
      } else void request.continue();
    });
    await probe.goto(new URL("/login", base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await probe.waitForSelector('input[type="email"]');
    assert.equal(await probe.evaluate(() => Reflect.get(window, "__rqInjectedScriptRan")), undefined);
    await probe.close();
    const second = await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    const secondNonce = second?.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(secondNonce && secondNonce !== nonce);
    assert.ok(second?.headers()["cache-control"]?.includes("no-store"));
    await page.waitForSelector('input[type="email"]');
    await page.screenshot({ path: path.join(output, "login.png") });
    const health = await fetch(new URL("/api/health", base));
    assert.equal(health.status, 200);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, origin: base.origin, uniqueNonces: true, injectedScriptBlocked: true, loginRendered: true, health: health.status, browserErrors: errors, authenticationVerified: false }, null, 2));
    console.log(`Browser security checks passed: ${output}`);
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
