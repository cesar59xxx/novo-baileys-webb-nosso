import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys"
import type { WASocket, proto } from "@whiskeysockets/baileys"
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

    if (this.clients.has(instanceId)) {
      console.log("[Baileys] Instance already running:", instanceId)
      return
    }

    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", instanceId)
      .single()

    if (error || !instance) {
      console.error("[Baileys] Instance not found:", instanceId)
      throw new Error("Instance not found")
    }

    const authFolder = path.join(process.cwd(), "auth_sessions", instanceId)
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder)

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

    this.clients.set(instanceId, sock)
    this.setupSocketEvents(sock, instanceId, saveCreds)
    await this.updateInstanceStatus(instanceId, "QR_PENDING")
  }

  private setupSocketEvents(sock: WASocket, instanceId: string, saveCreds: () => Promise<void>) {
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        console.log("[Baileys] QR received for instance:", instanceId)
        const qrBase64 = await QRCode.toDataURL(qr)
        await supabase.from("whatsapp_instances").update({ last_qr: qrBase64 }).eq("id", instanceId)
        this.io.emit("qr", { instanceId, qr: qrBase64 })
      }

      if (connection === "open") {
        console.log("[Baileys] Client connected for instance:", instanceId)
        const phoneNumber = sock.user?.id?.split(":")[0] || null

        await supabase
          .from("whatsapp_instances")
          .update({
            status: "CONNECTED",
            phone_number: phoneNumber,
            last_connected_at: new Date().toISOString(),
            last_qr: null,
          })
          .eq("id", instanceId)

        this.io.emit("instance_status", {
          instanceId,
          status: "CONNECTED",
          phoneNumber,
        })
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        console.log("[Baileys] Connection closed:", instanceId, "Status:", statusCode)

        this.clients.delete(instanceId)

        if (shouldReconnect) {
          setTimeout(() => this.startInstance(instanceId), 5000)
        } else {
          await this.updateInstanceStatus(instanceId, "DISCONNECTED")

          const authFolder = path.join(process.cwd(), "auth_sessions", instanceId)
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true })
          }

          this.io.emit("instance_status", { instanceId, status: "DISCONNECTED" })
        }
      }
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return

      for (const message of messages) {
        if (!message.key.fromMe && message.message) {
          await this.handleIncomingMessage(instanceId, message)
        }
      }
    })
  }

  private async handleIncomingMessage(instanceId: string, message: proto.IWebMessageInfo) {
    try {
      const contactWaId = message.key.remoteJid || ""

      if (contactWaId.includes("@g.us") || contactWaId.includes("@broadcast")) {
        return
      }

      const phoneNumber = contactWaId.replace("@s.whatsapp.net", "")

      const content =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        "[Media]"

      const senderName = message.pushName || null

      let { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("wa_id", contactWaId)
        .single()

      if (contactError || !contact) {
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
        await supabase
          .from("contacts")
          .update({
            last_message_at: new Date().toISOString(),
            name: senderName || contact.name,
          })
          .eq("id", contact.id)
      }

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

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("wa_id")
      .eq("id", contactId)
      .single()

    if (contactError || !contact) {
      throw new Error("Contact not found")
    }

    const sentMessage = await sock.sendMessage(contact.wa_id, { text: content })

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
