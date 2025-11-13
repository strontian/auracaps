import { OAuth2Client } from 'google-auth-library'
import { pool } from './pg.mjs'

const oauthClient = new OAuth2Client()

export async function verify(token) {
  const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
  })
  const payload = ticket.getPayload()
  return { email: payload.email, accountId: payload.sub, name: payload.name }
}

export async function userCheck(email, accountId, name) {
  const userCheck = await pool.query('SELECT * FROM google_auth WHERE account_id = $1', [accountId])
  if (userCheck.rows.length === 0) {
    await pool.query('INSERT INTO google_auth(email, account_id, realname, timestamp) VALUES($1, $2, $3, $4)', [email, accountId, name, new Date()])
    return "new"
  }else {
    return "old"
  }
}
