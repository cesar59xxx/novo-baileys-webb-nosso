const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" })
    }

    const token = authHeader.split(" ")[1]

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    // Attach user to request
    req.user = user
    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(401).json({ error: "Authentication failed" })
  }
}

module.exports = authMiddleware
