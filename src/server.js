import express from "express"
import cors from "cors"
import { Server } from "socket.io"
import { createServer } from "http"
import { config } from "./config/env.js"
import { ClientManager } from "./whatsapp/clientManager.js"
import { createInstancesRouter } from "./routes/instances.js"
import { createMessagesRouter } from "./routes/messages.js"
import { createDashboardRouter } from "./routes/dashboard.js"
import { createWebhooksRouter } from "./routes/webhooks.js"

const app = express()
const httpServer = createServer(app)

const allowedOrigins = [
  config.server.frontendUrl,
  "https://whats-app-saa-s.vercel.app",
  "https://3333-versao.vercel.app",
].filter(Boolean)

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
})

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)
app.use(express.json())

// Initialize WhatsApp Client Manager
const clientManager = new ClientManager(io)

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WhatsApp SaaS Backend is running" })
})

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() })
})

// Routes
app.use("/api/instances", createInstancesRouter(clientManager, io))
app.use("/api/messages", createMessagesRouter(clientManager))
app.use("/api/dashboard", createDashboardRouter())
app.use("/api/webhooks", createWebhooksRouter())

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)

  socket.on("join-instance", (instanceId) => {
    socket.join(`instance-${instanceId}`)
    console.log(`Socket ${socket.id} joined instance-${instanceId}`)
  })

  socket.on("leave-instance", (instanceId) => {
    socket.leave(`instance-${instanceId}`)
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id)
  })
})

const PORT = config.server.port || process.env.PORT || 3001
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Frontend URL: ${config.server.frontendUrl}`)
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`)
})
