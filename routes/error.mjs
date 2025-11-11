import express from 'express'
import { writeError } from '../services/pg.mjs'

const router = express.Router()

router.post('/error', async (req, res) => {
  try {
    let accountId = req.session.accountId
    
    // Extract error details from request body
    const { errorType, message, fileName } = req.body
    
    // Validate required fields
    if (!errorType || !message || !fileName) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Write error to database
    await writeError(accountId, errorType, message, fileName)
    
    res.status(200).json({ success: true })
  } catch (err) {
    console.error('Error in /api/error endpoint:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router