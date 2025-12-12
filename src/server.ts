import express from "express"
import cors from "cors"
import { Server } from "socket.io"
import { createServer } from "http"
import { config } from "./config/env"
import { ClientManager } from "./whatsapp/clientManager"
import { createInstancesRouter } from "./routes/instances"
import { createMessagesRouter } from "./routes/messages"
import { createDashboardRouter } from "./routes/dashboard"
import { createWebhooksRouter } from "./routes/webhooks"

const app = express()
const httpServer = createServer(app)

const allowedOrigins = [config.server.frontendUrl, "http://localhost:3000", "https://3333-versao.vercel.app"].filter(
  Boolean,
)

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
})

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)
app.use(express.json())

// Initialize WhatsApp client manager with Baileys
const clientManager = new ClientManager(io)

// Routes
app.use("/api/instances", createInstancesRouter(clientManager))
app.use("/api/instances", createMessagesRouter(clientManager))
app.use("/api/dashboard", createDashboardRouter())
app.use("/api/webhooks", createWebhooksRouter())

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    library: "baileys",
    timestamp: new Date().toISOString(),
  })
})

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("[Socket.IO] Client connected:", socket.id)

  socket.on("disconnect", () => {
    console.log("[Socket.IO] Client disconnected:", socket.id)
  })
})

// Start server
const PORT = config.server.port
httpServer.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`)
  console.log(`[Server] Using Baileys for WhatsApp connection`)
  console.log(`[Server] Frontend URL: ${config.server.frontendUrl}`)
})
