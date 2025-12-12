import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { supabase } from "../config/supabase.js"

export function createInstancesRouter(clientManager, io) {
  const router = express.Router()

  // Get all instances for user (through their projects)
  router.get("/", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" })
      }

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id")
        .eq("owner_id", userId)

      if (projectsError) throw projectsError

      if (!projects || projects.length === 0) {
        return res.json([])
      }

      const projectIds = projects.map((p) => p.id)

      const { data: instances, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })

      if (error) throw error

      const instancesWithStatus = (instances || []).map((instance) => ({
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

      let targetProjectId = project_id

      if (!targetProjectId) {
        // Get or create a default project for the user
        const { data: existingProject } = await supabase
          .from("projects")
          .select("id")
          .eq("owner_id", userId)
          .limit(1)
          .single()

        if (existingProject) {
          targetProjectId = existingProject.id
        } else {
          // Create a default project
          const { data: newProject, error: createError } = await supabase
            .from("projects")
            .insert({
              owner_id: userId,
              name: "Default Project",
            })
            .select()
            .single()

          if (createError) throw createError
          targetProjectId = newProject.id
        }
      } else {
        // Verify user owns this project
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("id")
          .eq("id", targetProjectId)
          .eq("owner_id", userId)
          .single()

        if (projectError || !project) {
          return res.status(403).json({ error: "Project not found or access denied" })
        }
      }

      const { data: instance, error } = await supabase
        .from("whatsapp_instances")
        .insert({
          project_id: targetProjectId,
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
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      if (instance.projects.owner_id !== userId) {
        return res.status(403).json({ error: "Access denied" })
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
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      if (instance.projects.owner_id !== userId) {
        return res.status(403).json({ error: "Access denied" })
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
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (error || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      if (instance.projects.owner_id !== userId) {
        return res.status(403).json({ error: "Access denied" })
      }

      const isConnected = clientManager.isConnected(instanceId)

      // Remove the projects relation from response
      const { projects, ...instanceData } = instance

      res.json({
        ...instanceData,
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

      const { data: instance, error: fetchError } = await supabase
        .from("whatsapp_instances")
        .select("*, projects!inner(owner_id)")
        .eq("id", instanceId)
        .single()

      if (fetchError || !instance) {
        return res.status(404).json({ error: "Instance not found" })
      }

      if (instance.projects.owner_id !== userId) {
        return res.status(403).json({ error: "Access denied" })
      }

      await clientManager.stopClient(instanceId)

      const { error } = await supabase.from("whatsapp_instances").delete().eq("id", instanceId)

      if (error) throw error

      res.json({ success: true })
    } catch (error) {
      console.error("Error deleting instance:", error)
      res.status(500).json({ error: "Failed to delete instance" })
    }
  })

  return router
}
