import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const api = process.env.E2E_API_URL;
const base = process.env.E2E_BASE_URL;
const jwt = createRequire(import.meta.url)("../../server/node_modules/jsonwebtoken");

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const safeApi = route.request().url().startsWith(`${api}/`)
      && !/\/(forgot-password|reset-password|remind|whatsapp)(\/|$)/.test(url.pathname);
    if (url.origin === base || safeApi) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

async function seed(request) {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  const password = `synthetic-${id}`;
  const registration = await request.post(`${api}/auth/register`, {
    data: { name: "Synthetic Tester", email, password, businessName: "Synthetic Store" },
  });
  expect(registration.status()).toBe(201);
  const { token } = await registration.json();
  const headers = { Authorization: `Bearer ${token}` };
  const customerResponse = await request.post(`${api}/customers`, {
    headers, data: { name: "Synthetic Customer", phone: id },
  });
  expect(customerResponse.status()).toBe(201);
  const customer = (await customerResponse.json()).customer;
  const productResponse = await request.post(`${api}/products`, {
    headers, data: { name: "ABC 123", sku: "E2E-SKU", wholesalePrice: 141, retailPrice: 141, stock: 0 },
  });
  expect(productResponse.status()).toBe(201);
  const product = (await productResponse.json()).product;
  const batch = await request.post(`${api}/products/${product._id}/batches`, {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: { quantityReceived: 10, costPrice: 50, batchCode: "E2E" },
  });
  expect(batch.status()).toBe(201);
  return { email, password, headers, customer, product };
}

async function login(page, credentials) {
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("authentication guards, persists, and logs out", async ({ page, request }) => {
  const user = await seed(request);
  await page.goto("/app/sales");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, user);
  await page.reload();
  await expect(page).toHaveURL(/\/app$/);
  await page.evaluate(() => localStorage.setItem("sv_token", "expired-or-invalid"));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, user);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app/sales");
  await expect(page).toHaveURL(/\/login$/);
});

test("naturally expiring token protects routes and login recovers the session", async ({ page, request }) => {
  const user = await seed(request);
  const loginResponse = await request.post(`${api}/auth/login`, { data: { email: user.email, password: user.password } });
  const payload = jwt.decode((await loginResponse.json()).token);
  const token = jwt.sign({ id: payload.id, tokenVersion: payload.tokenVersion }, process.env.E2E_SECRET, { expiresIn: 4 });
  await page.goto("/login");
  await page.evaluate((value) => localStorage.setItem("sv_token", value), token);
  await page.goto("/app/sales");
  await expect(page).toHaveURL(/\/app\/sales$/);
  await expect.poll(async () => (await request.get(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })).status(), { timeout: 10000, intervals: [250, 500] }).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sv_token"))).toBeNull();
  await login(page, user);
});

