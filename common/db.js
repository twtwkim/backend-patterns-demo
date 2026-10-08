// 예제가 끝나면 사라지는 임시 MongoDB 를 띄운다. 내 컴퓨터에 MongoDB 를 깔지 않아도 된다.
const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient } = require("mongodb");

async function startDb() {
  const server = await MongoMemoryServer.create();
  return { uri: server.getUri(), stop: () => server.stop() };
}

async function connect(uri) {
  const client = await MongoClient.connect(uri);
  return { client, db: client.db("demo") };
}

module.exports = { startDb, connect };
