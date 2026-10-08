// API 서버: 데이터를 바꾸고, 실시간 서버에 "이 사람에게 알려줘" 라고 통보한다.
const http = require("http");
const crypto = require("crypto");
const { runWithRequestId, getRequestId, createLogger } = require("./context");

const log = createLogger("api");
const REALTIME_URL = "http://localhost:47002/notify";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 실시간 서버를 부르는 곳은 여기 하나뿐이다. 요청 ID 를 싣는 일도 여기서만 한다.
async function notifyRealtime(params) {
  const requestId = getRequestId();
  await fetch(REALTIME_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestId ? { ...params, _requestId: requestId } : params),
  });
}

// 아래 함수들은 요청 ID 를 인자로 받지 않는다.
async function buyItem(userId, itemId) {
  log(`구매 시작 user=${userId} item=${itemId}`);
  await payGold(userId);
  await addToInventory(userId, itemId);
}

async function payGold(userId) {
  await sleep(Math.random() * 30); // DB 를 다녀오는 시간을 흉내 낸다. 그 사이 다른 요청이 끼어든다.
  log(`골드 차감 user=${userId}`);
}

async function addToInventory(userId, itemId) {
  await sleep(Math.random() * 30);
  log(`가방에 추가 user=${userId} item=${itemId}`);
  await notifyRealtime({ userId, message: `${itemId} 구매 완료` });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const requestId = crypto.randomUUID().slice(0, 8);
    // 요청이 들어온 순간 ID 를 만들고, 이 요청의 처리가 끝날 때까지 묶어 둔다.
    runWithRequestId(requestId, async () => {
      await buyItem(url.searchParams.get("user"), url.searchParams.get("item"));
      res.setHeader("x-request-id", requestId);
      res.end("ok");
    });
  })
  .listen(47001, () => process.send?.("ready"));
