import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { supabase } from "../config/supabase.js"

export function createDashboardRouter() {
  const router = express.Router()

  // Get dashboard metrics
  router.get("/metrics", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const today = new Date().toISOString().split("T")[0]

      const { data: instances } = await supabase.from("whatsapp_instances").select("id").eq("user_id", userId)

      const instanceIds = instances?.map((i) => i.id) || []

      if (instanceIds.length === 0) {
        return res.json({
          totalMessages: 0,
          messagesReceived: 0,
          messagesSent: 0,
          activeContacts: 0,
          totalContacts: 0,
          connectedInstances: 0,
          totalInstances: 0,
        })
      }

      const { count: totalMessages } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .gte("created_at", today)

      const { count: messagesReceived } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .eq("direction", "incoming")
        .gte("created_at", today)

      const { count: messagesSent } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .eq("direction", "outgoing")
        .gte("created_at", today)

      const { count: totalContacts } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)

      const { count: activeContacts } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .gte("last_message_at", today)

      const { count: connectedInstances } = await supabase
        .from("whatsapp_instances")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "connected")

      res.json({
        totalMessages: totalMessages || 0,
        messagesReceived: messagesReceived || 0,
        messagesSent: messagesSent || 0,
        activeContacts: activeContacts || 0,
        totalContacts: totalContacts || 0,
        connectedInstances: connectedInstances || 0,
        totalInstances: instanceIds.length,
      })
    } catch (error) {
      console.error("Error fetching metrics:", error)
      res.status(500).json({ error: "Failed to fetch metrics" })
    }
  })

  return router
}
