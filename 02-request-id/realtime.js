// 실시간 서버: API 서버의 통보를 받아 접속자에게 알린다. (예제에서는 로그만 남긴다)
const http = require("http");
const { runWithRequestId, createLogger } = require("./context");

const log = createLogger("realtime");

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const { _requestId, userId, message } = JSON.parse(raw);
      // 통보에 실려 온 ID 를 그대로 이어서 쓴다.
      runWithRequestId(_requestId, () => {
        log(`통보 받음 user=${userId}`);
        log(`화면에 전송 user=${userId} "${message}"`);
        res.end("ok");
      });
    });
  })
  .listen(47002, () => process.send?.("ready"));
