import type { Collection, Document } from 'mongodb';

import type { MongoDBTestDB } from './client.js';

export async function getCollection<TSchema extends Document = Document>(
  database: MongoDBTestDB,
  collectionName: string
): Promise<Collection<TSchema>> {
  return (await database.collection(collectionName)) as Collection<TSchema>;
}
