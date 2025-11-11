import express from 'express'
import { addFeedback } from '../services/pg.mjs'

const router = express.Router()

router.post('/feedback', async (req, res) => {
  console.log(req.body)
  console.log(`feedback received from user`)
  
  let generalFeedback = req.body.generalFeedback
  let requestedFeatures = req.body.requestedFeatures
  
  try {
    // Validate that we have at least some feedback
    if (!generalFeedback && (!requestedFeatures || requestedFeatures.length === 0)) {
      return res.status(400).json({ error: 'No feedback provided' })
    }
    
    // Convert requested features to JSON if it's an array
    let featuresJson = null
    if (requestedFeatures && Array.isArray(requestedFeatures)) {
      featuresJson = JSON.stringify(requestedFeatures)
    }
    
    console.log("general feedback:", generalFeedback)
    console.log("requested features:", featuresJson)
    
    let feedbackId = await addFeedback(generalFeedback, featuresJson, req.session.accountId)
    
    console.log("feedback saved with id:", feedbackId)
    res.status(200).json({ success: true, feedbackId: feedbackId })
    
  } catch (error) {
    console.error("Error saving feedback:", error)
    res.status(500).json({ error: 'Failed to save feedback' })
  }
})

export default router