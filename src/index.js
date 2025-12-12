const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")
require("dotenv").config()

const authMiddleware = require("./middleware/auth")
const authRoutes = require("./routes/auth")
const instancesRoutes = require("./routes/instances")
const dashboardRoutes = require("./routes/dashboard")
const messagesRoutes = require("./routes/messages")
const webhooksRoutes = require("./routes/webhooks")

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
})

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  }),
)
app.use(express.json())

// Make io available to routes
app.set("io", io)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// Public routes
app.use("/api/auth", authRoutes)
app.use("/api/webhooks", webhooksRoutes)

// Protected routes
app.use("/api/instances", authMiddleware, instancesRoutes)
app.use("/api/dashboard", authMiddleware, dashboardRoutes)
app.use("/api/messages", authMiddleware, messagesRoutes)

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)

  socket.on("join-instance", (instanceId) => {
    socket.join(`instance:${instanceId}`)
    console.log(`Socket ${socket.id} joined instance:${instanceId}`)
  })

  socket.on("leave-instance", (instanceId) => {
    socket.leave(`instance:${instanceId}`)
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id)
  })
})

const PORT = process.env.PORT || 8080

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`)
})