for (const payment of [
  { name: "cash", cash: "141", upi: "", method: "cash" },
  { name: "UPI", cash: "", upi: "141", method: "upi" },
]) {
  test(`${payment.name} checkout records the actual collection`, async ({ page, request }) => {
    const data = await seed(request);
    await login(page, data);
    await page.goto("/app/sales");
    await page.getByRole("button", { name: "New sale" }).first().click();
    await page.getByRole("button", { name: /Synthetic Customer/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /ABC 123.*in stock/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    if (payment.cash) await page.getByText("Cash tendered", { exact: true }).locator("..").locator("input").fill(payment.cash);
    if (payment.upi) await page.getByText("UPI", { exact: true }).locator("..").locator("input").fill(payment.upi);
    const result = page.waitForResponse((response) => response.url() === `${api}/sales` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Record sale" }).click();
    const response = await result;
    expect(response.status()).toBe(201);
    const sale = (await response.json()).sale;
    expect(sale.amountPaid).toBe(141);
    expect(sale.dueAmount).toBe(0);
    expect(sale.collectionPayments.map(({ method, amount }) => [method, amount])).toEqual([[payment.method, 141]]);
  });
}

test("lost sale response is retried in the UI with the same key and no duplicate mutation", async ({ page, request }) => {
  const data = await seed(request);
  await login(page, data);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "New sale" }).first().click();
  await page.getByRole("button", { name: /Synthetic Customer/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /ABC 123.*in stock/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Cash tendered", { exact: true }).locator("..").locator("input").fill("100");
  const keys = [];
  await page.route(`${api}/sales`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      const actual = await route.fetch();
      expect(actual.status()).toBe(201);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Record sale" }).click();
  await expect(page.getByRole("button", { name: "Discard pending sale" })).toBeVisible();
  const retry = page.waitForResponse((response) => response.url() === `${api}/sales` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Record sale" }).click();
  expect((await retry).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((await (await request.get(`${api}/sales`, { headers: data.headers })).json()).total).toBe(1);
  const batch = await (await request.get(`${api}/products/${data.product._id}/batches`, { headers: data.headers })).json();
  expect(batch.product.stock).toBe(9);
  expect(batch.batches[0].remainingQuantity).toBe(9);
  const ledger = await (await request.get(`${api}/ledger/${data.customer._id}`, { headers: data.headers })).json();
  expect(ledger.customer.pendingBalance).toBe(41);
});

for (const mode of ["return", "replacement"]) {
  test(`historical fractional ${mode} restores batch precision`, async ({ page, request }) => {
    const data = await seed(request);
    const response = await request.post(`${new URL(api).origin}/fixture/historical`, {
      headers: { ...data.headers, "X-E2E-Nonce": process.env.E2E_NONCE },
      data: { customerId: data.customer._id },
    });
    expect(response.status()).toBe(201);
    const historical = await response.json();
    await login(page, data);
    await page.goto("/app/sales");
    await page.getByRole("button", { name: /Synthetic Customer/ }).click();
    await page.getByRole("button", { name: mode === "return" ? "Return" : "Replace", exact: true }).click();
    const modal = page.getByRole("heading", { name: mode === "return" ? "Return items" : "Replace items" }).locator("../..");
    await modal.locator('input[type="number"]').first().fill("1.23456");
    if (mode === "replacement") {
      await modal.getByPlaceholder("Search products…").fill("ABC 123");
      await modal.getByRole("button", { name: /ABC 123/ }).click();
      await modal.getByLabel("Quantity for ABC 123").fill("1");
    }
    const action = mode === "return" ? "return" : "replace";
    const done = page.waitForResponse((result) =>
      result.url() === `${api}/sales/${historical.saleId}/${action}` && result.request().method() === "POST");
    await modal.getByRole("button", { name: mode === "return" ? "Process return" : "Confirm replacement" }).click();
    const result = await done;
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.refund).toBe(123.46);
    if (mode === "replacement") {
      expect(body.newSale.creditApplied).toBe(123.46);
      expect(body.newSale.dueAmount).toBe(17.54);
      const ledger = await (await request.get(`${api}/ledger/${data.customer._id}`, { headers: data.headers })).json();
      expect(ledger.customer.pendingBalance).toBe(17.54);
    }
    const stock = await (await request.get(`${api}/products/${historical.productId}/batches`, { headers: data.headers })).json();
    expect(stock.product.stock).toBe(2);
    expect(stock.batches[0].remainingQuantity).toBe(2);
  });
}

test("production CORS configuration, authorization, tenant isolation and JSON errors", async ({ request }) => {
  const first = await seed(request);
  const second = await seed(request);
  const preflight = await request.fetch(`${api}/sales`, {
    method: "OPTIONS",
    headers: {
      Origin: base,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
    },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-origin"]).toBe(base);
  expect(preflight.headers()["access-control-allow-headers"].toLowerCase()).toContain("idempotency-key");
  const denied = await request.get(`${api}/products`, { headers: { Origin: "https://example.invalid", ...first.headers } });
  expect(denied.headers()["access-control-allow-origin"]).toBeUndefined();
  expect((await request.get(`${api}/products`)).status()).toBe(401);
  expect((await request.get(`${api}/products/${first.product._id}/batches`, { headers: second.headers })).status()).toBe(404);
  const malformed = await request.post(`${api}/sales`, {
    headers: { ...first.headers, "Content-Type": "application/json" }, data: "{",
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).message).toBeTruthy();
  expect((await request.get(`${api}/whatsapp`)).status()).toBe(403);
});

test("checkout reports customer-loading failure without recording a sale", async ({ page, request }) => {
  const data = await seed(request);
  await login(page, data);
  await page.goto("/app/sales");
  await page.route(`${api}/customers`, (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic customer failure" }),
  }));
  await page.getByRole("button", { name: "New sale" }).first().click();
  await expect(page.getByText("Synthetic customer failure").first()).toBeVisible();
  const modal = page.getByRole("heading", { name: "New sale" }).locator("../..");
  await expect(modal.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect((await (await request.get(`${api}/sales`, { headers: data.headers })).json()).total).toBe(0);
});

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} loading, empty and error states and responsive dropdowns`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const data = await seed(request);
    await login(page, data);
    let release;
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(`${api}/sales?**`, async (route) => {
      signalStarted();
      await gate;
      await route.continue();
    });
    await page.goto("/app/sales");
    await started;
    await expect(page.locator(".animate-pulse").first()).toBeVisible();
    release();
    await expect(page.getByText("No sales yet")).toBeVisible();
    await page.getByRole("button", { name: /Date.*All time/ }).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const bounds = await listbox.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await listbox.getByRole("option", { name: "Today", exact: true }).click();
    await expect(listbox).toBeHidden();
    let releaseCustomers;
    let signalCustomers;
    const customersStarted = new Promise((resolve) => { signalCustomers = resolve; });
    const customerGate = new Promise((resolve) => { releaseCustomers = resolve; });
    await page.route(`${api}/customers`, async (route) => {
      signalCustomers();
      await customerGate;
      await route.continue();
    });
    await page.getByRole("button", { name: "New sale" }).first().click();
    const modal = page.getByRole("heading", { name: "New sale" }).locator("../..");
    await expect(modal).toBeVisible();
    await customersStarted;
    await expect(modal.locator(".animate-pulse").first()).toBeVisible();
    releaseCustomers();
    await modal.getByRole("button", { name: /Synthetic Customer/ }).click();
    await modal.getByRole("button", { name: "Continue" }).click();
    await modal.getByPlaceholder("Search name or SKU…").fill("no-synthetic-match");
    await expect(modal.getByText("No in-stock products match.")).toBeVisible();
    await modal.getByPlaceholder("Search name or SKU…").fill("ABC 123");
    await modal.getByRole("button", { name: /ABC 123.*in stock/ }).click();
    await modal.getByRole("button", { name: "Continue" }).click();
    const scrollRegion = modal.locator(".overflow-y-auto").first();
    if (viewport.name === "mobile") {
      const scrolled = await scrollRegion.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
      });
      expect(scrolled.max).toBeGreaterThan(0);
      expect(scrolled.top).toBe(scrolled.max);
      await expect(modal.getByText("Change returned")).toBeVisible();
    }
    const geometry = await modal.evaluate((el) => ({
      width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left,
      scrollable: el.querySelector(".overflow-y-auto")?.scrollHeight >= el.querySelector(".overflow-y-auto")?.clientHeight,
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.pageWidth).toBeLessThanOrEqual(viewport.width);
    expect(geometry.scrollable).toBe(true);
    await modal.getByLabel("Close").click();
    await expect(modal).toBeHidden();
    await page.unroute(`${api}/sales?**`);
    await page.route(`${api}/sales?**`, (route) => route.fulfill({
      status: 500, contentType: "application/json", body: JSON.stringify({ message: "Synthetic sales failure" }),
    }));
    await page.reload();
    await expect(page.getByText("Synthetic sales failure").first()).toBeVisible();
  });
}

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} checkout, split payment and partial return preserve stock and ledger`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const data = await seed(request);
    await login(page, data);
    await page.goto("/app/sales");
    await expect(page.getByText("No sales yet")).toBeVisible();
    await page.getByRole("button", { name: "New sale" }).first().click();
    await page.getByRole("button", { name: /Synthetic Customer/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("Search name or SKU…").fill("ABC 123");
    await page.getByRole("button", { name: /ABC 123.*in stock/ }).click();
    await page.getByLabel("Quantity for ABC 123").fill("2");
    await page.getByRole("button", { name: "Continue" }).click();
    const cash = page.getByText("Cash tendered", { exact: true }).locator("..").locator("input");
    const upi = page.getByText("UPI", { exact: true }).locator("..").locator("input");
    await cash.fill("300");
    await upi.fill("10");
    await expect(page.getByText("Change returned").locator("..")).toContainText("28");
    const saleResponse = page.waitForResponse((response) =>
      response.url() === `${api}/sales` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Record sale" }).click();
    const sale = await saleResponse;
    expect(sale.status()).toBe(201);
    const saleData = (await sale.json()).sale;
    expect(saleData.total).toBe(282);
    expect(saleData.cashChange).toBe(28);
    expect(saleData.amountPaid).toBe(282);
    await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Return", exact: true }).click();
    const returnModal = page.getByRole("heading", { name: "Return items" }).locator("../..");
    await returnModal.locator('input[type="number"]').fill("1");
    await expect(returnModal.getByText("Estimated refund").locator("..")).toContainText("141");
    const returned = page.waitForResponse((response) =>
      response.url() === `${api}/sales/${saleData._id}/return` && response.request().method() === "POST");
    await returnModal.getByRole("button", { name: "Process return" }).click();
    const returnResponse = await returned;
    expect(returnResponse.status()).toBe(200);
    const originalReturn = await returnResponse.json();
    expect(originalReturn.refund).toBe(141);
    const replay = await request.post(`${api}/sales/${saleData._id}/return`, {
      headers: { ...data.headers, "Idempotency-Key": returnResponse.request().headers()["idempotency-key"] },
      data: returnResponse.request().postDataJSON(),
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).record._id).toBe(originalReturn.record._id);
    const batch = await request.get(`${api}/products/${data.product._id}/batches`, { headers: data.headers });
    const batchData = await batch.json();
    expect(batchData.product.stock).toBe(9);
    expect(batchData.batches[0].remainingQuantity).toBe(9);
    const ledger = await request.get(`${api}/ledger/${data.customer._id}`, { headers: data.headers });
    const ledgerData = await ledger.json();
    expect(ledgerData.customer.pendingBalance).toBe(0);
    expect(ledgerData.entries.length).toBeGreaterThanOrEqual(2);
    await expect(returnModal).toBeHidden();
    await page.getByRole("button", { name: /Synthetic Customer/ }).first().click();
    await page.getByRole("button", { name: "Return", exact: true }).click();
    const finalReturn = page.getByRole("heading", { name: "Return items" }).locator("../..");
    await finalReturn.locator('input[type="number"]').fill("1");
    const finalResponse = page.waitForResponse((response) =>
      response.url() === `${api}/sales/${saleData._id}/return` && response.request().method() === "POST");
    await finalReturn.getByRole("button", { name: "Process return" }).click();
    expect((await finalResponse).status()).toBe(200);
    const finalBatch = await request.get(`${api}/products/${data.product._id}/batches`, { headers: data.headers });
    const finalBatchData = await finalBatch.json();
    expect(finalBatchData.product.stock).toBe(10);
    expect(finalBatchData.batches[0].remainingQuantity).toBe(10);
  });
}

test("replacement applies old credit and a partial additional payment to the ledger", async ({ page, request }) => {
    const data = await seed(request);
    const replacementProductResponse = await request.post(`${api}/products`, {
      headers: data.headers,
      data: { name: "Replacement Item", wholesalePrice: 200, retailPrice: 200, stock: 10 },
    });
    expect(replacementProductResponse.status()).toBe(201);
    const initialSale = await request.post(`${api}/sales`, {
      headers: { ...data.headers, "Idempotency-Key": randomUUID() },
      data: {
        customerType: "existing", customerId: data.customer._id, saleType: "wholesale",
        items: [{ productId: data.product._id, quantity: 1 }],
        expectedTotal: 141, cashTendered: 141, payments: [],
      },
    });
    expect(initialSale.status()).toBe(201);
    const initial = (await initialSale.json()).sale;
    await login(page, data);
    await page.goto("/app/sales");
    await page.getByRole("button", { name: /Synthetic Customer/ }).click();
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    const modal = page.getByRole("heading", { name: "Replace items" }).locator("../..");
    await modal.locator('input[type="number"]').first().fill("1");
    await modal.getByPlaceholder("Search products…").fill("Replacement Item");
    await modal.getByRole("button", { name: /Replacement Item/ }).click();
    await expect(modal.getByText("Difference:").locator("..")).toContainText("59");
    await modal.getByPlaceholder(/Up to/).fill("20");
    const resultPromise = page.waitForResponse((response) =>
      response.url() === `${api}/sales/${initial._id}/replace` && response.request().method() === "POST");
    await modal.getByRole("button", { name: "Confirm replacement" }).click();
    const resultResponse = await resultPromise;
    expect(resultResponse.status()).toBe(200);
    const result = await resultResponse.json();
    expect(result.refund).toBe(141);
    expect(result.priceDifference).toBe(59);
    expect(result.newSale.creditApplied).toBe(141);
    expect(result.newSale.amountPaid).toBe(20);
    expect(result.newSale.dueAmount).toBe(39);
    const ledger = await request.get(`${api}/ledger/${data.customer._id}`, { headers: data.headers });
    expect((await ledger.json()).customer.pendingBalance).toBe(39);
});

test("fractional return preview matches the actual rounded refund", async ({ page, request }) => {
  const data = await seed(request);
  const initialSale = await request.post(`${api}/sales`, {
    headers: { ...data.headers, "Idempotency-Key": randomUUID() },
    data: {
      customerType: "existing", customerId: data.customer._id, saleType: "wholesale",
      items: [{ productId: data.product._id, quantity: 1 }],
      expectedTotal: 141, cashTendered: 141, payments: [],
    },
  });
  expect(initialSale.status()).toBe(201);
  const sale = (await initialSale.json()).sale;
  await login(page, data);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: /Synthetic Customer/ }).click();
  await page.getByRole("button", { name: "Return", exact: true }).click();
  const modal = page.getByRole("heading", { name: "Return items" }).locator("../..");
  await modal.locator('input[type="number"]').fill("0.145");
  await expect(modal.getByText("Estimated refund").locator("..")).toContainText("20.45");
  const resultPromise = page.waitForResponse((response) =>
    response.url() === `${api}/sales/${sale._id}/return` && response.request().method() === "POST");
  await modal.getByRole("button", { name: "Process return" }).click();
  const response = await resultPromise;
  expect(response.status()).toBe(200);
  expect((await response.json()).refund).toBe(20.45);
  const batch = await request.get(`${api}/products/${data.product._id}/batches`, { headers: data.headers });
  expect((await batch.json()).batches[0].remainingQuantity).toBe(9.145);
});

test("rejected total can be corrected; double submit and retry do not duplicate the sale", async ({ page, request }) => {
  const data = await seed(request);
  await login(page, data);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "New sale" }).first().click();
  await page.getByRole("button", { name: /Synthetic Customer/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /ABC 123.*in stock/ }).click();
  const cartItem = page.getByLabel("Quantity for ABC 123").locator('xpath=ancestor::div[contains(@class,"card")][1]');
  await cartItem.getByPlaceholder("0").fill("10");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Cash tendered", { exact: true }).locator("..").locator("input").fill("100");
  let tamper = true;
  let submissions = 0;
  await page.route(`${api}/sales`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submissions++;
    if (tamper) {
      tamper = false;
      const body = route.request().postDataJSON();
      await route.continue({ postData: JSON.stringify({ ...body, expectedTotal: 1 }) });
    } else await route.continue();
  });
  const rejected = page.waitForResponse((response) => response.url() === `${api}/sales` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Record sale" }).click();
  const rejectedResponse = await rejected;
  expect(rejectedResponse.status()).toBe(409);
  expect((await rejectedResponse.json()).message).toContain("invoice totals changed");
  await page.getByRole("button", { name: "Discard pending sale" }).click();
  const accepted = page.waitForResponse((response) => response.url() === `${api}/sales` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Record sale" }).dblclick();
  const response = await accepted;
  expect(response.status()).toBe(201);
  const sale = (await response.json()).sale;
  expect(sale.total).toBe(131);
  expect(sale.dueAmount).toBe(31);
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();
  expect(submissions).toBe(2);
  const replay = await request.post(`${api}/sales`, {
    headers: { ...data.headers, "Idempotency-Key": response.request().headers()["idempotency-key"] },
    data: response.request().postDataJSON(),
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).sale._id).toBe(sale._id);
  const list = await request.get(`${api}/sales`, { headers: data.headers });
  expect((await list.json()).total).toBe(1);
  const ledger = await request.get(`${api}/ledger/${data.customer._id}`, { headers: data.headers });
  expect((await ledger.json()).customer.pendingBalance).toBe(31);
});
