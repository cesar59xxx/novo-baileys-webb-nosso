const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")
require("dotenv").config()

const { supabase } = require("./config/supabase")
const authMiddleware = require("./middleware/auth")
const instancesRoutes = require("./routes/instances")
const dashboardRoutes = require("./routes/dashboard")
const messagesRoutes = require("./routes/messages")
const webhooksRoutes = require("./routes/webhooks")

const app = express()
const server = http.createServer(app)

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://whats-app-saa-s.vercel.app",
  "https://3333-versao.vercel.app",
].filter(Boolean)

const io = new Server(server, {
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

// Make io and supabase available to routes
app.set("io", io)
app.set("supabase", supabase)

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WhatsApp SaaS Backend is running" })
})

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() })
})

// Public routes
app.use("/api/webhooks", webhooksRoutes)

// Protected routes - all use project_id, not user_id
app.use("/api/instances", authMiddleware, instancesRoutes)
app.use("/api/dashboard", authMiddleware, dashboardRoutes)
app.use("/api/messages", authMiddleware, messagesRoutes)

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

const PORT = process.env.PORT || 8080

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`)
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`)
})
