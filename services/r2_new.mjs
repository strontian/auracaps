
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand
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

export async function getMimeType(bucketName, key) {
  try {
    const headParams = {
      Bucket: bucketName,
      Key: key
    };

    // Get the object's metadata
    const headObject = await S3.send(new HeadObjectCommand(headParams));
    return headObject.ContentType; // MIME type
  } catch (error) {
    console.error('Error getting MIME type:', error);
    throw error;
  }
}

export async function getViewUrl(bucketName, fileName, dispo = fileName) {
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

export async function listFiles(bucketName, continuationToken = null) {
  const params = {
    Bucket: bucketName,
    MaxKeys: 1000,
    ContinuationToken: continuationToken
  };

  try {
    const data = await S3.send(new ListObjectsV2Command(params));
    return data;
  } catch (error) {
    console.error("Error listing files:", error);
    return null;
  }
}

export async function deleteObjects(bucketName, keys) {
  const deleteParams = {
    Bucket: bucketName,
    Delete: {
      Objects: keys.map(key => ({ Key: key })),
      Quiet: false
    }
  };

  try {
    const data = await S3.send(new DeleteObjectsCommand(deleteParams));
    console.log(`Successfully deleted ${data.Deleted.length} objects`);
    if (data.Errors && data.Errors.length > 0) {
      console.log(`Failed to delete ${data.Errors.length} objects`);
      data.Errors.forEach(error => console.error(`Error deleting ${error.Key}: ${error.Message}`));
    }
  } catch (error) {
    console.error("Error in bulk delete operation:", error);
  }
}

export async function emptyBucket(bucketName) {
  try {
    // List all objects in the bucket
    const listObjectsCommand = new ListObjectsV2Command({ Bucket: bucketName });
    const listObjectsResponse = await S3.send(listObjectsCommand);

    if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
      // Prepare the objects to be deleted
      const objectsToDelete = listObjectsResponse.Contents.map(object => ({ Key: object.Key }));

      // Delete the objects
      const deleteObjectsCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objectsToDelete },
      });
      await S3.send(deleteObjectsCommand);
      console.log('Objects deleted successfully');
    } else {
      console.log('No objects to delete in the bucket');
    }
  } catch (error) {
    console.error('Error emptying bucket:', error);
  }
}

export async function deleteBucket(bucketName) {
  await emptyBucket(bucketName)
  try {
    const deleteBucketCommand = new DeleteBucketCommand({ Bucket: bucketName });
    const response = await S3.send(deleteBucketCommand);
    console.log('Bucket deleted successfully:', response);
  } catch (error) {
    console.error('Error deleting bucket:', error);
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

export async function copyFile(oldBucket, oldFile, newBucket, newFile) {
  const copyParams = {
    Bucket: newBucket,
    CopySource: oldBucket + '/' + encodeURIComponent(oldFile),
    Key: newFile
  }
  
  try {
    const data = await S3.send(new CopyObjectCommand(copyParams))
    console.log('Copy successful:', data)
  } catch (error) {
    console.error('Error copying object:', error)
  }
}