import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { pool } from './pg.mjs'

let pgc = connectPgSimple(session)
const pgs = new pgc({
  pool : pool,
  tableName : 'session'
})

const sessionHandler = session({
  store: pgs,
  secret: 'SESSIONSECRETSADASKFNSADFDSFSADFDSFSD',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
})

export { sessionHandler }