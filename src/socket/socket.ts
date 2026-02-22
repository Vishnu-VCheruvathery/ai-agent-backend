import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import * as http from "http";

let io: Server;

export async function initSocket(httpServer: http.Server) {
  io = new Server(httpServer, {
    cors: {
      origin: `${process.env.FRONTEND_URL}`,
      methods: ["GET", "POST"],
    },
  });

  try {
    console.log("⏳ Connecting Redis...");

    const pubClient = createClient({
      url: process.env.REDIS_URL,
    });

    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) =>
      console.error("🔥 Redis Pub Client Error:", err)
    );

    subClient.on("error", (err) =>
      console.error("🔥 Redis Sub Client Error:", err)
    );

    // ✅ Add timeout safety
    await Promise.race([
      Promise.all([pubClient.connect(), subClient.connect()]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis connection timeout")), 5000)
      ),
    ]);

    io.adapter(createAdapter(pubClient, subClient));

    console.log("✅ Socket.IO + Redis adapter ready");
  } catch (err) {
    console.error("❌ Redis adapter setup failed:", err);

    console.log("⚠️ Falling back to normal Socket.IO (no Redis)");
  }

  return io;
}

export function getIO() {
  return io;
}

