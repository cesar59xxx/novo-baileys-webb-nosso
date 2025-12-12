import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { supabase } from "../config/supabase.js"

export function createInstancesRouter(clientManager, io) {
  const router = express.Router()

  // Get all instances for user
  router.get("/", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { data: instances, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw error

      const instancesWithStatus = instances.map((instance) => ({
        ...instance,
        is_connected: clientManager.isConnected(instance.id),
      }))

      res.json(instancesWithStatus)
    } catch (error) {
      console.error("Error fetching instances:", error)
      res.status(500).json({ error: "Failed to fetch instances" })
    }
  })

  // Create new instance
  router.post("/", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { name, project_id } = req.body

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .insert({
          user_id: userId,
          project_id,
          name,
          status: "disconnected",
        })
        .select()
        .single()

      if (error) throw error

      res.json(instance)
    } catch (error) {
      console.error("Error creating instance:", error)
      res.status(500).json({ error: "Failed to create instance" })
    }
  })

  // Start instance and get QR code
  router.post("/:id/start", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const instanceId = req.params.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      const qrCode = await clientManager.initializeClient(instanceId, io)

      res.json({ success: true, qrCode })
    } catch (error) {
      console.error("Error starting instance:", error)
      res.status(500).json({ error: "Failed to start instance" })
    }
  })

  // Stop instance
  router.post("/:id/stop", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const instanceId = req.params.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      await clientManager.stopClient(instanceId)

      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instanceId)

      res.json({ success: true })
    } catch (error) {
      console.error("Error stopping instance:", error)
      res.status(500).json({ error: "Failed to stop instance" })
    }
  })

  // Get instance status
  router.get("/:id/status", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const instanceId = req.params.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      const isConnected = clientManager.isConnected(instanceId)

      res.json({
        ...instance,
        is_connected: isConnected,
      })
    } catch (error) {
      console.error("Error getting instance status:", error)
      res.status(500).json({ error: "Failed to get instance status" })
    }
  })

  // Delete instance
  router.delete("/:id", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const instanceId = req.params.id

      await clientManager.stopClient(instanceId)

      const { error } = await supabase.from("whatsapp_instances").delete().eq("id", instanceId).eq("user_id", userId)

      if (error) throw error

      res.json({ success: true })
    } catch (error) {
      console.error("Error deleting instance:", error)
      res.status(500).json({ error: "Failed to delete instance" })
    }
  })

  return router
}
