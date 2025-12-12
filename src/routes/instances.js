const express = require("express")
const router = express.Router()
const { supabase } = require("../config/supabase")
const { ClientManager } = require("../whatsapp/clientManager")

let clientManager = null

// Initialize client manager lazily
function getClientManager(io) {
  if (!clientManager) {
    clientManager = new ClientManager(io)
  }
  return clientManager
}

// GET /api/instances - List all instances for user's projects
// Uses project_id through projects table, NOT user_id directly
router.get("/", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    // First get user's projects
    const { data: projects, error: projectsError } = await supabase.from("projects").select("id").eq("owner_id", userId)

    if (projectsError) {
      console.error("Error fetching projects:", projectsError)
      return res.status(500).json({ error: "Failed to fetch projects" })
    }

    if (!projects || projects.length === 0) {
      return res.json([])
    }

    const projectIds = projects.map((p) => p.id)

    // Then get instances for those projects using project_id
    const { data: instances, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching instances:", error)
      return res.status(500).json({ error: "Failed to fetch instances" })
    }

    res.json(instances || [])
  } catch (error) {
    console.error("Error in GET /instances:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/instances - Create new instance
// Uses project_id, NOT user_id
router.post("/", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { name, projectId } = req.body

    if (!name) {
      return res.status(400).json({ error: "Instance name is required" })
    }

    let targetProjectId = projectId

    // If no projectId provided, get or create default project
    if (!targetProjectId) {
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
            name: "Default Project",
            owner_id: userId,
          })
          .select()
          .single()

        if (createError) {
          console.error("Error creating default project:", createError)
          return res.status(500).json({ error: "Failed to create project" })
        }

        targetProjectId = newProject.id
      }
    }

    // Verify user owns this project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", targetProjectId)
      .eq("owner_id", userId)
      .single()

    if (projectError || !project) {
      return res.status(403).json({ error: "Access denied to this project" })
    }

    // Create instance with project_id (NOT user_id!)
    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .insert({
        name,
        project_id: targetProjectId,
        status: "disconnected",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating instance:", error)
      return res.status(500).json({ error: "Failed to create instance" })
    }

    res.status(201).json(instance)
  } catch (error) {
    console.error("Error in POST /instances:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/instances/:id/connect - Connect instance and get QR code
router.post("/:id/connect", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { id } = req.params
    const io = req.app.get("io")

    // Verify user has access to this instance through project ownership
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("*, projects!inner(owner_id)")
      .eq("id", id)
      .single()

    if (instanceError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    if (instance.projects.owner_id !== userId) {
      return res.status(403).json({ error: "Access denied" })
    }

    const manager = getClientManager(io)
    const qrCode = await manager.initializeClient(id, io)

    res.json({ success: true, qrCode })
  } catch (error) {
    console.error("Error connecting instance:", error)
    res.status(500).json({ error: "Failed to connect instance" })
  }
})

// POST /api/instances/:id/disconnect - Disconnect instance
router.post("/:id/disconnect", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { id } = req.params
    const io = req.app.get("io")

    // Verify access
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("*, projects!inner(owner_id)")
      .eq("id", id)
      .single()

    if (!instance || instance.projects.owner_id !== userId) {
      return res.status(403).json({ error: "Access denied" })
    }

    const manager = getClientManager(io)
    await manager.stopClient(id)

    res.json({ success: true })
  } catch (error) {
    console.error("Error disconnecting instance:", error)
    res.status(500).json({ error: "Failed to disconnect instance" })
  }
})

// DELETE /api/instances/:id - Delete instance
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" })
    }

    const { id } = req.params
    const io = req.app.get("io")

    // Verify access
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("*, projects!inner(owner_id)")
      .eq("id", id)
      .single()

    if (!instance || instance.projects.owner_id !== userId) {
      return res.status(403).json({ error: "Access denied" })
    }

    // Stop client if running
    const manager = getClientManager(io)
    await manager.stopClient(id)

    // Delete from database
    const { error } = await supabase.from("whatsapp_instances").delete().eq("id", id)

    if (error) {
      console.error("Error deleting instance:", error)
      return res.status(500).json({ error: "Failed to delete instance" })
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /instances/:id:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
