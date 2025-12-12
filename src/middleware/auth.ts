import type { Request, Response, NextFunction } from "express"
import { supabase } from "../config/supabase"

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization token" })
    }

    const token = authHeader.substring(7)

    // Verify JWT token
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    req.user = {
      id: user.id,
      email: user.email!,
    }

    next()
  } catch (error) {
    console.error("[v0] Auth middleware error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
