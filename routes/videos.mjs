import express from 'express'
import { pool } from '../services/pg.mjs'
import { requireAuth } from '../middleware/auth.mjs'
import { deleteFile } from '../services/r2_new.mjs'

const router = express.Router()

// Use authentication middleware
router.use(requireAuth)

// Get all videos for the authenticated user
router.get('/videos', async (req, res) => {
  const accountId = req.session.accountId

  try {
    const query = `
      SELECT
        v.id,
        v.filename,
        v.created_at,
        t.srt,
        ct.dest_id
      FROM videos v
      LEFT JOIN transcripts t ON v.id = t.video_id
      LEFT JOIN caption_tasks ct ON v.id = ct.source_id
      WHERE v.account_id = $1 AND v.is_original = true
      ORDER BY v.created_at DESC
    `
    const result = await pool.query(query, [accountId])

    const videos = result.rows.map(row => ({
      id: row.id,
      fileName: row.filename,
      uploadDate: row.created_at,
      hasTranscript: !!row.srt,
      hasCaptionedVideo: !!row.dest_id,
      captionedVideoId: row.dest_id
    }))

    res.json({ videos })
  } catch (error) {
    console.error('Error fetching videos:', error)
    res.status(500).json({ error: 'Failed to fetch videos' })
  }
})

// Delete a video
router.delete('/videos/:id', async (req, res) => {
  const accountId = req.session.accountId
  const videoId = parseInt(req.params.id)

  if (!videoId || isNaN(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Get video details and verify ownership
    const videoQuery = 'SELECT id, r2_key, account_id FROM videos WHERE id = $1'
    const videoResult = await client.query(videoQuery, [videoId])

    if (videoResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Video not found' })
    }

    const video = videoResult.rows[0]

    if (video.account_id !== accountId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Unauthorized' })
    }

    // Get all related videos (captioned versions) that should also be deleted
    const relatedVideosQuery = `
      SELECT v.id, v.r2_key
      FROM videos v
      INNER JOIN caption_tasks ct ON v.id = ct.dest_id
      WHERE ct.source_id = $1
    `
    const relatedVideosResult = await client.query(relatedVideosQuery, [videoId])

    // Delete transcripts
    await client.query('DELETE FROM transcripts WHERE video_id = $1', [videoId])

    // Delete caption tasks where this video is source or destination
    await client.query('DELETE FROM caption_tasks WHERE source_id = $1 OR dest_id = $1', [videoId])

    // Delete related captioned videos from database
    for (const relatedVideo of relatedVideosResult.rows) {
      await client.query('DELETE FROM videos WHERE id = $1', [relatedVideo.id])
    }

    // Delete the original video from database
    await client.query('DELETE FROM videos WHERE id = $1', [videoId])

    await client.query('COMMIT')

    // Delete files from R2 storage (after successful database deletion)
    const BUCKET_NAME = 'tv-captions'
    const deletePromises = []

    if (video.r2_key) {
      deletePromises.push(
        deleteFile(BUCKET_NAME, video.r2_key).catch(err => {
          console.error(`Failed to delete file ${video.r2_key}:`, err)
        })
      )
    }

    // Delete related video files
    for (const relatedVideo of relatedVideosResult.rows) {
      if (relatedVideo.r2_key) {
        deletePromises.push(
          deleteFile(BUCKET_NAME, relatedVideo.r2_key).catch(err => {
            console.error(`Failed to delete file ${relatedVideo.r2_key}:`, err)
          })
        )
      }
    }

    await Promise.all(deletePromises)

    res.json({ success: true, message: 'Video deleted successfully' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error deleting video:', error)
    res.status(500).json({ error: 'Failed to delete video' })
  } finally {
    client.release()
  }
})

export default router
