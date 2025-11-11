// Authentication middleware functions

export const requireAuth = (req, res, next) => {
  if (!req.session.accountId) {
    //return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

export const requireAuthOrRedirect = (req, res, next) => {
  if (!req.session.accountId) {
    return res.status(403).end()
  }
  next()
}

// Admin account IDs - consider moving to environment variables
const ADMIN_ACCOUNTS = [
  '101967346386369497929', // davidacct
  '111552741749054310493'  // danacct
]

export const requireAdmin = (req, res, next) => {
  const accountId = req.session.accountId
  if (!accountId || !ADMIN_ACCOUNTS.includes(accountId)) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}