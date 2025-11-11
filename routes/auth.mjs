import express from 'express'
import { accountInfo } from '../services/tv.mjs'
import { verify, userCheck } from '../services/google_auth.mjs'

const router = express.Router()

router.post('/gauth', (req, res) => {
  console.log("gauth hit!")
  verify(req.body.credential).then(userDetails => {
    req.session.accountId = userDetails.accountId
    userCheck(userDetails.email, userDetails.accountId, userDetails.name).then(_ => {
      accountInfo(userDetails.accountId).then(result => {
        res.json(result)
      })
    }).catch(e => {
      console.log(e)
      res.status(500).end()
    })
  }).catch(e => {
    console.log(e)
    res.status(500).end()
  })
})

router.get('/logout', (req, res) => {
  console.log("user loggedout!", req.session.accountId)
  req.session.destroy()
  res.status(200).end()
})

export default router