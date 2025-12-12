import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { supabase } from "../config/supabase.js"

export function createMessagesRouter(clientManager) {
  const router = express.Router()

  // Get messages for a contact
  router.get("/:instanceId/:contactId", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { instanceId, contactId } = req.params

      const { data: instance, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (instanceError || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })

      if (error) throw error

      res.json(messages || [])
    } catch (error) {
      console.error("Error fetching messages:", error)
      res.status(500).json({ error: "Failed to fetch messages" })
    }
  })

  // Send message
  router.post("/send", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { instanceId, contactId, content, phoneNumber } = req.body

      const { data: instance, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (instanceError || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      const result = await clientManager.sendMessage(instanceId, phoneNumber, content)

      if (!result.success) {
        return res.status(500).json({ error: "Failed to send message" })
      }

      const { data: message, error } = await supabase
        .from("messages")
        .insert({
          instance_id: instanceId,
          contact_id: contactId,
          content,
          direction: "outgoing",
          status: "sent",
        })
        .select()
        .single()

      if (error) throw error

      res.json(message)
    } catch (error) {
      console.error("Error sending message:", error)
      res.status(500).json({ error: "Failed to send message" })
    }
  })

  // Get contacts for instance
  router.get("/:instanceId/contacts", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { instanceId } = req.params

      const { data: instance, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (instanceError || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("instance_id", instanceId)
        .order("last_message_at", { ascending: false })

      if (error) throw error

      res.json(contacts || [])
    } catch (error) {
      console.error("Error fetching contacts:", error)
      res.status(500).json({ error: "Failed to fetch contacts" })
    }
  })

  return router
}
