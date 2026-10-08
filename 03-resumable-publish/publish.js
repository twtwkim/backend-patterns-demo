// 편집본(draft_*)을 공개본(live_*)으로 옮기는 "출시".
// 도중에 프로세스가 죽어도, 다시 실행하면 중복 없이 이어서 끝나게 만든다.
const { ObjectId } = require("mongodb");
const { connect } = require("../common/db");

const GAME_ID = "game-1";
const COLLECTIONS = ["items", "rooms", "npcs"];
const LEASE_MS = 3000; // 잠금 유효 시간. 예제라서 짧게 잡았다.
const CRASH_AFTER = Number(process.env.CRASH_AFTER || 0); // 문서를 이만큼 쓰면 일부러 죽는다.

let written = 0;
function crashIfNeeded() {
  if (CRASH_AFTER && ++written === CRASH_AFTER) {
    console.log(`  문서 ${written}건을 쓴 시점에 프로세스 강제 종료`);
    process.exit(1);
  }
}

// ① 잠금: 비어 있거나 유효 시간이 지났을 때만 내 것으로 바꾼다. 잠금을 쥐고 죽어도 시간이 지나면 풀린다.
async function acquireLock(db) {
  const now = new Date();
  const game = await db.collection("games").findOneAndUpdate(
    { _id: GAME_ID, $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: new Date(now.getTime() + LEASE_MS) } },
    { returnDocument: "after" }
  );
  if (!game) throw new Error("다른 출시가 진행 중이라 거절됨 (잠금이 아직 유효함)");
  return game;
}

// ② 공개본 ID 예약: "이 편집본 문서는 이 ID 로 간다" 를 쓰기 전에 먼저 기록한다.
//    이미 기록이 있으면 그대로 둔다. 그래서 몇 번을 다시 실행해도 같은 문서는 같은 ID 로 간다.
async function reserveIds(db) {
  for (const name of COLLECTIONS) {
    const drafts = await db.collection(`draft_${name}`).find({}, { projection: { _id: 1 } }).toArray();
    if (!drafts.length) continue;
    await db.collection("id_map").bulkWrite(
      drafts.map((d) => ({
        updateOne: { filter: { _id: d._id }, update: { $setOnInsert: { liveId: new ObjectId() } }, upsert: true },
      }))
    );
  }
  const rows = await db.collection("id_map").find().toArray();
  return new Map(rows.map((r) => [String(r._id), r.liveId]));
}

// 편집본 문서를 공개본 모양으로 바꾼다. 다른 문서를 가리키는 ID 도 공개본 ID 로 바꾼다.
function toLive(doc, idMap) {
  const { _id, ...rest } = doc;
  if (rest.itemIds) rest.itemIds = rest.itemIds.map((id) => idMap.get(String(id)));
  if (rest.roomId) rest.roomId = idMap.get(String(rest.roomId));
  return rest;
}

// ③ 컬렉션 하나 옮기기: 있으면 덮어쓰고 없으면 만든다. 반쯤 옮기다 죽어도 처음부터 다시 옮기면 결과가 같다.
async function syncCollection(db, name, idMap) {
  const drafts = await db.collection(`draft_${name}`).find().toArray();
  for (const doc of drafts) {
    await db.collection(`live_${name}`).replaceOne({ _id: idMap.get(String(doc._id)) }, toLive(doc, idMap), { upsert: true });
    crashIfNeeded();
  }
  return drafts.length;
}

async function publish(db) {
  const game = await acquireLock(db);
  const idMap = await reserveIds(db);

  for (const name of COLLECTIONS) {
    if (game.done.includes(name)) {
      console.log(`  ${name}: 지난 실행에서 끝남, 건너뜀`);
      continue;
    }
    const count = await syncCollection(db, name, idMap);
    await db.collection("games").updateOne({ _id: GAME_ID }, { $addToSet: { done: name } }); // 완료 표시
    console.log(`  ${name}: ${count}건 옮김`);
  }

  // ④ 버전 확정, 완료 표시 초기화, 잠금 해제
  const after = await db.collection("games").findOneAndUpdate(
    { _id: GAME_ID },
    { $inc: { version: 1 }, $set: { done: [], lockUntil: null } },
    { returnDocument: "after" }
  );
  console.log(`  출시 완료, 버전 ${after.version}`);
}

(async () => {
  const { client, db } = await connect(process.env.MONGO_URI);
  try {
    await publish(db);
  } catch (err) {
    console.log(`  ${err.message}`);
    process.exitCode = 2;
  } finally {
    await client.close();
  }
})();
