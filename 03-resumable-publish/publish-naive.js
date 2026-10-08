// 비교용: 아무 대비 없이 편집본을 공개본으로 복사한다.
// 도중에 죽은 뒤 다시 실행하면, 앞서 복사한 문서를 또 복사한다.
const { connect } = require("../common/db");

const COLLECTIONS = ["items", "rooms", "npcs"];
const CRASH_AFTER = Number(process.env.CRASH_AFTER || 0);

(async () => {
  const { client, db } = await connect(process.env.MONGO_URI);
  let written = 0;
  for (const name of COLLECTIONS) {
    const drafts = await db.collection(`draft_${name}`).find().toArray();
    for (const { _id, ...rest } of drafts) {
      await db.collection(`live_${name}`).insertOne({ ...rest, draftId: _id }); // 실행할 때마다 새 ID 가 붙는다
      if (CRASH_AFTER && ++written === CRASH_AFTER) {
        console.log(`  문서 ${written}건을 쓴 시점에 프로세스 강제 종료`);
        process.exit(1);
      }
    }
    console.log(`  ${name}: ${drafts.length}건 복사`);
  }
  console.log("  출시 완료");
  await client.close();
})();
