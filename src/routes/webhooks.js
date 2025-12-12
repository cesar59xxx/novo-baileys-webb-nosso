const express = require("express")
const router = express.Router()

// POST /api/webhooks/whatsapp - Receive WhatsApp webhooks
router.post("/whatsapp", async (req, res) => {
  try {
    console.log("Webhook received:", JSON.stringify(req.body, null, 2))
    res.json({ success: true })
  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Webhook processing failed" })
  }
})

// GET /api/webhooks/whatsapp - Verify webhook (for some providers)
router.get("/whatsapp", (req, res) => {
  const challenge = req.query["hub.challenge"]
  if (challenge) {
    return res.send(challenge)
  }
  res.json({ status: "ok" })
})

module.exports = router
