// 요청 하나를 처리하는 동안 어디서든 꺼내 볼 수 있는 저장소.
// 함수 인자로 넘기지 않아도, 같은 요청 안에서는 같은 값이 나온다.
const { AsyncLocalStorage } = require("async_hooks");
const fs = require("fs");
const path = require("path");

const storage = new AsyncLocalStorage();

function runWithRequestId(requestId, fn) {
  return storage.run({ requestId }, fn);
}

function getRequestId() {
  return storage.getStore()?.requestId;
}

// 로그를 남길 때마다 지금 요청의 ID 를 같이 적는다.
function createLogger(name) {
  const file = path.join(__dirname, "logs", `${name}.log`);
  return (message) => fs.appendFileSync(file, `[${name}] [${getRequestId() ?? "-"}] ${message}\n`);
}

module.exports = { runWithRequestId, getRequestId, createLogger };
