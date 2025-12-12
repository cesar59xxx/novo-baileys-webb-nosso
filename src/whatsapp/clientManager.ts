import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type proto,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys"
import type { Boom } from "@hapi/boom"
import * as QRCode from "qrcode"
import pino from "pino"
import { supabase } from "../config/supabase"
import type { Server } from "socket.io"
import * as fs from "fs"
import * as path from "path"

const logger = pino({ level: "silent" })

export class ClientManager {
  private clients: Map<string, WASocket> = new Map()
  private io: Server

  constructor(io: Server) {
    this.io = io
  }

  async startInstance(instanceId: string) {
    console.log("[Baileys] Starting instance:", instanceId)

    // Check if instance already exists
    if (this.clients.has(instanceId)) {
      console.log("[Baileys] Instance already running:", instanceId)
      return
    }

    // Load instance data from database
    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", instanceId)
      .single()

    if (error || !instance) {
      console.error("[Baileys] Instance not found:", instanceId)
      throw new Error("Instance not found")
    }

    // Create auth folder for this instance
    const authFolder = path.join(process.cwd(), "auth_sessions", instanceId)
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true })
    }

    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(authFolder)

    // Create WhatsApp socket with Baileys
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ["WhatsApp SaaS", "Chrome", "1.0.0"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: true,
    })

    // Store socket
    this.clients.set(instanceId, sock)

    // Setup event listeners
    this.setupSocketEvents(sock, instanceId, saveCreds)

    // Update status to QR_PENDING
    await this.updateInstanceStatus(instanceId, "QR_PENDING")
  }

  private setupSocketEvents(sock: WASocket, instanceId: string, saveCreds: () => Promise<void>) {
    // Connection update event
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update

      // QR Code received
      if (qr) {
        console.log("[Baileys] QR received for instance:", instanceId)

        // Convert QR to base64 image
        const qrBase64 = await QRCode.toDataURL(qr)

        // Save QR to database
        await supabase.from("whatsapp_instances").update({ last_qr: qrBase64 }).eq("id", instanceId)

        // Emit via Socket.IO
        this.io.emit("qr", { instanceId, qr: qrBase64 })
      }

      // Connection opened
      if (connection === "open") {
        console.log("[Baileys] Client connected for instance:", instanceId)

        // Get phone number from socket
        const phoneNumber = sock.user?.id?.split(":")[0] || null

        // Update instance status
        await supabase
          .from("whatsapp_instances")
          .update({
            status: "CONNECTED",
            phone_number: phoneNumber,
            last_connected_at: new Date().toISOString(),
            last_qr: null,
          })
          .eq("id", instanceId)

        // Emit via Socket.IO
        this.io.emit("instance_status", {
          instanceId,
          status: "CONNECTED",
          phoneNumber,
        })
      }

      // Connection closed
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        console.log(
          "[Baileys] Connection closed for instance:",
          instanceId,
          "Status:",
          statusCode,
          "Reconnecting:",
          shouldReconnect,
        )

        // Remove from clients map
        this.clients.delete(instanceId)

        if (shouldReconnect) {
          // Try to reconnect after delay
          setTimeout(() => this.startInstance(instanceId), 5000)
        } else {
          // User logged out - clean up
          await this.updateInstanceStatus(instanceId, "DISCONNECTED")

          // Delete auth folder
          const authFolder = path.join(process.cwd(), "auth_sessions", instanceId)
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true })
          }

          this.io.emit("instance_status", {
            instanceId,
            status: "DISCONNECTED",
          })
        }
      }
    })

    // Save credentials when updated
    sock.ev.on("creds.update", saveCreds)

    // Message received event
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return

      for (const message of messages) {
        // Only process incoming messages
        if (!message.key.fromMe && message.message) {
          await this.handleIncomingMessage(instanceId, message)
        }
      }
    })
  }

  private async handleIncomingMessage(instanceId: string, message: proto.IWebMessageInfo) {
    try {
      const contactWaId = message.key.remoteJid || ""

      // Skip if it's a group or broadcast
      if (contactWaId.includes("@g.us") || contactWaId.includes("@broadcast")) {
        return
      }

      const phoneNumber = contactWaId.replace("@s.whatsapp.net", "")

      // Get message content
      const content =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        "[Media]"

      // Get sender name
      const senderName = message.pushName || null

      // Get or create contact
      let { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("wa_id", contactWaId)
        .single()

      if (contactError || !contact) {
        // Create new contact
        const { data: newContact, error: createError } = await supabase
          .from("contacts")
          .insert({
            instance_id: instanceId,
            wa_id: contactWaId,
            phone_number: phoneNumber,
            name: senderName,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (createError) {
          console.error("[Baileys] Error creating contact:", createError)
          return
        }

        contact = newContact
      } else {
        // Update last message timestamp and name if available
        await supabase
          .from("contacts")
          .update({
            last_message_at: new Date().toISOString(),
            name: senderName || contact.name,
          })
          .eq("id", contact.id)
      }

      // Save message
      const { data: savedMessage, error: messageError } = await supabase
        .from("messages")
        .insert({
          instance_id: instanceId,
          contact_id: contact.id,
          direction: "INBOUND",
          wa_message_id: message.key.id || "",
          content: content,
          is_from_agent: false,
          created_at: new Date((message.messageTimestamp as number) * 1000).toISOString(),
        })
        .select()
        .single()

      if (messageError) {
        console.error("[Baileys] Error saving message:", messageError)
        return
      }

      // Emit via Socket.IO
      this.io.emit("message_received", {
        instanceId,
        contactId: contact.id,
        message: savedMessage,
      })

      console.log("[Baileys] Message received and saved:", savedMessage.id)
    } catch (error) {
      console.error("[Baileys] Error handling incoming message:", error)
    }
  }

  async sendMessage(instanceId: string, contactId: string, content: string) {
    const sock = this.clients.get(instanceId)

    if (!sock) {
      throw new Error("Instance not initialized or disconnected")
    }

    // Get contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("wa_id")
      .eq("id", contactId)
      .single()

    if (contactError || !contact) {
      throw new Error("Contact not found")
    }

    // Send message via WhatsApp using Baileys
    const sentMessage = await sock.sendMessage(contact.wa_id, { text: content })

    // Save to database
    const { data: savedMessage, error: messageError } = await supabase
      .from("messages")
      .insert({
        instance_id: instanceId,
        contact_id: contactId,
        direction: "OUTBOUND",
        wa_message_id: sentMessage?.key?.id || "",
        content: content,
        is_from_agent: true,
      })
      .select()
      .single()

    if (messageError) {
      throw messageError
    }

    console.log("[Baileys] Message sent:", savedMessage.id)

    return savedMessage
  }

  async stopInstance(instanceId: string) {
    const sock = this.clients.get(instanceId)

    if (sock) {
      sock.end(undefined)
      this.clients.delete(instanceId)
      await this.updateInstanceStatus(instanceId, "DISCONNECTED")
      console.log("[Baileys] Instance stopped:", instanceId)
    }
  }

  async logoutInstance(instanceId: string) {
    const sock = this.clients.get(instanceId)

    if (sock) {
      await sock.logout()
      this.clients.delete(instanceId)

      // Delete auth folder
      const authFolder = path.join(process.cwd(), "auth_sessions", instanceId)
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true })
      }

      await this.updateInstanceStatus(instanceId, "DISCONNECTED")
      console.log("[Baileys] Instance logged out:", instanceId)
    }
  }

  private async updateInstanceStatus(instanceId: string, status: string) {
    await supabase.from("whatsapp_instances").update({ status }).eq("id", instanceId)
  }

  getClient(instanceId: string): WASocket | undefined {
    return this.clients.get(instanceId)
  }

  getAllInstances(): string[] {
    return Array.from(this.clients.keys())
  }

  isConnected(instanceId: string): boolean {
    return this.clients.has(instanceId)
  }
}
