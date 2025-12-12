const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const router = express.Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Verify token endpoint
router.post("/verify", async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ error: "Token is required" })
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    res.json({ user })
  } catch (error) {
    console.error("Verify error:", error)
    res.status(500).json({ error: "Failed to verify token" })
  }
})

module.exports = router
