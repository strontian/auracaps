import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()

app.use((req, res, next) => {
  console.log(req.url)
  next()
})

app.use('/dash', express.static(path.join(__dirname, 'tv-dash/dist')))

app.use(express.static('public'))
app.use(express.static('public/experiments'))

app.use('/ffmpeg', express.static(path.join(__dirname, 'node_modules/@ffmpeg')))

// Static files and middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Session middleware
import { sessionHandler } from './services/session.mjs'
app.use(sessionHandler)

// Import and use route modules
import authRoutes from './routes/auth.mjs'
import uploadRoutes from './routes/upload.mjs'
import userRoutes from './routes/user.mjs'
import paymentRoutes from './routes/payment.mjs'
import captionRoutes from './routes/captions.mjs'
import feedbackRoutes from './routes/feedback.mjs'
import errorRoutes from './routes/error.mjs'
import videosRoutes from './routes/videos.mjs'

// Mount routes
app.use('/api', authRoutes)
app.use('/api', uploadRoutes)
app.use('/api', userRoutes)
app.use('/api', paymentRoutes)
app.use('/api', captionRoutes)
app.use('/api', feedbackRoutes)
app.use('/api', errorRoutes)
app.use('/api', videosRoutes)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))