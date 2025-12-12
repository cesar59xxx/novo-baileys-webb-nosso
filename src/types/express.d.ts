declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        project_id: string
      }
    }
  }
}
