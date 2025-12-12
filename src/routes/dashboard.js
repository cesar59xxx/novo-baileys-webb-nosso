const express = require("express")
const router = express.Router()
const { supabase } = require("../config/supabase")

// GET /api/dashboard - Get dashboard stats
// Uses project_id through projects table, NOT user_id directly
router.get("/", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    // Get user's projects first
    const { data: projects } = await supabase.from("projects").select("id").eq("owner_id", userId)

    if (!projects || projects.length === 0) {
      return res.json({
        totalInstances: 0,
        connectedInstances: 0,
        totalMessages: 0,
        totalContacts: 0,
      })
    }

    const projectIds = projects.map((p) => p.id)

    // Get instances count using project_id
    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("id, status")
      .in("project_id", projectIds)

    const totalInstances = instances?.length || 0
    const connectedInstances = instances?.filter((i) => i.status === "connected").length || 0

    // Get instance IDs for further queries
    const instanceIds = instances?.map((i) => i.id) || []

    // Get messages count
    let totalMessages = 0
    if (instanceIds.length > 0) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
      totalMessages = count || 0
    }

    // Get contacts count
    let totalContacts = 0
    if (instanceIds.length > 0) {
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
      totalContacts = count || 0
    }

    res.json({
      totalInstances,
      connectedInstances,
      totalMessages,
      totalContacts,
    })
  } catch (error) {
    console.error("Error fetching dashboard:", error)
    res.status(500).json({ error: "Failed to fetch dashboard data" })
  }
})

module.exports = router
