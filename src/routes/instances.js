const express = require("express")
const { createClient } = require("@supabase/supabase-js")
const WhatsAppService = require("../services/whatsapp")

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Store active WhatsApp connections
const whatsappInstances = new Map()

// Get all instances for user (through projects)
router.get("/", async (req, res) => {
  try {
    const userId = req.userId

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

    // Get instances for user's projects
    const { data: instances, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching instances:", error)
      return res.status(500).json({ error: "Failed to fetch instances" })
    }

    // Add connection status from memory
    const instancesWithStatus = instances.map((instance) => ({
      ...instance,
      is_connected: whatsappInstances.has(instance.id),
    }))

    res.json(instancesWithStatus)
  } catch (error) {
    console.error("Error fetching instances:", error)
    res.status(500).json({ error: "Failed to fetch instances" })
  }
})

// Create new instance
router.post("/", async (req, res) => {
  try {
    const userId = req.userId
    const { name, projectId } = req.body

    if (!name) {
      return res.status(400).json({ error: "Instance name is required" })
    }

    let targetProjectId = projectId

    // If no projectId provided, get or create default project
    if (!targetProjectId) {
      // Check if user has any project
      const { data: existingProjects, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)

      if (projectError) {
        console.error("Error checking projects:", projectError)
        return res.status(500).json({ error: "Failed to check projects" })
      }

      if (existingProjects && existingProjects.length > 0) {
        targetProjectId = existingProjects[0].id
      } else {
        // Create default project
        const { data: newProject, error: createError } = await supabase
          .from("projects")
          .insert({
            name: "Default Project",
            owner_id: userId,
          })
          .select()
          .single()

        if (createError) {
          console.error("Error creating project:", createError)
          return res.status(500).json({ error: "Failed to create default project" })
        }

        targetProjectId = newProject.id
      }
    } else {
      // Verify user owns the project
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

    // Create instance with project_id
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
    console.error("Error creating instance:", error)
    res.status(500).json({ error: "Failed to create instance" })
  }
})

// Get single instance
router.get("/:id", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.id

    // Get instance and verify ownership through project
    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select(`
        *,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (error || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Remove nested projects data from response
    const { projects, ...instanceData } = instance

    res.json({
      ...instanceData,
      is_connected: whatsappInstances.has(instance.id),
    })
  } catch (error) {
    console.error("Error fetching instance:", error)
    res.status(500).json({ error: "Failed to fetch instance" })
  }
})

// Delete instance
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.id

    // Verify ownership through project
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select(`
        id,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (fetchError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Disconnect if connected
    if (whatsappInstances.has(instanceId)) {
      const wa = whatsappInstances.get(instanceId)
      await wa.disconnect()
      whatsappInstances.delete(instanceId)
    }

    // Delete from database
    const { error } = await supabase.from("whatsapp_instances").delete().eq("id", instanceId)

    if (error) {
      console.error("Error deleting instance:", error)
      return res.status(500).json({ error: "Failed to delete instance" })
    }

    res.json({ message: "Instance deleted successfully" })
  } catch (error) {
    console.error("Error deleting instance:", error)
    res.status(500).json({ error: "Failed to delete instance" })
  }
})

// Connect instance (generate QR code)
router.post("/:id/connect", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.id
    const io = req.app.get("io")

    // Verify ownership through project
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select(`
        *,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (fetchError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Check if already connecting/connected
    if (whatsappInstances.has(instanceId)) {
      return res.json({ message: "Instance already connecting or connected" })
    }

    // Create WhatsApp service
    const wa = new WhatsAppService(instanceId, supabase, io)
    whatsappInstances.set(instanceId, wa)

    // Start connection
    await wa.connect()

    res.json({ message: "Connection started, waiting for QR code" })
  } catch (error) {
    console.error("Error connecting instance:", error)
    res.status(500).json({ error: "Failed to connect instance" })
  }
})

// Disconnect instance
router.post("/:id/disconnect", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.id

    // Verify ownership through project
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select(`
        id,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (fetchError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Disconnect if connected
    if (whatsappInstances.has(instanceId)) {
      const wa = whatsappInstances.get(instanceId)
      await wa.disconnect()
      whatsappInstances.delete(instanceId)
    }

    // Update status
    await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instanceId)

    res.json({ message: "Instance disconnected" })
  } catch (error) {
    console.error("Error disconnecting instance:", error)
    res.status(500).json({ error: "Failed to disconnect instance" })
  }
})

// Send message
router.post("/:id/send", async (req, res) => {
  try {
    const userId = req.userId
    const instanceId = req.params.id
    const { to, message } = req.body

    if (!to || !message) {
      return res.status(400).json({ error: "Recipient and message are required" })
    }

    // Verify ownership through project
    const { data: instance, error: fetchError } = await supabase
      .from("whatsapp_instances")
      .select(`
        id,
        projects!inner(owner_id)
      `)
      .eq("id", instanceId)
      .eq("projects.owner_id", userId)
      .single()

    if (fetchError || !instance) {
      return res.status(404).json({ error: "Instance not found" })
    }

    // Check if connected
    if (!whatsappInstances.has(instanceId)) {
      return res.status(400).json({ error: "Instance is not connected" })
    }

    const wa = whatsappInstances.get(instanceId)
    const result = await wa.sendMessage(to, message)

    res.json(result)
  } catch (error) {
    console.error("Error sending message:", error)
    res.status(500).json({ error: "Failed to send message" })
  }
})

module.exports = router
