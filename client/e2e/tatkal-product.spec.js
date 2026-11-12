import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const api = process.env.E2E_API_URL;
const base = process.env.E2E_BASE_URL;

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || route.request().url().startsWith(`${api}/`)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

async function seed(request) {
  const id = randomUUID();
  const registration = await request.post(`${api}/auth/register`, {
    data: {
      name: "Synthetic Tatkal Tester",
      email: `${id}@example.invalid`,
      password: `synthetic-${id}`,
      businessName: "Synthetic Tatkal Store",
    },
  });
  expect(registration.status()).toBe(201);
  const { token } = await registration.json();
  return {
    email: `${id}@example.invalid`,
    password: `synthetic-${id}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function login(page, user) {
  await page.goto("/login");
  await page.getByPlaceholder("you@business.com").fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("Tatkal product is created and sold in the current bill exactly once", async ({ page, request }) => {
  const user = await seed(request);
  await login(page, user);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "New sale" }).first().click();
  const modal = page.getByRole("heading", { name: "New sale" }).locator("../..");
  await modal.getByRole("button", { name: "Walk-in" }).click();
  await modal.getByRole("button", { name: "Continue" }).click();

  const productName = `Tatkal ${randomUUID()}`;
  await modal.getByPlaceholder("Search name or SKU…").fill(productName);
  await expect(modal.getByText("No in-stock products match.")).toBeVisible();
  await modal.getByRole("button", { name: "Add Product" }).click();
  await modal.getByLabel("Product name").fill(productName);
  await modal.getByLabel("Opening stock quantity").fill("5");
  await modal.getByLabel("Wholesale price").fill("20");
  await expect(modal.getByLabel("Retail price")).toHaveValue("40");

  const keys = [];
  await page.route(`${api}/products`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      const actual = await route.fetch();
      expect(actual.status()).toBe(201);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await modal.getByRole("button", { name: "Create and add to bill" }).click();
  await expect(modal.getByText("The request may have succeeded.", { exact: false })).toBeVisible();
  const createdResponse = page.waitForResponse((response) =>
    response.url() === `${api}/products` && response.request().method() === "POST");
  await modal.getByRole("button", { name: "Retry product creation" }).click();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const creationRequest = response.request();
  const creationBody = creationRequest.postDataJSON();
  const idempotencyKey = creationRequest.headers()["idempotency-key"];
  expect(creationBody).toEqual({ tatkal: true, name: productName, quantity: 5, wholesalePrice: 20, retailPrice: 40 });
  expect(idempotencyKey).toBeTruthy();
  expect(keys).toEqual([idempotencyKey, idempotencyKey]);
  const product = (await response.json()).product;
  await expect(modal.getByText(productName, { exact: true }).first()).toBeVisible();

  await modal.getByLabel(`Quantity for ${productName}`).fill("2");
  await modal.getByRole("button", { name: "Continue" }).click();
  await modal.getByText("Cash tendered", { exact: true }).locator("..").locator("input").fill("40");
  const saleResponse = page.waitForResponse((sale) =>
    sale.url() === `${api}/sales` && sale.request().method() === "POST");
  await modal.getByRole("button", { name: "Record sale" }).click();
  const sold = await saleResponse;
  expect(sold.status()).toBe(201);
  const sale = (await sold.json()).sale;
  expect(sale.items).toHaveLength(1);
  expect(sale.items[0].product).toBe(product._id);
  expect(sale.items[0].quantity).toBe(2);
  expect(sale.items[0].costPrice).toBeNull();

  const replay = await request.post(`${api}/products`, {
    headers: { ...user.headers, "Idempotency-Key": idempotencyKey },
    data: creationBody,
  });
  expect(replay.status()).toBe(201);
  expect((await replay.json()).product._id).toBe(product._id);
  const catalogue = await request.get(`${api}/products`, { headers: user.headers, params: { q: productName } });
  const matchingProducts = (await catalogue.json()).products.filter((entry) => entry._id === product._id);
  expect(matchingProducts).toHaveLength(1);
  const persistedProduct = matchingProducts[0];
  expect(persistedProduct.stock).toBe(3);
  expect(persistedProduct.soldCount).toBe(2);
  expect(persistedProduct.costPrice).toBeNull();
  expect((await request.get(`${api}/sales`, { headers: user.headers })).status()).toBe(200);
});
