import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";
import { randomUUID } from "crypto";

const s3 = new S3Client({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET;

const THUMBNAIL_WIDTH = 300;

export const handler = async (event) => {
  console.log("Event received:", JSON.stringify(event));

  for (const record of event.Records) {
    const sourceBucket = record.s3.bucket.name;
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const fileId = randomUUID();

    try {
      // 1. Download original image from S3
      const getResult = await s3.send(
        new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey })
      );
      const imageBuffer = await streamToBuffer(getResult.Body);

      // 2. Resize with sharp
      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: THUMBNAIL_WIDTH })
        .toBuffer();

      // 3. Upload resized image to processed bucket
      const destKey = `thumbnails/${sourceKey.split("/").pop()}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: PROCESSED_BUCKET,
          Key: destKey,
          Body: resizedBuffer,
          ContentType: getResult.ContentType || "image/jpeg",
        })
      );

      // 4. Write metadata to DynamoDB
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            fileId,
            originalKey: sourceKey,
            originalBucket: sourceBucket,
            processedKey: destKey,
            processedBucket: PROCESSED_BUCKET,
            fileType: "image",
            status: "PROCESSED",
            sizeBytes: imageBuffer.length,
            createdAt: new Date().toISOString(),
          },
        })
      );

      console.log(`Successfully processed ${sourceKey} -> ${destKey}`);
    } catch (err) {
      console.error(`Failed to process ${sourceKey}:`, err);

      // Log failure to DynamoDB too, so nothing silently disappears
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            fileId,
            originalKey: sourceKey,
            originalBucket: sourceBucket,
            fileType: "image",
            status: "FAILED",
            error: err.message,
            createdAt: new Date().toISOString(),
          },
        })
      );
      throw err; // Re-throw so Lambda reports failure (helps with CloudWatch alarms/retries)
    }
  }
};

// Helper: convert S3 stream to Buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}