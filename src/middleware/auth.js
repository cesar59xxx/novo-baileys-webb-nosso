const { createClient } = require("@supabase/supabase-js")
const jwt = require("jsonwebtoken")

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" })
    }

    const token = authHeader.split(" ")[1]

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET)

    if (!decoded.sub) {
      return res.status(401).json({ error: "Invalid token" })
    }

    // Get user from database
    const { data: user, error } = await supabase.from("users").select("*").eq("id", decoded.sub).single()

    if (error || !user) {
      return res.status(401).json({ error: "User not found" })
    }

    req.user = user
    req.userId = user.id
    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

module.exports = authMiddleware
