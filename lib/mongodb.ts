import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);

export async function getDb() {
  await client.connect();
  return client.db('bracket');
}
