const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const client = path.resolve(__dirname, "..");
const root = path.resolve(client, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bizzrow-e2e-"));
const children = [];
let container;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function start(args, env, cwd = temp) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
  child.on("error", (error) => console.error("Could not start test process:", error));
  children.push(child);
  return child;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Test process exited with ${child.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch (error) {
      if (attempt === 119) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const browser = process.env.E2E_BROWSER_PATH || [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => fs.existsSync(candidate));
  if (!browser || !fs.existsSync(browser)) throw new Error("Set E2E_BROWSER_PATH to an installed Chromium browser");
  docker("image", "inspect", "mongo:7");
  container = docker("run", "-d", "--rm", "--pull", "never", "-p", "127.0.0.1::27017",
    "mongo:7", "mongod", "--replSet", "bizzrowTestRs", "--bind_ip_all");
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error("Unexpected Docker container ID");
  const published = docker("port", container, "27017/tcp");
  const match = /^127\.0\.0\.1:(\d+)$/.exec(published);
  if (!match) throw new Error(`MongoDB is not published exclusively on IPv4 loopback: ${published}`);
  let initiated = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      docker("exec", container, "mongosh", "--quiet", "--eval",
        'rs.initiate({_id:"bizzrowTestRs",members:[{_id:0,host:"127.0.0.1:27017"}]})');
      initiated = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!initiated) throw new Error("Could not initialize the disposable replica set");
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if (docker("exec", container, "mongosh", "--quiet", "--eval", "db.hello().isWritablePrimary") === "true") break;
    } catch {}
    if (attempt === 119) throw new Error("Disposable MongoDB did not become primary");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const apiPort = await freePort();
  const clientPort = await freePort();
  const base = `http://127.0.0.1:${clientPort}`;
  const api = `http://127.0.0.1:${apiPort}/api`;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: temp, TMP: temp,
    HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
    USERNAME: process.env.USERNAME, USERDOMAIN: process.env.USERDOMAIN,
    HOMEDRIVE: process.env.HOMEDRIVE, HOMEPATH: process.env.HOMEPATH,
    PROGRAMDATA: process.env.PROGRAMDATA, ProgramFiles: process.env.ProgramFiles,
    "ProgramFiles(x86)": process.env["ProgramFiles(x86)"], windir: process.env.windir,
    NODE_ENV: "test",
    E2E_SECRET: `bizzrow_e2e_${crypto.randomBytes(16).toString("hex")}`,
    E2E_NONCE: crypto.randomBytes(32).toString("hex"),
    MONGO_URI: `mongodb://127.0.0.1:${match[1]}/bizzrow_test?directConnection=true&replicaSet=bizzrowTestRs`,
    E2E_API_PORT: String(apiPort), CLIENT_ORIGIN: base, VITE_API_URL: api,
    E2E_BASE_URL: base, E2E_API_URL: api, E2E_BROWSER_PATH: browser,
    E2E_OUTPUT_DIR: path.join(temp, "results"),
  };
  if (process.argv[2] === "--backend") {
    env.FINANCIAL_TEST_MONGO_URI = env.MONGO_URI;
    const serverDir = path.join(root, "server");
    const files = fs.readdirSync(path.join(serverDir, "tests"))
      .filter((name) => name.endsWith(".test.js"))
      .map((name) => path.join(serverDir, "tests", name));
    const suite = start(["--test", ...files], env, serverDir);
    const code = await new Promise((resolve, reject) => {
      suite.once("error", reject);
      suite.once("exit", resolve);
    });
    if (code !== 0) process.exitCode = code || 1;
    return;
  }
  const backend = start([path.join(__dirname, "server.cjs")], env);
  await waitFor(`http://127.0.0.1:${apiPort}/health`, backend);
  const vite = start([path.join(client, "node_modules", "vite", "bin", "vite.js"), "--config",
    path.join(__dirname, "vite.config.js"), "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort",
    client], env, client);
  await waitFor(base, vite);
  const test = start([path.join(client, "node_modules", "@playwright", "test", "cli.js"),
    "test", "--config", path.join(__dirname, "playwright.config.js"), ...process.argv.slice(2)], env);
  const code = await new Promise((resolve, reject) => {
    test.once("error", reject);
    test.once("exit", (exitCode) => resolve(exitCode));
  });
  if (code !== 0) process.exitCode = code || 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  for (const child of children) if (child.exitCode === null) child.kill();
  if (container && /^[a-f0-9]{64}$/.test(container)) {
    try { docker("stop", container); } catch (error) { console.error("Failed to stop disposable container:", error.message); process.exitCode = 1; }
  }
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) {
    console.error(`Failed to remove E2E temporary directory ${temp}:`, error.message);
    process.exitCode = 1;
  }
});
