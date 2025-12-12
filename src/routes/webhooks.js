const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Webhook for receiving messages (Evolution API format)
router.post("/message", async (req, res) => {
  try {
    const { instance, data } = req.body

    console.log("Webhook received:", { instance, data })

    // Process incoming message
    if (data && data.key && data.message) {
      const remoteJid = data.key.remoteJid
      const messageContent = data.message.conversation || data.message.extendedTextMessage?.text || "[Media message]"

      // Find instance by name
      const { data: instanceData, error: instanceError } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("name", instance)
        .single()

      if (!instanceError && instanceData) {
        // Get or create contact
        const phoneNumber = remoteJid.replace("@s.whatsapp.net", "")

        let { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("instance_id", instanceData.id)
          .eq("wa_id", remoteJid)
          .single()

        if (!contact) {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({
              instance_id: instanceData.id,
              wa_id: remoteJid,
              phone_number: phoneNumber,
              name: phoneNumber,
            })
            .select()
            .single()
          contact = newContact
        }

        if (contact) {
          // Save message
          await supabase.from("messages").insert({
            instance_id: instanceData.id,
            contact_id: contact.id,
            wa_message_id: data.key.id,
            content: messageContent,
            direction: data.key.fromMe ? "outgoing" : "incoming",
            is_from_agent: false,
          })

          // Update contact last message time
          await supabase.from("contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id)
        }
      }
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Failed to process webhook" })
  }
})

// Webhook for connection status
router.post("/status", async (req, res) => {
  try {
    const { instance, status } = req.body

    console.log("Status webhook:", { instance, status })

    if (instance && status) {
      await supabase
        .from("whatsapp_instances")
        .update({
          status: status === "open" ? "connected" : "disconnected",
          last_connected_at: status === "open" ? new Date().toISOString() : null,
        })
        .eq("name", instance)
    }

    res.json({ success: true })
  } catch (error) {
    console.error("Status webhook error:", error)
    res.status(500).json({ error: "Failed to process status webhook" })
  }
})

module.exports = router
