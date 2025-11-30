import express from 'express'
import { pool } from '../services/pg.mjs'
import { requireAuth } from '../middleware/auth.mjs'

const router = express.Router()

// Use authentication middleware
router.use(requireAuth)

// Get all videos for the authenticated user
router.get('/videos', async (req, res) => {
  const accountId = req.session.accountId

  try {
    const query = `
      SELECT
        v.filename,
        v.created_at,
        t.srt
      FROM videos v
      LEFT JOIN transcripts t ON v.id = t.video_id
      WHERE v.account_id = $1
      ORDER BY v.created_at DESC
    `
    const result = await pool.query(query, [accountId])

    const videos = result.rows.map(row => ({
      fileName: row.filename,
      uploadDate: row.created_at,
      hasCaptions: !!row.srt
    }))

    res.json({ videos })
  } catch (error) {
    console.error('Error fetching videos:', error)
    res.status(500).json({ error: 'Failed to fetch videos' })
  }
})

export default router
