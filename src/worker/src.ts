import 'dotenv/config'
import {Redis} from 'ioredis';
import {Queue, Worker} from 'bullmq'
import { summarize } from '../utils/tools.js';
import { messageCollection, ocrCollection } from '../models/chromaCollection.js'
import mongoose, { Types } from "mongoose"
import { Message } from '../models/message.js';




type Metadata = {
    doc_id: string,
    file_name: string,
    page_number: number,
    chunk_index: number,
    timestamp: string,
    source_type: string,
    conversation_id: string
}



type Message = {
  content?: string | null
  conversationId: string

}


mongoose.connect(process.env.MONGO_URL!).then(() => console.log("Connected to MongoDB"))
        .catch((err) => console.error("Failed to connect to MongoDB", err));

const connection = new Redis(process.env.REDIS_URL!, {maxRetriesPerRequest: null});

if(connection){
    console.log("Redis connected");
}





const uploadQueue = new Queue('upload', {connection});
const ocrQueue = new Queue('ocr', {connection});
const summaryQueue = new Queue('summary', {connection})



const summaryWorker = new Worker(
  "summary",
  async (job) => {
    const { convId } = job.data;

    console.log("🟢 Summary job started for:", convId);

    try {
      // 1️⃣ Fetch unsummarized messages (batch)
      const rawMessages = await Message.find({
        conversationId: convId,
        summarized: false,
      })
        .sort({ createdAt: 1 }) // oldest first
        .limit(3)
        .lean();

      // 2️⃣ Nothing to summarize
      if (rawMessages.length === 0) {
        console.log("⚠️ No new messages to summarize");
        return { status: "empty" };
      }

      // 3️⃣ Convert into proper format for AI
      const messages = rawMessages.map((m) => ({
        content: m.content ?? "",
        conversationId: m.conversationId.toString(),
        summarized: m.summarized ?? false,
      }));

      console.log("📩 Messages being summarized:", messages);

      // 4️⃣ Run AI summarization
      const result = await summarize(messages);

      if (!result?.content) {
        console.log("❌ Summarizer returned nothing");
        return { status: "failed", reason: "Empty AI response" };
      }

      // 5️⃣ Normalize summary text
      const summary =
        typeof result.content === "string"
          ? result.content
          : result.content.map((block) => block.text).join(" ");

      console.log("✅ Summary generated:", summary);

      // 6️⃣ Store summary in vector DB / collection
      await messageCollection.add({
        ids: [`summary-${convId}-${Date.now()}`],
        documents: [summary],
        metadatas: [{ conversation_id: convId }],
      });

      // 7️⃣ Mark these messages as summarized
      await Message.updateMany(
        { _id: { $in: rawMessages.map((m) => m._id) } },
        { $set: { summarized: true } }
      );

      console.log("✅ Messages marked as summarized");

      return {
        status: "summarized",
        count: rawMessages.length,
      };
    } catch (err) {
      console.error("🔥 Summary worker error:", err);

      // IMPORTANT: Throw so BullMQ marks job as failed
      throw err;
    }
  },
  { connection }
);


export {uploadQueue, summaryQueue, ocrQueue};
