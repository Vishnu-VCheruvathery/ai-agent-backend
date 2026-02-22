import 'dotenv/config'
import {Redis} from 'ioredis';
import {Queue, Worker} from 'bullmq'
import { extractText, pdfToPics, summarize } from '../utils/tools.js';
import { Document } from '../models/document.js';
import fs from 'fs'
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

interface ResultText{
    text:string,
    metadata: Metadata
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

const uploadWorker = new Worker('upload', async job => {
    const {file,  convId} = job.data;
    try {
        await pdfToPics(file.path , file.originalname);
        const document = new Document({
            title: file.originalname,
            type: file.mimetype
        })
        await document.save();

        await ocrQueue.add('ocr', {id: document._id, convId})
    } catch (error) {
        console.log(error);
    }
}, {connection})

uploadWorker.on('completed', job => {
      const {file} = job.data;
      fs.unlink(file.path, (err) => {
                        if(err){
                            console.error('Error deleting file: ', err);
                        }else{
                            console.log('Uploaded FILE DELETED')
                        }
                     })
    console.log(`Upload Job with id ${job.id} has been completed`);
})

uploadWorker.on("failed", (job, err) => {
    console.log(`Job with id ${job?.id} has failed with error ${err.message}`);
})

const ocrWorker = new Worker(
  "ocr",
  async (job) => {
    const { id, convId } = job.data;

    try {
      let resultTexts: ResultText[] = [];

      const files = fs.readdirSync(`${process.cwd()}/images/`)
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] ?? "0");
    const numB = parseInt(b.match(/\d+/)?.[0] ?? "0");
    return numA - numB;
  });

      for (let pageIndex = 0; pageIndex < files.length; pageIndex++) {
        const file = files[pageIndex];
        const imagePath = `${process.cwd()}/images/${file}`;

        const chunks = await extractText(imagePath);

        chunks?.forEach((chunk, chunkIndex) => {
          resultTexts.push({
            text: chunk,
            metadata: {
              doc_id: id,
              file_name: file,
              page_number: pageIndex,
              chunk_index: chunkIndex,
              conversation_id: convId,
              timestamp: new Date().toISOString(),
              source_type: "ocr-image",
            },
          });
        });

        const percent = Math.round(((pageIndex + 1) / files.length) * 100);
        await job.updateProgress(percent);
      }

      if (resultTexts.length === 0) {
        console.log("⚠️ No OCR text extracted, skipping insert");
        return;
      }

      console.log("✅ Inserting chunks into Chroma:", resultTexts.length);

      // ✅ MUST await insert
      await ocrCollection.add({
        ids: resultTexts.map((_, i) => `${convId}-${id}-${i}`),
        documents: resultTexts.map((r) => r.text),
        metadatas: resultTexts.map((r) => r.metadata),
      });

      console.log("🎉 Insert complete!");

    } catch (error) {
      console.error("🔥 OCR Worker Error:", error);
      throw error;
    }
  },
  { connection }
);



ocrWorker.on('completed', job => {
  console.log('the current working directory: ',process.cwd())
    const files = fs.readdirSync(`${process.cwd()}/images/`);
     files.forEach(async(file) => {
                         fs.unlink(file, (err) => {
                        if(err){
                            console.error('Error deleting file: ', err);
                        }else{
                            console.log('IMG FILE DELETED')
                        }
                     })
                     })   
          
        console.log(`OCR Job with id ${job.id} has been completed`);
})

ocrWorker.on("failed", (job, err) => {


console.log(`Job with id ${job?.id} has failed with error ${err.message}`);
})

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


export {uploadQueue, ocrQueue, summaryQueue};
