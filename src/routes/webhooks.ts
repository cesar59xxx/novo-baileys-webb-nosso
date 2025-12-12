import express from "express"
import { supabase } from "../config/supabase"

export function createWebhooksRouter() {
  const router = express.Router()

  router.post("/sales", async (req, res) => {
    try {
      const { sale_id, amount, currency = "BRL", status, project_external_id, metadata } = req.body

      if (!sale_id || !amount || !status || !project_external_id) {
        return res.status(400).json({ error: "Missing required fields" })
      }

      // Find project by external_id (stored in metadata or name)
      const { data: projects } = await supabase.from("projects").select("id").ilike("name", `%${project_external_id}%`)

      if (!projects || projects.length === 0) {
        return res.status(404).json({ error: "Project not found" })
      }

      const projectId = projects[0].id

      // Insert sales event
      const { error } = await supabase.from("sales_events").insert({
        project_id: projectId,
        external_sale_id: sale_id,
        amount,
        currency,
        status,
        metadata: metadata || {},
      })

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      res.json({ message: "Sale recorded successfully" })
    } catch (error: any) {
      console.error("[v0] Error processing webhook:", error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
