const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const { Boom } = require("@hapi/boom")
const QRCode = require("qrcode")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

// Baileys auth state helper (not a React hook)
const getAuthState = useMultiFileAuthState

class WhatsAppService {
  constructor(instanceId, supabase, io) {
    this.instanceId = instanceId
    this.supabase = supabase
    this.io = io
    this.socket = null
    this.qrRetries = 0
    this.maxQrRetries = 5
  }

  async connect() {
    try {
      const sessionsDir = path.join(__dirname, "../../sessions")
      const authPath = path.join(sessionsDir, this.instanceId)

      // Create sessions directory if not exists
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true })
      }

      // Get auth state using Baileys helper
      const { state, saveCreds } = await getAuthState(authPath)

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
      })

      // Handle connection events
      this.socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          this.qrRetries++
          console.log(`QR Code generated for instance ${this.instanceId} (attempt ${this.qrRetries})`)

          if (this.qrRetries > this.maxQrRetries) {
            console.log("Max QR retries reached")
            await this.disconnect()
            return
          }

          // Convert QR to base64 image
          const qrImage = await QRCode.toDataURL(qr)

          // Save QR to database
          await this.supabase
            .from("whatsapp_instances")
            .update({
              last_qr: qrImage,
              status: "waiting_qr",
            })
            .eq("id", this.instanceId)

          // Emit QR to frontend via Socket.IO
          this.io.to(`instance:${this.instanceId}`).emit("qr-code", {
            instanceId: this.instanceId,
            qr: qrImage,
          })
        }

        if (connection === "close") {
          const shouldReconnect =
            lastDisconnect?.error instanceof Boom &&
            lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut

          console.log(`Connection closed for instance ${this.instanceId}:`, lastDisconnect?.error)

          if (shouldReconnect) {
            console.log("Reconnecting...")
            await this.connect()
          } else {
            await this.supabase
              .from("whatsapp_instances")
              .update({
                status: "disconnected",
                last_qr: null,
              })
              .eq("id", this.instanceId)

            this.io.to(`instance:${this.instanceId}`).emit("connection-status", {
              instanceId: this.instanceId,
              status: "disconnected",
            })
          }
        }

        if (connection === "open") {
          console.log(`Instance ${this.instanceId} connected successfully`)
          this.qrRetries = 0

          // Get phone number
          const phoneNumber = this.socket.user?.id?.split(":")[0] || null

          await this.supabase
            .from("whatsapp_instances")
            .update({
              status: "connected",
              last_qr: null,
              phone_number: phoneNumber,
              last_connected_at: new Date().toISOString(),
            })
            .eq("id", this.instanceId)

          this.io.to(`instance:${this.instanceId}`).emit("connection-status", {
            instanceId: this.instanceId,
            status: "connected",
            phoneNumber,
          })
        }
      })

      // Handle credential updates
      this.socket.ev.on("creds.update", saveCreds)

      // Handle incoming messages
      this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return

        for (const msg of messages) {
          if (msg.key.fromMe) continue // Skip own messages

          await this.handleIncomingMessage(msg)
        }
      })
    } catch (error) {
      console.error("WhatsApp connection error:", error)
      throw error
    }
  }

  async handleIncomingMessage(msg) {
    try {
      const remoteJid = msg.key.remoteJid
      if (!remoteJid || remoteJid.endsWith("@g.us")) return // Skip group messages

      const phoneNumber = remoteJid.replace("@s.whatsapp.net", "")
      const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "[Media message]"

      // Get or create contact
      let { data: contact } = await this.supabase
        .from("contacts")
        .select("id")
        .eq("instance_id", this.instanceId)
        .eq("wa_id", remoteJid)
        .single()

      if (!contact) {
        const { data: newContact } = await this.supabase
          .from("contacts")
          .insert({
            instance_id: this.instanceId,
            wa_id: remoteJid,
            phone_number: phoneNumber,
            name: msg.pushName || phoneNumber,
          })
          .select()
          .single()
        contact = newContact
      }

      if (contact) {
        // Save message
        const { data: savedMessage } = await this.supabase
          .from("messages")
          .insert({
            instance_id: this.instanceId,
            contact_id: contact.id,
            wa_message_id: msg.key.id,
            content: messageContent,
            direction: "incoming",
            is_from_agent: false,
          })
          .select()
          .single()

        // Update contact last message time
        await this.supabase
          .from("contacts")
          .update({
            last_message_at: new Date().toISOString(),
            name: msg.pushName || contact.name,
          })
          .eq("id", contact.id)

        // Emit to frontend
        this.io.to(`instance:${this.instanceId}`).emit("new-message", {
          instanceId: this.instanceId,
          message: savedMessage,
          contact: {
            id: contact.id,
            phone_number: phoneNumber,
            name: msg.pushName || phoneNumber,
          },
        })
      }
    } catch (error) {
      console.error("Error handling incoming message:", error)
    }
  }

  async sendMessage(to, message) {
    if (!this.socket) {
      throw new Error("WhatsApp not connected")
    }

    try {
      // Format phone number
      let jid = to
      if (!jid.includes("@")) {
        jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`
      }

      // Send message
      const result = await this.socket.sendMessage(jid, { text: message })

      // Get or create contact
      const phoneNumber = jid.replace("@s.whatsapp.net", "")

      let { data: contact } = await this.supabase
        .from("contacts")
        .select("id")
        .eq("instance_id", this.instanceId)
        .eq("wa_id", jid)
        .single()

      if (!contact) {
        const { data: newContact } = await this.supabase
          .from("contacts")
          .insert({
            instance_id: this.instanceId,
            wa_id: jid,
            phone_number: phoneNumber,
            name: phoneNumber,
          })
          .select()
          .single()
        contact = newContact
      }

      if (contact) {
        // Save message
        await this.supabase.from("messages").insert({
          instance_id: this.instanceId,
          contact_id: contact.id,
          wa_message_id: result.key.id,
          content: message,
          direction: "outgoing",
          is_from_agent: true,
        })

        // Update contact
        await this.supabase.from("contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id)
      }

      return { success: true, messageId: result.key.id }
    } catch (error) {
      console.error("Error sending message:", error)
      throw error
    }
  }

  async disconnect() {
    if (this.socket) {
      try {
        await this.socket.logout()
      } catch (error) {
        console.error("Error during logout:", error)
      }
      this.socket = null
    }

    await this.supabase
      .from("whatsapp_instances")
      .update({
        status: "disconnected",
        last_qr: null,
      })
      .eq("id", this.instanceId)
  }
}

module.exports = WhatsAppService
