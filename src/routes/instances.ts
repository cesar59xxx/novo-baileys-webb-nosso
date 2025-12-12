import express from "express"
import type { ClientManager } from "../whatsapp/clientManager"
import { supabase } from "../config/supabase"
import { authMiddleware } from "../middleware/auth"

export function createInstancesRouter(clientManager: ClientManager) {
  const router = express.Router()

  // Create new instance
  router.post("/", authMiddleware, async (req, res) => {
    try {
      const { projectId, name } = req.body
      const userId = (req as any).user?.id

      if (!projectId || !name) {
        return res.status(400).json({ error: "Missing required fields" })
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("owner_id", userId)
        .single()

      if (projectError || !project) {
        return res.status(403).json({ error: "Project not found or unauthorized" })
      }

      const { data: instance, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .insert({
          project_id: projectId,
          name,
          status: "CREATED",
        })
        .select()
        .single()

      if (instanceError) {
        return res.status(500).json({ error: instanceError.message })
      }

      res.json(instance)
    } catch (error: any) {
      console.error("[Baileys] Error creating instance:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Start instance
  router.post("/:id/start", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", id)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      await clientManager.startInstance(id)

      res.json({ message: "Instance started", library: "baileys" })
    } catch (error: any) {
      console.error("[Baileys] Error starting instance:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Stop instance
  router.post("/:id/stop", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", id)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      await clientManager.stopInstance(id)

      res.json({ message: "Instance stopped" })
    } catch (error: any) {
      console.error("[Baileys] Error stopping instance:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Logout instance
  router.post("/:id/logout", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", id)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      await clientManager.logoutInstance(id)

      res.json({ message: "Instance logged out" })
    } catch (error: any) {
      console.error("[Baileys] Error logging out instance:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Get all instances
  router.get("/", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).user?.id
      const { projectId } = req.query

      let query = supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("projects.owner_id", userId)

      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data: instances, error } = await query

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      res.json(instances)
    } catch (error: any) {
      console.error("[Baileys] Error fetching instances:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Get instance status
  router.get("/:id/status", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("status, phone_number, last_connected_at, projects!inner(owner_id)")
        .eq("id", id)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      res.json({
        status: instance.status,
        phoneNumber: instance.phone_number,
        lastConnectedAt: instance.last_connected_at,
        isConnected: clientManager.isConnected(id),
      })
    } catch (error: any) {
      console.error("[Baileys] Error fetching instance status:", error)
      res.status(500).json({ error: error.message })
    }
  })

  // Get contacts for instance
  router.get("/:id/contacts", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params
      const userId = (req as any).user?.id

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", id)
        .single()

      if (error || !instance || (instance.projects as any).owner_id !== userId) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select(
          `
          *,
          messages (
            content,
            created_at
          )
        `,
        )
        .eq("instance_id", id)
        .order("last_message_at", { ascending: false })

      if (contactsError) {
        return res.status(500).json({ error: contactsError.message })
      }

      res.json(contacts)
    } catch (error: any) {
      console.error("[Baileys] Error fetching contacts:", error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
