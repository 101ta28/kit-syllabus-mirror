const CDP = "http://127.0.0.1:9222";
const BASE = "http://127.0.0.1:5173";

async function json(url, init = undefined) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  async function send(method, params = {}) {
    await ready;
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, 15000);
    });
  }
  return { send, events, close: () => ws.close() };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitLoad(tab) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (tab.events.some((event) => event.method === "Page.loadEventFired")) return;
    await sleep(100);
  }
}

async function evaluate(tab, expression) {
  const result = await tab.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
}

const target = await json(`${CDP}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
const tab = connect(target.webSocketDebuggerUrl);
await tab.send("Page.enable");
await tab.send("Runtime.enable");

await tab.send("Page.navigate", { url: BASE + "/" });
await waitLoad(tab);
await sleep(1500);
const home = await evaluate(
  tab,
  `(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.innerText,
    total: document.body.innerText.includes('1,056'),
    firstCourse: document.body.innerText.includes('修学基礎Ａ')
  }))()`,
);

await evaluate(tab, `document.querySelector('input')?.focus()`);
await tab.send("Input.insertText", { text: "修学基礎" });
await sleep(500);
const filtered = await evaluate(
  tab,
  `(() => ({
    summary: document.querySelector('.result-summary')?.innerText,
    hasCourse: document.body.innerText.includes('修学基礎Ａ')
  }))()`,
);

await tab.send("Page.navigate", { url: BASE + "/courses/2026/spring/G001-01/shugaku-kiso-a" });
await waitLoad(tab);
await sleep(1500);
const detail = await evaluate(
  tab,
  `(() => ({
    h1: document.querySelector('h1')?.innerText,
    hasTeachers: document.body.innerText.includes('担当教員'),
    hasLessons: document.body.innerText.includes('授業明細'),
    url: location.pathname
  }))()`,
);

await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then(async (shot) => {
  const fs = await import("node:fs/promises");
  await fs.writeFile("verification-detail.png", Buffer.from(shot.data, "base64"));
});

tab.close();
console.log(JSON.stringify({ home, filtered, detail }, null, 2));
