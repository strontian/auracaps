
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import fs from 'fs'
import { pipeline } from 'stream/promises'

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://574245d23fa88ab0cf7029c5fa4b5e14.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: '2acd8a397c71065dd0218b73b575dc6c',
    secretAccessKey: '5e78fa343f76213fdd07007ebfd03bfbb9a45575df8c85bd6e0b4589fe2741f8',
  },
})

export async function getViewUrl(bucketName, fileName) {
  try {
    const url = await getSignedUrl(S3, new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Expires: 3600, // URL expiration time in seconds
    }))
    return url
  } catch (error) {
    console.error('Error generating S3 signed URL', error)
    throw error
  }
}

export async function getDownloadUrl(bucketName, fileName, dispo = fileName) {
  try {
    const url = await getSignedUrl(S3, new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Expires: 3600, // URL expiration time in seconds
      ResponseContentDisposition: `attachment; filename="${dispo}"`,
    }))
    return url
  } catch (error) {
    console.error('Error generating S3 signed URL', error)
    throw error
  }
}

export async function getUploadUrl(bucketName, fileName, fileType) {
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

export async function downloadFile(bucketName, key, downloadPath) {
  const getObjectParams = {
    Bucket: bucketName,
    Key: key
  };

  try {
    const { Body } = await S3.send(new GetObjectCommand(getObjectParams));
    await pipeline(
      Body,
      fs.createWriteStream(downloadPath)
    );
    console.log('File downloaded successfully');
  } catch (error) {
    console.error('Error downloading file:', error);
  }
}

export async function uploadFile(bucketName, fileName, filePath) {
  const fileStream = fs.createReadStream(filePath)

  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: fileStream,
  };

  try {
    await S3.send(new PutObjectCommand(params));
    console.log("File uploaded successfully.");
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

export async function checkFileExists(bucketName, fileName) {
  const params = {
    Bucket: bucketName,
    Key: fileName,
  };
  try {
    await S3.send(new HeadObjectCommand(params));
    //console.log("File exists.");
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      //console.log("File does not exist.");
      return false;
    }
    throw error;
  }
}

export async function listObjectsPrefix(bucketName, prefix) {
  const params = {
    Bucket: bucketName,
    Prefix: prefix
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

export async function deleteFile(bucketName, fileName) {
  const params = {
    Bucket: bucketName,
    Key: fileName
  };

  try {
    await S3.send(new DeleteObjectCommand(params));
    console.log("File deleted successfully.");
    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
}