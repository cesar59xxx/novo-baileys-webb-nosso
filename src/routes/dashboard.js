const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Get dashboard metrics
router.get("/", async (req, res) => {
  try {
    const userId = req.userId

    // Get user's projects first
    const { data: projects, error: projectsError } = await supabase.from("projects").select("id").eq("owner_id", userId)

    if (projectsError) {
      console.error("Error fetching projects:", projectsError)
      return res.status(500).json({ error: "Failed to fetch projects" })
    }

    if (!projects || projects.length === 0) {
      return res.json({
        totalInstances: 0,
        connectedInstances: 0,
        totalMessages: 0,
        totalContacts: 0,
        messagesLast24h: 0,
        messagesLast7d: 0,
      })
    }

    const projectIds = projects.map((p) => p.id)

    // Get instances for user's projects
    const { data: instances, error: instancesError } = await supabase
      .from("whatsapp_instances")
      .select("id, status")
      .in("project_id", projectIds)

    if (instancesError) {
      console.error("Error fetching instances:", instancesError)
      return res.status(500).json({ error: "Failed to fetch instances" })
    }

    const instanceIds = instances?.map((i) => i.id) || []
    const totalInstances = instances?.length || 0
    const connectedInstances = instances?.filter((i) => i.status === "connected").length || 0

    let totalMessages = 0
    let totalContacts = 0
    let messagesLast24h = 0
    let messagesLast7d = 0

    if (instanceIds.length > 0) {
      // Get total messages
      const { count: msgCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)

      totalMessages = msgCount || 0

      // Get total contacts
      const { count: contactCount } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)

      totalContacts = contactCount || 0

      // Get messages last 24h
      const last24h = new Date()
      last24h.setHours(last24h.getHours() - 24)

      const { count: msg24h } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .gte("created_at", last24h.toISOString())

      messagesLast24h = msg24h || 0

      // Get messages last 7 days
      const last7d = new Date()
      last7d.setDate(last7d.getDate() - 7)

      const { count: msg7d } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .gte("created_at", last7d.toISOString())

      messagesLast7d = msg7d || 0
    }

    res.json({
      totalInstances,
      connectedInstances,
      totalMessages,
      totalContacts,
      messagesLast24h,
      messagesLast7d,
    })
  } catch (error) {
    console.error("Error fetching dashboard:", error)
    res.status(500).json({ error: "Failed to fetch dashboard metrics" })
  }
})

module.exports = router
