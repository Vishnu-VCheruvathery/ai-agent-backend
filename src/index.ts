process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION FULL:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 UNHANDLED REJECTION FULL:", reason);
});

import "dotenv/config";
import app from "./server.js";
import { createServer } from "http";
import agent from "./agent/ai.js";
import { HumanMessage, isAIMessage } from "@langchain/core/messages";
import { Message } from "./models/message.js";
import { initSocket } from "./socket/socket.js";
import { QueueEvents } from "bullmq";
import {Redis} from 'ioredis';
import { ocrQueue, summaryQueue } from "./worker/src.js";

const httpServer = createServer(app);

const connection = new Redis(process.env.REDIS_URL!, {maxRetriesPerRequest: null});

if(connection){
    console.log("Redis connected");
}

export function extractText(content: any): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((c) => c.text ?? "")
      .join("");
  }

  return JSON.stringify(content);
}


// ✅ Start server immediately
httpServer.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});

// ✅ THEN initialize socket
const io = await initSocket(httpServer);

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("joinConversation", ({ convId }) => {
    socket.join(`chat:${convId}`);
    socket.join(`progress:${convId}`);

    console.log("Joined rooms for:", convId);
  });

  socket.on("msg", async (data) => {
   console.log('socket data: ', data)
    try {
      await Message.create({
        conversationId: data.convId,
        role: "user",
        content: data.input,
        summarized: false,
      });

      const result = await agent.invoke({
        convId: data.convId,
        messages: [new HumanMessage({ content: data.input })],
        mode: data.mode,
        llmCalls: 0,
        answer: ""
      });

    const lastMessage = result.messages[result.messages.length - 1];
if (lastMessage && isAIMessage(lastMessage)) {
  const text = extractText(lastMessage.content);
  io.to(`chat:${data.convId}`).emit("response", text);

  await Message.create({
    conversationId: data.convId,
    role: "ai",
    content: text,
    summarized: false,
  });

  await summaryQueue.add("summary", { convId: data.convId });
}else{
  console.error('Format of answer is wrong!')
  console.log(lastMessage)
  socket.emit("response", "Something went wrong on the server.");
}
    } catch (err) {
      console.error("🔥 Error in msg handler:", err);
      socket.emit("response", "Something went wrong on the server.");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const queueEvents = new QueueEvents("ocr", { connection });
await queueEvents.waitUntilReady();

queueEvents.on("progress", async ({ jobId, data }) => {
  const job = await ocrQueue.getJob(jobId);

  const convId = job?.data.convId;

  if (convId) {
    io.to(`progress:${convId}`).emit("progress", data);
  }
});


