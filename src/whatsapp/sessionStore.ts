import { supabase } from "../config/supabase"

// Session store for Baileys - stores auth state in database as backup
export class SessionStore {
  async saveSession(instanceId: string, sessionData: any) {
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({
        session_data: sessionData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instanceId)

    if (error) {
      console.error("[Baileys] Error saving session:", error)
      throw error
    }
  }

  async loadSession(instanceId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("session_data")
      .eq("id", instanceId)
      .single()

    if (error) {
      console.error("[Baileys] Error loading session:", error)
      return null
    }

    return data?.session_data || null
  }

  async deleteSession(instanceId: string) {
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({
        session_data: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instanceId)

    if (error) {
      console.error("[Baileys] Error deleting session:", error)
      throw error
    }
  }
}
