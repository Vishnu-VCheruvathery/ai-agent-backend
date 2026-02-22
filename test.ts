import { ChromaClient } from "chromadb";
import { ocrCollection } from "./src/models/chromaCollection";


async function test() {
  const client = new ChromaClient();

    
const results = await ocrCollection.query({
  nResults: 3,
  queryTexts: ["analytical writing section summary"]
});

console.log(results.documents.join("\n---\n"));
}

test();