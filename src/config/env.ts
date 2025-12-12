export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  server: {
    port: process.env.PORT || 3001,
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  },
  nodeEnv: process.env.NODE_ENV || "development",
}
