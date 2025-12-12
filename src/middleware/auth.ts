import type { Request, Response, NextFunction } from "express"
import { supabase } from "../config/supabase"

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization token" })
    }

    const token = authHeader.substring(7)

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }
    // Use type assertion to add user to request
    ;(req as any).user = {
      id: user.id,
      email: user.email!,
    }

    next()
  } catch (error) {
    console.error("[Auth] Middleware error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
