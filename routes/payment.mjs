import express from 'express'
import { completePurchase, checkout10, checkout60 } from '../services/stripe.mjs'

const router = express.Router()

router.get('/checkout_ten', async (req, res) => {
  console.log('create session!')
  let session = await checkout10()
  res.json({url: session.url})
})

router.get('/checkout_sixty', async (req, res) => {
  console.log('create session!')
  let session = await checkout60()
  res.json({url: session.url})
})

router.get('/purchase_complete', async (req, res) => {
  completePurchase(req.session.accountId, req.query.session_id).then(_ => {
    console.log("trying to redirect")
    res.redirect('https://tidyvid.com')
  })
})

export default router