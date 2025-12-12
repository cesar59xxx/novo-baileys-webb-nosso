const express = require("express")
const router = express.Router()
const { supabase } = require("../config/supabase")

// Helper to verify user has access to instance through project
async function verifyInstanceAccess(instanceId, userId) {
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*, projects!inner(owner_id)")
    .eq("id", instanceId)
    .single()

  if (!instance || instance.projects.owner_id !== userId) {
    return null
  }
  return instance
}

// GET /api/messages/:instanceId - Get messages for instance
router.get("/:instanceId", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { instanceId } = req.params

    // Verify access through project ownership
    const instance = await verifyInstanceAccess(instanceId, userId)
    if (!instance) {
      return res.status(403).json({ error: "Access denied" })
    }

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*, contacts(name, phone_number)")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("Error fetching messages:", error)
      return res.status(500).json({ error: "Failed to fetch messages" })
    }

    res.json(messages || [])
  } catch (error) {
    console.error("Error in GET /messages:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/messages/:instanceId/send - Send a message
router.post("/:instanceId/send", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { instanceId } = req.params
    const { phoneNumber, content } = req.body

    if (!phoneNumber || !content) {
      return res.status(400).json({ error: "Phone number and content required" })
    }

    // Verify access
    const instance = await verifyInstanceAccess(instanceId, userId)
    if (!instance) {
      return res.status(403).json({ error: "Access denied" })
    }

    // Get client manager from app
    const io = req.app.get("io")
    const { ClientManager } = require("../whatsapp/clientManager")

    // For now, just save the message - actual sending requires WhatsApp connection
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        instance_id: instanceId,
        content,
        direction: "outgoing",
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("Error saving message:", error)
      return res.status(500).json({ error: "Failed to save message" })
    }

    res.json({ success: true, message })
  } catch (error) {
    console.error("Error in POST /messages/send:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/messages/:instanceId/contacts - Get contacts for instance
router.get("/:instanceId/contacts", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { instanceId } = req.params

    // Verify access
    const instance = await verifyInstanceAccess(instanceId, userId)
    if (!instance) {
      return res.status(403).json({ error: "Access denied" })
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

    res.json(contacts || [])
  } catch (error) {
    console.error("Error in GET /contacts:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
