// 서버 두 개를 띄우고 구매 요청 10개를 동시에 보낸다.
// 로그는 서버마다 다른 파일에 뒤섞여 쌓인다. 요청 ID 하나로 두 파일을 검색해 한 요청의 흐름만 뽑아 본다.
const { fork } = require("child_process");
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const USERS = 10;

function start(file) {
  const child = fork(path.join(__dirname, file));
  return new Promise((resolve) => child.once("message", () => resolve(child)));
}

const readLog = (name) => fs.readFileSync(path.join(LOG_DIR, `${name}.log`), "utf8").trim().split("\n");

(async () => {
  fs.rmSync(LOG_DIR, { recursive: true, force: true });
  fs.mkdirSync(LOG_DIR);
  const servers = [await start("realtime.js"), await start("api.js")];

  const responses = await Promise.all(
    Array.from({ length: USERS }, (_, i) => fetch(`http://localhost:47001/buy?user=user${i + 1}&item=sword`))
  );
  const requestId = responses[6].headers.get("x-request-id"); // user7 의 요청

  const apiLog = readLog("api");
  const realtimeLog = readLog("realtime");

  console.log(`구매 요청 ${USERS}개를 동시에 보냄. api.log ${apiLog.length}줄, realtime.log ${realtimeLog.length}줄\n`);
  console.log("api.log 중간 부분 (여러 요청이 섞여 있다)");
  apiLog.slice(12, 18).forEach((line) => console.log("  " + line));
  console.log(`\n요청 ID ${requestId} 로 두 파일을 검색`);
  [...apiLog, ...realtimeLog].filter((line) => line.includes(requestId)).forEach((line) => console.log("  " + line));

  servers.forEach((s) => s.kill());
})();
