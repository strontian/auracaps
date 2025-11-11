import pg from 'pg'

const neon = 'postgresql://neondb_owner:npg_UinOdmv4AV9W@ep-winter-fog-aduthnho-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

export const pool = new pg.Pool({connectionString: neon, ssl:  {
  rejectUnauthorized: false
}})

export async function getCredits(accountId) {
  const selectQuery = `
    SELECT SUM(credit_seconds) AS total_credit_seconds
    FROM credits
    WHERE account_id = $1
  `;
  const result = await pool.query(selectQuery, [accountId]);
  return result.rows[0].total_credit_seconds;
}

export async function addMeteringEvent(accountId, meterSeconds, fileId, eventTimestamp) {
  const insertQuery = `
    INSERT INTO meter (account_id, meter_seconds, file_id, event_timestamp)
    VALUES ($1, $2, $3, $4)
  `;
  await pool.query(insertQuery, [accountId, meterSeconds, fileId, eventTimestamp]);
}

export async function getTotalMeterSeconds(accountId) {
  const selectQuery = `
    SELECT SUM(meter_seconds) AS total_meter_seconds
    FROM meter
    WHERE account_id = $1
  `
  const result = await pool.query(selectQuery, [accountId])
  return result.rows[0].total_meter_seconds
}

let TRIAL_CREDITS = 300

export async function getAccountBalance(accountId) {
  let credits = await getCredits(accountId)
  let metered = await getTotalMeterSeconds(accountId)
  return credits - metered + TRIAL_CREDITS
}

export async function createFile(accountId, fileName, duration) {
  await pool.query('INSERT INTO files(filename, upload_time, user_id, upload_status) VALUES($1, $2, $3, $4, $5)', [fileName, new Date(), accountId, 'pending'])
}

export async function getBuyers() {
  const selectQuery = `SELECT DISTINCT account_id FROM credits`
  const result = await pool.query(selectQuery)
  return result.rows
}

//TODO: test this!!! - if we even use it, right now python does the other
export async function writeCaptions(captions, accountId, fileName, srt) {
  const query = pool.query('INSERT INTO transcripts (timestamp, transcript, account_id, file_name, srt) VALUES ($1, $2, $3, $4, $5)', [new Date(), captions, accountId, fileName, srt])
}

export async function getCaptions(accountId, fileName) {
  const query = 'select transcript from transcripts where account_id=$1 and file_name=$2'
  let captions = await pool.query(query, [accountId, fileName])
  //console.log(captions)
  return captions.rows[0].transcript
}

export async function getCaptionsMulti(accountId) {
  //const modifiedFileNames = fileNames.map(fileName => `${accountId}-${fileName}`)
  const query = 'select * from transcripts where account_id=$1'
  let captions = await pool.query(query, [accountId])
  //console.log(captions)
  return captions.rows.map(row => ({ fileName: row.file_name, transcript: row.transcript }))
}

export async function getCaptionsSingle(accountId, fileName) {
  //const modifiedFileName = `${accountId}-${fileName}`
  const query = 'select srt, file_name, transcript from transcripts where account_id=$1 and file_name = $2'
  let captions = await pool.query(query, [accountId, fileName])
  return captions.rows.map(row => ({ fileName: row.file_name, transcript: row.transcript }))
}

export async function getCaptionTasks(accountId) {
  const query = 'select file_id, account_id, event_timestamp from caption_tasks where account_id=$1'
  let captionTasks = await pool.query(query, [accountId])
  return captionTasks.rows.map(row => ({ fileName: row.file_id, timestamp: row.event_timestamp }))
}

export async function startCaptionTask(accountId, fileName) {
  await pool.query('INSERT INTO caption_tasks (event_timestamp, account_id, file_id) VALUES ($1, $2, $3)', [new Date(), accountId, fileName])
}

//getCaptionsSingle('101967346386369497929','101967346386369497929-noisy_clean.MOV').then(r => {
  //console.log(r)
//})

export async function writeError(userId, errorType, message, filename) {
  try {
      const query = await pool.query(
          'INSERT INTO errors (user_id, error_type, message, filename, timestamp) VALUES ($1, $2, $3, $4, $5)',
          [userId, errorType, message, filename, new Date()]
      );
      return query;
  } catch (err) {
      console.error('Error writing to errors table:', err);
      throw err;
  }
}

export async function getFeedback(limit = 50) {
  const selectQuery = `
    SELECT 
      id,
      general_feedback,
      requested_features,
      created_at
    FROM feedback
    ORDER BY created_at DESC
    LIMIT $1
  `;
  
  const result = await pool.query(selectQuery, [limit]);
  return result.rows;
}

//again a chance for custom UI here!
export async function addFeedback(generalFeedback, requestedFeatures, accountId) {
  const insertQuery = `
    INSERT INTO feedback (general_feedback, requested_features, account_id)
    VALUES ($1, $2, $3)
    RETURNING id
  `;
  const result = await pool.query(insertQuery, [generalFeedback, requestedFeatures, accountId]);
  return result.rows[0].id;
}

export async function getPurchases(accountId) {
  const selectQuery = `
    SELECT 
      c.timestamp,
      c.credit_seconds,
      c.product_id
    FROM 
      credits c
    WHERE
      c.account_id = $1
    ORDER BY 
      c.timestamp DESC
    LIMIT 100
  `;  
  const result = await pool.query(selectQuery, [accountId]);
  return result.rows;
}

export async function getUser(accountId) {
  const userCheck = await pool.query('SELECT * FROM google_auth WHERE account_id = $1', [accountId])
  return userCheck.rows[0]
}