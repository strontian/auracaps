export const BUCKET_NAME = "tv-videos"
import { getUploadUrl, getViewUrl, checkFileExists, listObjectsPrefix } from "./r2_new.mjs"
import { getAccountBalance, getCaptionsMulti, getCaptionTasks, getPurchases } from "./pg.mjs"

export function getFilename(accountId, fileName) {
  return accountId + "-" + fileName
}

export async function tvUploadUrl(accountId, fileName, fileType) {
  let tvFileName = getFilename(accountId, fileName)
  return getUploadUrl(BUCKET_NAME, tvFileName, fileType)
}

export async function tvViewUrl(accountId, fileName) {
  let tvFileName = accountId + "-" + fileName
  return getViewUrl(BUCKET_NAME, tvFileName)
}

export async function tvFileExists(accountId, fileName) {
  let tvFileName = accountId + "-" + fileName
  return checkFileExists(BUCKET_NAME, tvFileName)
}

export async function accountInfo(accountId) {
  let data = await listObjectsPrefix(BUCKET_NAME, accountId)
  const cleanFiles = data.filter(file => {
    const pattern = /_clean(?=\.[^\.]+$)/
    return pattern.test(file.Key)
  })
  //let videos =  cleanFiles.map(file => file.Key.replace(/_clean(?=\.[^\.]+$)/i, '')).map(file => file.replace(accountId + "-", ''))

  let captionFiles = data.filter(file => {
    const pattern = /_captions(?=\.[^\.]+$)/
    return pattern.test(file.Key)
  }).map(f => f.Key)

  //console.log(videos)
  //let balance = await getAccountBalance(accountId)
  //let captions = await getCaptionsMulti(accountId, videos)
  //console.log(captions)
  //todo: 
  return {
    //videos: videos,
    //balance: balance,
    //captions: captions,
    //captionFiles: captionFiles,
    //captionTasks: captionTasks
  }
}

import { getUser } from "./pg.mjs"

export async function accountInfoAdmin(accountId) {
  let data = await listObjectsPrefix(BUCKET_NAME, accountId)
  const cleanFiles = data.filter(file => {
    const pattern = /_clean(?=\.[^\.]+$)/
    return pattern.test(file.Key)
  })
  let videos =  cleanFiles.map(file => file.Key.replace(/_clean(?=\.[^\.]+$)/i, '')).map(file => file.replace(accountId + "-", ''))

  let captionFiles = data.filter(file => {
    const pattern = /_captions(?=\.[^\.]+$)/
    return pattern.test(file.Key)
  }).map(f => f.Key)

  //console.log(videos)
  let user = await getUser(accountId)
  let captionTasks = await getCaptionTasks(accountId)
  let balance = await getAccountBalance(accountId)
  let captions = await getCaptionsMulti(accountId, videos)
  let purchases = await getPurchases(accountId)
  //console.log(captions)
  //todo: 
  return {
    user: user,
    accountId: accountId,
    videos: videos,
    balance: balance,
    captions: captions,
    captionFiles: captionFiles,
    captionTasks: captionTasks,
    purchases: purchases
  }
}