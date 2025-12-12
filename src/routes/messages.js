const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Get messages for an instance
router.get("/:instanceId", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.instanceId
    const { contactId, limit = 50, offset = 0 } = req.query

    // Verify ownership through project
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select(`
        id,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (instanceError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Build query
    let query = supabase
      .from("messages")
      .select("*, contacts(name, phone_number)")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: false })
      .range(Number.parseInt(offset), Number.parseInt(offset) + Number.parseInt(limit) - 1)

    if (contactId) {
      query = query.eq("contact_id", contactId)
    }

    const { data: messages, error } = await query

    if (error) {
      console.error("Error fetching messages:", error)
      return res.status(500).json({ error: "Failed to fetch messages" })
    }

    res.json(messages)
  } catch (error) {
    console.error("Error fetching messages:", error)
    res.status(500).json({ error: "Failed to fetch messages" })
  }
})

// Get contacts for an instance
router.get("/:instanceId/contacts", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.instanceId

    // Verify ownership through project
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select(`
        id,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (instanceError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("instance_id", instanceId)
      .order("last_message_at", { ascending: false })

    if (error) {
      console.error("Error fetching contacts:", error)
      return res.status(500).json({ error: "Failed to fetch contacts" })
    }

    res.json(contacts)
  } catch (error) {
    console.error("Error fetching contacts:", error)
    res.status(500).json({ error: "Failed to fetch contacts" })
  }
})

module.exports = router
