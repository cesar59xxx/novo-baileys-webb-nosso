const express = require("express")
const { authMiddleware } = require("../middleware/auth")
const { supabase } = require("../config/supabase")

function createDashboardRouter() {
  const router = express.Router()

  // Get dashboard metrics
  router.get("/metrics", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id
      const today = new Date().toISOString().split("T")[0]

      // Get user's instances
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

      // Get message counts
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

      // Get contact counts
      const { count: totalContacts } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)

      const { count: activeContacts } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .gte("last_message_at", today)

      // Get instance counts
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

module.exports = { createDashboardRouter }
