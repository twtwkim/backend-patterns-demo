// 서버 프로세스 하나 역할. 부모가 "go" 를 보내면 같은 토큰으로 저장을 여러 번 동시에 시도한다.
const { connect } = require("../common/db");

const TOKEN = "token-1";
const strategy = process.argv[2];
const attempts = Number(process.argv[3]);

// 방법 1: 메모리에 "처리 중" 표시. 이 표시는 이 프로세스만 볼 수 있다.
const processing = new Set();
async function withMemoryFlag(db) {
  if (processing.has(TOKEN)) return;
  processing.add(TOKEN);
  await write(db);
}

// 방법 2: DB 에서 확인하고, 그다음에 적는다. 확인과 적기 사이에 틈이 있다.
async function checkThenWrite(db) {
  const doc = await db.collection("tokens").findOne({ _id: TOKEN });
  if (doc.status !== "issued") return;
  await db.collection("tokens").updateOne({ _id: TOKEN }, { $set: { status: "reserved" } });
  await write(db);
}

// 방법 3: "아직 안 쓴 토큰일 때만 바꿔라" 를 한 번에 시킨다. 바꾸는 데 성공한 요청만 저장한다.
async function conditionalUpdate(db) {
  const doc = await db.collection("tokens").findOneAndUpdate(
    { _id: TOKEN, status: "issued" },
    { $set: { status: "reserved" } }
  );
  if (!doc) return;
  await write(db);
}

// 실제 저장. 몇 번 불렸는지 세려고 호출마다 문서를 하나 남긴다.
async function write(db) {
  await db.collection("saved").insertOne({ token: TOKEN, pid: process.pid });
}

const STRATEGIES = { memory: withMemoryFlag, "check-then-write": checkThenWrite, conditional: conditionalUpdate };

(async () => {
  const { client, db } = await connect(process.env.MONGO_URI);
  process.send("ready");
  process.once("message", async () => {
    await Promise.all(Array.from({ length: attempts }, () => STRATEGIES[strategy](db)));
    await client.close();
    process.exit(0);
  });
})();
