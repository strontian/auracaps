import express from 'express'
import { tvUploadUrl, tvViewUrl, BUCKET_NAME, getFilename, tvFileExists } from '../services/tv.mjs'
import { addMeteringEvent, getAccountBalance, getCaptionsSingle } from '../services/pg.mjs'
import { requireAuth } from '../middleware/auth.mjs'

const router = express.Router()

// Apply auth middleware to all routes in this router
router.use(requireAuth)

router.post('/upload_token', (req, res) => {
  let fileName = req.body.fileName
  let fileType = req.body.fileType
  let accountId = req.session.accountId
  
  tvUploadUrl(accountId, fileName, fileType).then(t => {
    res.status(200).json({
      token: t
    })
  }).catch(error => {
    console.error('Upload token error:', error)
    res.status(500).json({ error: 'Failed to generate upload token' })
  })
})

router.get('/view_url/:fileName', (req, res) => {
  let fileName = req.params.fileName
  let accountId = req.session.accountId
  
  tvViewUrl(accountId, fileName).then(url => {
    res.json({ url })
  }).catch(error => {
    console.error('View URL error:', error)
    res.status(500).json({ error: 'Failed to generate view URL' })
  })
})

router.post('/upload_complete', async (req, res) => {
  try {
    console.log(req.body)
    console.log(`ok upload went ${req.body.fileName}`)
    
    let fileName = req.body.fileName
    let duration = req.body.duration
    let accountId = req.session.accountId
    let tvFileName = getFilename(accountId, fileName)
    
    console.log("upload with duration:", duration)
    
    let balance = await getAccountBalance(accountId)
    let newBalance = balance - Math.ceil(duration)
    
    console.log("balance:", balance, ", duration:", duration, ", newBalance:", newBalance)
    
    if (newBalance >= 0) {
      await addMeteringEvent(accountId, Math.ceil(duration), fileName, new Date())
      await triggerCloudRunJob(BUCKET_NAME, tvFileName)
      res.status(200).json({ balance: newBalance })
    } else {
      res.status(400).json({ error: 'Insufficient balance' })
    }
  } catch (error) {
    console.error('Upload complete error:', error)
    res.status(500).json({ error: 'Failed to complete upload' })
  }
})

router.get('/check/:fileName', async (req, res) => {
  try {
    console.log(req.params.fileName)
    let fileName = req.params.fileName
    let accountId = req.session.accountId
    
    let file = await tvFileExists(accountId, fileName)
    let capString = fileName
    const lastIndex = fileName.lastIndexOf('_clean')
    
    if (lastIndex !== -1) {
      capString = accountId + "-" + fileName.slice(0, lastIndex) + fileName.slice(lastIndex + 6)
    }
    
    console.log('capstring', capString)
    let cap = await getCaptionsSingle(accountId, capString)
    console.log('cap', cap)
    
    let response = {
      fileFound: file
    }
    
    if (cap.length > 0) {
      response.captions = cap[0]
    }
    
    res.status(200).send(response)
  } catch (error) {
    console.error('Check file error:', error)
    res.status(500).json({ error: 'Failed to check file' })
  }
})

export default router