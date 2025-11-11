import express from 'express'
import { accountInfo } from '../services/tv.mjs'

const router = express.Router()

router.get('/info', (req, res) => {
  console.log(req.session.accountId)
  if(!req.session.accountId) {
    res.status(403).end()
  } else {
    accountInfo(req.session.accountId).then(result => {
      res.status(200).send(result)
    })
  }
})

export default router