import express from "express"
import { supabase } from "../config/supabase"
import { authMiddleware } from "../middleware/auth"

export function createDashboardRouter() {
  const router = express.Router()

  router.get("/", authMiddleware, async (req, res) => {
    try {
      const { projectId } = req.query
      const userId = req.user?.id

      if (!projectId) {
        return res.status(400).json({ error: "Missing projectId" })
      }

      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId as string)
        .eq("owner_id", userId)
        .single()

      if (projectError || !project) {
        return res.status(403).json({ error: "Unauthorized" })
      }

      const today = new Date().toISOString().split("T")[0]

      // Get all instances for this project
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("project_id", projectId as string)

      const instanceIds = instances?.map((i) => i.id) || []

      // Messages received today
      const { count: messagesReceivedToday } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("instance_id", instanceIds)
        .eq("direction", "INBOUND")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)

      // Unique contacts today
      const { data: messagesData } = await supabase
        .from("messages")
        .select("contact_id")
        .in("instance_id", instanceIds)
        .eq("direction", "INBOUND")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)

      const uniqueContactsToday = new Set(messagesData?.map((m) => m.contact_id)).size

      // Response rate calculation
      const { data: inboundContacts } = await supabase
        .from("messages")
        .select("contact_id")
        .in("instance_id", instanceIds)
        .eq("direction", "INBOUND")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)

      const inboundContactIds = Array.from(new Set(inboundContacts?.map((m) => m.contact_id)))

      let respondedContacts = 0
      for (const contactId of inboundContactIds) {
        const { data: outboundMessage } = await supabase
          .from("messages")
          .select("id")
          .in("instance_id", instanceIds)
          .eq("contact_id", contactId)
          .eq("direction", "OUTBOUND")
          .gte("created_at", `${today}T00:00:00`)
          .lte("created_at", `${today}T23:59:59`)
          .limit(1)

        if (outboundMessage && outboundMessage.length > 0) {
          respondedContacts++
        }
      }

      const responseRateToday = inboundContactIds.length > 0 ? respondedContacts / inboundContactIds.length : 0

      // Sales today
      const { data: salesData } = await supabase
        .from("sales_events")
        .select("amount")
        .eq("project_id", projectId as string)
        .eq("status", "PAID")
        .gte("event_date", `${today}T00:00:00`)
        .lte("event_date", `${today}T23:59:59`)

      const salesAmountToday = salesData?.reduce((sum, sale) => sum + Number(sale.amount), 0) || 0

      res.json({
        date: today,
        messages_received_today: messagesReceivedToday || 0,
        unique_contacts_today: uniqueContactsToday,
        response_rate_today: responseRateToday,
        sales_amount_today: salesAmountToday,
      })
    } catch (error: any) {
      console.error("[v0] Error fetching dashboard metrics:", error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
