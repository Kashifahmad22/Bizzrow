export default async function verifyServer() {
  const url = new URL("/health", process.env.E2E_API_URL);
  const response = await fetch(url);
  if (!response.ok || (await response.json()).nonce !== process.env.E2E_NONCE) {
    throw new Error("The API is not the disposable server created for this test run");
  }
}
