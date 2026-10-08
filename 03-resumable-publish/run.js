// 출시 도중에 프로세스를 죽이고 다시 실행해 본다.
// 1부: 대비 없는 복사는 문서가 중복된다.
// 2부: 다시 실행해도 안전한 출시는 중복 없이 끝나고, 플레이어가 가리키던 문서 ID 도 그대로다.
const { fork } = require("child_process");
const path = require("path");
const { ObjectId } = require("mongodb");
const { startDb, connect } = require("../common/db");

const COLLECTIONS = ["items", "rooms", "npcs"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 편집본을 만든다: 아이템 40, 방 60(아이템을 가리킴), NPC 20(방을 가리킴)
async function seed(db) {
  await db.dropDatabase();
  const items = Array.from({ length: 40 }, (_, i) => ({ _id: new ObjectId(), name: `아이템 ${i + 1}` }));
  const rooms = Array.from({ length: 60 }, (_, i) => ({
    _id: new ObjectId(),
    name: `방 ${i + 1}`,
    itemIds: [items[i % 40]._id, items[(i + 7) % 40]._id],
  }));
  const npcs = Array.from({ length: 20 }, (_, i) => ({ _id: new ObjectId(), name: `NPC ${i + 1}`, roomId: rooms[i * 3]._id }));
  await db.collection("draft_items").insertMany(items);
  await db.collection("draft_rooms").insertMany(rooms);
  await db.collection("draft_npcs").insertMany(npcs);
  await db.collection("games").insertOne({ _id: "game-1", version: 0, done: [], lockUntil: null });
}

// 출시를 별도 프로세스로 실행한다. 그래야 "프로세스가 죽는다" 를 진짜로 해볼 수 있다.
function run(file, uri, crashAfter = 0) {
  const child = fork(path.join(__dirname, file), [], { env: { ...process.env, MONGO_URI: uri, CRASH_AFTER: String(crashAfter) } });
  return new Promise((resolve) => child.once("exit", resolve));
}

async function count(db, prefix) {
  let total = 0;
  for (const name of COLLECTIONS) total += await db.collection(`${prefix}_${name}`).countDocuments();
  return total;
}

// 공개본 안에서 다른 문서를 가리키는 ID 가 전부 실제로 있는 문서인지 센다.
async function checkRefs(db) {
  const itemIds = new Set((await db.collection("live_items").find().toArray()).map((d) => String(d._id)));
  const rooms = await db.collection("live_rooms").find().toArray();
  const roomIds = new Set(rooms.map((d) => String(d._id)));
  const npcs = await db.collection("live_npcs").find().toArray();
  const refs = [...rooms.flatMap((r) => r.itemIds.map((id) => itemIds.has(String(id)))), ...npcs.map((n) => roomIds.has(String(n.roomId)))];
  return { total: refs.length, broken: refs.filter((ok) => !ok).length };
}

(async () => {
  const { uri, stop } = await startDb();
  const { client, db } = await connect(uri);

  console.log("== 1부: 대비 없는 복사 ==");
  await seed(db);
  console.log(`편집본 문서 ${await count(db, "draft")}건`);
  console.log("출시 (도중에 죽임)");
  await run("publish-naive.js", uri, 70);
  console.log("다시 출시");
  await run("publish-naive.js", uri);
  console.log(`=> 공개본 문서 ${await count(db, "live")}건 (120건이어야 함)\n`);

  console.log("== 2부: 다시 실행해도 안전한 출시 ==");
  await seed(db);
  console.log("첫 출시");
  await run("publish.js", uri);
  const room = await db.collection("live_rooms").findOne({ name: "방 30" });
  console.log(`플레이어가 "${room.name}" 에 서 있음 (공개본 ID ${room._id})\n`);

  // 창작자가 편집본을 고친다: 방 이름 변경, 방 5개 추가
  const draftRoom = await db.collection("draft_rooms").findOne({ name: "방 30" });
  await db.collection("draft_rooms").updateOne({ _id: draftRoom._id }, { $set: { name: "방 30 (수정됨)" } });
  await db.collection("draft_rooms").insertMany(Array.from({ length: 5 }, (_, i) => ({ name: `새 방 ${i + 1}`, itemIds: [] })));
  console.log(`편집본 수정: 방 이름 1건 변경, 방 5개 추가 (편집본 ${await count(db, "draft")}건)`);

  console.log("재출시 (도중에 죽임)");
  await run("publish.js", uri, 70);
  console.log(`  이 시점의 공개본: ${await count(db, "live")}건, 완료 표시: ${(await db.collection("games").findOne()).done.join(", ")}`);
  console.log("바로 재시도");
  await run("publish.js", uri);
  console.log("잠금 유효 시간(3초)이 지난 뒤 재시도");
  await sleep(3100);
  await run("publish.js", uri);

  const refs = await checkRefs(db);
  const sameRoom = await db.collection("live_rooms").findOne({ _id: room._id });
  console.log(`=> 공개본 문서 ${await count(db, "live")}건 (125건이어야 함)`);
  console.log(`=> 문서끼리 가리키는 참조 ${refs.total}건 중 끊긴 것 ${refs.broken}건`);
  console.log(`=> 플레이어가 서 있던 ID ${room._id} 의 방: "${sameRoom.name}"`);

  await client.close();
  await stop();
})();
