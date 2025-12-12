import express from "express"
import type { ClientManager } from "../whatsapp/clientManager"
import { supabase } from "../config/supabase"
import { authMiddleware } from "../middleware/auth"

export function createMessagesRouter(clientManager: ClientManager) {
  const router = express.Router()

  // Get messages for a chat
  router.get("/:instanceId/chats/:contactId/messages", authMiddleware, async (req, res) => {
    try {
      const { instanceId, contactId } = req.params
      const { limit = 50, offset = 0 } = req.query
      const userId = req.user?.id

      // Verify ownership
      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      // Get messages
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .range(Number(offset), Number(offset) + Number(limit) - 1)

      if (messagesError) {
        return res.status(500).json({ error: messagesError.message })
      }

      res.json(messages)
    } catch (error: any) {
      console.error("[v0] Error fetching messages:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Send message
  router.post("/:instanceId/messages", authMiddleware, async (req, res) => {
    try {
      const { instanceId } = req.params
      const { contactId, content } = req.body
      const userId = req.user?.id

      if (!contactId || !content) {
        return res.status(400).json({ error: "Missing required fields" })
      }

      // Verify ownership
      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      // Send message
      const message = await clientManager.sendMessage(instanceId, contactId, content)

      res.json(message)
    } catch (error: any) {
      console.error("[v0] Error sending message:", error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
