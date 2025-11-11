export const UPLOAD_BUCKET_PREFIX = "tidyvid-"
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListBucketsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://574245d23fa88ab0cf7029c5fa4b5e14.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: '2acd8a397c71065dd0218b73b575dc6c',
    secretAccessKey: '5e78fa343f76213fdd07007ebfd03bfbb9a45575df8c85bd6e0b4589fe2741f8',
  },
})

export const setCorsPolicy = async (bucketName) => {
  const corsConfig = {
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "POST", "PUT"],  // Add other methods as needed
          AllowedOrigins: ["https://tidyvid.com"],  // Specify your allowed origins
          ExposeHeaders: [],
          MaxAgeSeconds: 3000
        },
      ],
    },
  };

  const command = new PutBucketCorsCommand(corsConfig);

  try {
    const response = await S3.send(command);
    console.log('CORS policy set:', response);
  } catch (error) {
    console.error('Failed to set CORS policy:', error);
  }
}

export async function createBucket(accountId) {
  let bucketName = UPLOAD_BUCKET_PREFIX + accountId
  const command = new CreateBucketCommand({
    Bucket: bucketName
  })
  try {
    const response = await S3.send(command)
    console.log('Bucket created:', response)
  } catch (error) {
    console.error('Failed to create bucket:', error)
  }
  try {
    const response = await setCorsPolicy(bucketName)
  } catch(error) {
    console.error('Failed to set CORS:', error)
  }
}

export async function getViewUrl(bucketName, fileName) {

  console.log(bucketName)
  console.log(fileName)
  try {
    const url = await getSignedUrl(S3, new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Expires: 3600, // URL expiration time in seconds
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }))
    return url
  } catch (error) {
    console.error('Error generating S3 signed URL', error)
    throw error
  }
}

export async function getPresignedToken(fileName, accountId, fileType) {

  console.log(fileType)
  let bucketName = UPLOAD_BUCKET_PREFIX + accountId

  try {
    const url = await getSignedUrl(S3, new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Fields: {
      'Content-Type': fileType
    }}),
    { expiresIn: 3600 })
    return url
  } catch(e) {
    console.log(e)
    return new Response(null, {status: 503})
  }
}

export async function checkFileExists(accountId, fileName) {
  let bucketName = UPLOAD_BUCKET_PREFIX + accountId
  const params = {
    Bucket: bucketName,
    Key: fileName,
  };
  try {
    await S3.send(new HeadObjectCommand(params));
    console.log("File exists.");
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log("File does not exist.");
      return false;
    }
    throw error;
  }
}

export async function listObjects(accountId) {
  let bucketName = UPLOAD_BUCKET_PREFIX + accountId
  const params = {
    Bucket: bucketName,
  }

  try {
    const data = await S3.send(new ListObjectsV2Command(params));
    //console.log(data)
    return data.Contents ? data.Contents: []
  } catch (error) {
    console.error("Error retrieving bucket contents:", error);
    throw error;
  }
}

export async function listCleanFiles(accountId) {
  let bucketName = UPLOAD_BUCKET_PREFIX + accountId
  const params = {
    Bucket: bucketName,
  };

  try {
    const data = await S3.send(new ListObjectsV2Command(params));
    if(!data.Contents) {
      return []
    }
    const cleanFiles = data.Contents.filter(file => {
      const pattern = /_clean(?=\.[^\.]+$)/;
      return pattern.test(file.Key);
    });
    return cleanFiles.map(file => file.Key.replace(/_clean(?=\.[^\.]+$)/i, ''));
  } catch (error) {
    console.error("Error retrieving bucket contents:", error);
    throw error;
  }
}

//todo, how do we prevent people from uploading non-video files?
export async function listCompositeFiles(accountId) {
  let objects = await listObjects(accountId)
  let objectNames = objects.map(o => o.Key)
  let finalFiles = []
  for(let i = 0; i < objectNames.length; i++) {
    let vname = vidNames[i]
    //console.log(vname)
    if(vname.includes("_clean")) {
      continue
    }else {
      let file = {
        original: vname
      }
      let newName = insertBeforeExtension(vname, "_clean")
      if(objectNames.includes(newName)) {
        file.cleaned = newName
      }
      finalFiles.push(file)
    }
  }
  return finalFiles
}

export async function listAllBuckets() {
  try {
    const data = await S3.send(new ListBucketsCommand({}));
    return data.Buckets.map(bucket => bucket.Name);
  } catch (error) {
    console.error("Error listing buckets:", error);
    throw error;
  }
}

export async function downloadFile(bucketName, key, downloadPath) {
  const getObjectParams = {
    Bucket: bucketName,
    Key: key
  };

  try {
    const { Body } = await S3.send(new GetObjectCommand(getObjectParams));
    await pipeline(
      Body,
      createWriteStream(downloadPath)
    );
    console.log('File downloaded successfully');
  } catch (error) {
    console.error('Error downloading file:', error);
  }
}


