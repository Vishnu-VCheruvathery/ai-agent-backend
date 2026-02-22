import "dotenv/config";
import { ChromaClient } from "chromadb";
import { CloudClient } from "chromadb";
// import { SentenceTransformersEmbeddingFunction } from '@chroma-core/sentence-transformer';

const client = new CloudClient({
  apiKey: process.env.CHROMA_API_KEY,
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DB
});

const ocrCollection = await client.getOrCreateCollection({
  name: "ocr_data",
});

const messageCollection = await client.getOrCreateCollection({
  name: "message_history",
});

export { ocrCollection, messageCollection };

