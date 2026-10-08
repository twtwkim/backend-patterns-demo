// 프로세스 4개가 같은 토큰으로 저장을 25번씩, 모두 100번을 동시에 시도한다.
// 저장은 1번만 일어나야 한다. 방법마다 실제로 몇 번 저장됐는지 센다.
const { fork } = require("child_process");
const path = require("path");
const { startDb, connect } = require("../common/db");

const PROCESSES = 4;
const ATTEMPTS = 25;
const STRATEGIES = [
  ["memory", "메모리에 처리 중 표시"],
  ["check-then-write", "DB 에서 확인하고 나서 적기"],
  ["conditional", "조건부 갱신"],
];

async function runOnce(uri, db, strategy) {
  await db.collection("saved").deleteMany({});
  await db.collection("tokens").replaceOne({ _id: "token-1" }, { status: "issued" }, { upsert: true });

  const workers = Array.from({ length: PROCESSES }, () =>
    fork(path.join(__dirname, "worker.js"), [strategy, String(ATTEMPTS)], { env: { ...process.env, MONGO_URI: uri } })
  );
  // 모든 프로세스가 DB 에 붙은 뒤에 한꺼번에 출발시킨다.
  await Promise.all(workers.map((w) => new Promise((resolve) => w.once("message", resolve))));
  workers.forEach((w) => w.send("go"));
  await Promise.all(workers.map((w) => new Promise((resolve) => w.once("exit", resolve))));

  return db.collection("saved").countDocuments();
}

(async () => {
  const { uri, stop } = await startDb();
  const { client, db } = await connect(uri);

  console.log(`프로세스 ${PROCESSES}개 x ${ATTEMPTS}번 = 같은 토큰으로 저장 ${PROCESSES * ATTEMPTS}번 시도\n`);
  for (const [strategy, label] of STRATEGIES) {
    const saved = await runOnce(uri, db, strategy);
    console.log(`${label.padEnd(20)} 저장된 횟수: ${String(saved).padStart(3)}  ${saved === 1 ? "OK" : "중복 저장"}`);
  }

  await client.close();
  await stop();
})();
