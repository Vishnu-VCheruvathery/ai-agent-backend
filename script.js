import { ChromaClient } from "chromadb";

const client = new ChromaClient({
  host: "localhost",
  port: 8000,
  ssl: false,
});

async function checkDocs() {
  const ocr = await client.getCollection({ name: "ocr_data" });

  const count = await ocr.count();
  console.log("📄 Docs inside ocr_data:", count);

  const results = await ocr.query({
    queryTexts: ["test"],
    nResults: 3,
    include: ["documents", "metadatas"],
  });

  console.log("🔍 Sample query result:");
  console.log(JSON.stringify(results, null, 2));
}

checkDocs();