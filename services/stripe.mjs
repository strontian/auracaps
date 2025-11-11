import Stripe from 'stripe'
import { pool }  from './pg.mjs'

let DEV = false
let stripeKey
let stripePrice10Mins
let stripePrice60Mins
let stripeRedirect

if(DEV) {
  stripeKey = process.env.STRIPE_TEST_KEY
  stripePrice10Mins = 'price_1PLRpIEA2aaARAA8PWDRG5ts'
  stripePrice60Mins = 'price_1PLRpYEA2aaARAA8CGIR85dQ'
  stripeRedirect = 'http://localhost:5173'
} else {
  stripeKey = process.env.STRIPE_KEY
  stripePrice10Mins = 'price_1PLQfaEA2aaARAA8fPYGM7qu'
  stripePrice60Mins = 'price_1PLQfvEA2aaARAA8gMxprY8R'
  stripeRedirect = 'https://tidyvid.com'
}

const stripe = Stripe(stripeKey)

export async function checkout10() {
  return await createCheckoutSession(stripePrice10Mins)
}

export async function checkout60() {
  return await createCheckoutSession(stripePrice60Mins)
}

export async function createCheckoutSession(price) {
  const session = await stripe.checkout.sessions.create({
    //ui_mode: 'embedded',
    line_items: [
      {
        price: price,
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${stripeRedirect}/api/purchase_complete?session_id={CHECKOUT_SESSION_ID}&`,
  })
  return session
}

let credit_amounts = {
  'price_1PLRpIEA2aaARAA8PWDRG5ts': 600,
  'price_1PLRpYEA2aaARAA8CGIR85dQ': 3600,
  'price_1PLQfaEA2aaARAA8fPYGM7qu': 600,
  'price_1PLQfvEA2aaARAA8gMxprY8R': 3600
}

export async function completePurchase(accountId, sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items']
  })
  console.log(session)
  if(session.status === 'complete') {
    let item = session.line_items.data[0]
    console.log(item.price)
    let credit_seconds = credit_amounts[item.price.id]
    await pool.query('INSERT INTO credits (credit_seconds, account_id, timestamp, product_id, session_id) SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM credits WHERE session_id = $5)', [credit_seconds, accountId, new Date(), item.price.id, session.id])
  }
}
