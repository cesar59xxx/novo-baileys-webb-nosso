const { createClient } = require("@supabase/supabase-js")
const { config } = require("./env")

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey)

module.exports = { supabase }
