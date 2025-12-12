import express from "express"
import { supabase } from "../config/supabase.js"

export function createWebhooksRouter() {
  const router = express.Router()

  // Webhook for external sales events
  router.post("/sales", async (req, res) => {
    try {
      const { event_type, customer_phone, customer_name, product_name, amount, project_id } = req.body

      // Save sales event
      const { data, error } = await supabase
        .from("sales_events")
        .insert({
          project_id,
          event_type,
          customer_phone,
          customer_name,
          product_name,
          amount: Number.parseFloat(amount) || 0,
          raw_data: req.body,
        })
        .select()
        .single()

      if (error) throw error

      res.json({ success: true, event: data })
    } catch (error) {
      console.error("Error processing webhook:", error)
      res.status(500).json({ error: "Failed to process webhook" })
    }
  })

  return router
}
