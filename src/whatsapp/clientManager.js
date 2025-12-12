const makeWASocket = require("@whiskeysockets/baileys").default
const {
  useMultiFileAuthState: getMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys")
const { Boom } = require("@hapi/boom")
const QRCode = require("qrcode")
const pino = require("pino")
const path = require("path")
const fs = require("fs")
const { supabase } = require("../config/supabase")

class ClientManager {
  constructor(io) {
    this.clients = new Map()
    this.io = io
    this.sessionsDir = path.join(process.cwd(), "sessions")

    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }
  }

  async initializeClient(instanceId, io) {
    return new Promise(async (resolve, reject) => {
      try {
        const sessionPath = path.join(this.sessionsDir, `session-${instanceId}`)
        const { state, saveCreds } = await getMultiFileAuthState(sessionPath)
        const { version } = await fetchLatestBaileysVersion()

        const socket = makeWASocket({
          version,
          auth: state,
          printQRInTerminal: false,
          logger: pino({ level: "silent" }),
        })

        let qrCodeData = null

        socket.ev.on("creds.update", saveCreds)

        socket.ev.on("connection.update", async (update) => {
          const { connection, lastDisconnect, qr } = update

          if (qr) {
            // Generate QR code as data URL
            qrCodeData = await QRCode.toDataURL(qr)

            // Emit QR code to frontend
            io.to(`instance-${instanceId}`).emit("qr-code", {
              instanceId,
              qrCode: qrCodeData,
            })

            resolve(qrCodeData)
          }

          if (connection === "close") {
            const shouldReconnect =
              lastDisconnect?.error instanceof Boom &&
              lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut

            console.log(`Connection closed for ${instanceId}. Reconnect: ${shouldReconnect}`)

            if (shouldReconnect) {
              setTimeout(() => {
                this.initializeClient(instanceId, io)
              }, 5000)
            } else {
              this.clients.delete(instanceId)
              await this.updateInstanceStatus(instanceId, "disconnected")
            }

            io.to(`instance-${instanceId}`).emit("connection-status", {
              instanceId,
              status: "disconnected",
            })
          }

          if (connection === "open") {
            console.log(`WhatsApp connected for instance ${instanceId}`)
            this.clients.set(instanceId, socket)
            await this.updateInstanceStatus(instanceId, "connected")

            io.to(`instance-${instanceId}`).emit("connection-status", {
              instanceId,
              status: "connected",
            })
          }
        })

        // Handle incoming messages
        socket.ev.on("messages.upsert", async ({ messages }) => {
          for (const msg of messages) {
            if (!msg.key.fromMe && msg.message) {
              const from = msg.key.remoteJid
              const content = msg.message.conversation || msg.message.extendedTextMessage?.text || "[Media]"

              // Save message to database
              await this.saveIncomingMessage(instanceId, from, content, msg)

              // Emit to frontend
              io.to(`instance-${instanceId}`).emit("new-message", {
                instanceId,
                from,
                content,
                timestamp: new Date().toISOString(),
              })
            }
          }
        })

        // Store client reference
        this.clients.set(instanceId, socket)
      } catch (error) {
        console.error(`Error initializing client ${instanceId}:`, error)
        reject(error)
      }
    })
  }

  async stopClient(instanceId) {
    const client = this.clients.get(instanceId)
    if (client) {
      try {
        await client.logout()
      } catch (e) {
        console.log("Error during logout:", e.message)
      }
      this.clients.delete(instanceId)
    }
    await this.updateInstanceStatus(instanceId, "disconnected")
  }

  async sendMessage(instanceId, phoneNumber, content) {
    const client = this.clients.get(instanceId)
    if (!client) {
      return { success: false, error: "Client not connected" }
    }

    try {
      // Format phone number for WhatsApp
      const jid = phoneNumber.includes("@s.whatsapp.net")
        ? phoneNumber
        : `${phoneNumber.replace(/\D/g, "")}@s.whatsapp.net`

      await client.sendMessage(jid, { text: content })
      return { success: true }
    } catch (error) {
      console.error("Error sending message:", error)
      return { success: false, error: error.message }
    }
  }

  isConnected(instanceId) {
    return this.clients.has(instanceId)
  }

  async updateInstanceStatus(instanceId, status) {
    try {
      await supabase
        .from("whatsapp_instances")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", instanceId)
    } catch (error) {
      console.error("Error updating instance status:", error)
    }
  }

  async saveIncomingMessage(instanceId, from, content, rawMessage) {
    try {
      const phoneNumber = from.replace("@s.whatsapp.net", "")

      // Find or create contact
      let { data: contact } = await supabase
        .from("contacts")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("phone_number", phoneNumber)
        .single()

      if (!contact) {
        const { data: newContact } = await supabase
          .from("contacts")
          .insert({
            instance_id: instanceId,
            phone_number: phoneNumber,
            name: rawMessage.pushName || phoneNumber,
          })
          .select()
          .single()
        contact = newContact
      }

      // Save message
      await supabase.from("messages").insert({
        instance_id: instanceId,
        contact_id: contact?.id,
        content,
        direction: "incoming",
        status: "received",
      })

      // Update contact last message time
      if (contact) {
        await supabase.from("contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id)
      }
    } catch (error) {
      console.error("Error saving incoming message:", error)
    }
  }
}

module.exports = { ClientManager }
