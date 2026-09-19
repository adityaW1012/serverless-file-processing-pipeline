import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import pdfParse from "pdf-parse";
import { randomUUID } from "crypto";

const s3 = new S3Client({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET;

export const handler = async (event) => {
  console.log("Event received:", JSON.stringify(event));

  for (const record of event.Records) {
    const sourceBucket = record.s3.bucket.name;
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const fileId = randomUUID();

    try {
      // 1. Download PDF from S3
      const getResult = await s3.send(
        new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey })
      );
      const pdfBuffer = await streamToBuffer(getResult.Body);

      // 2. Extract text + metadata with pdf-parse
      const parsed = await pdfParse(pdfBuffer);
      const extractedText = parsed.text;
      const pageCount = parsed.numpages;

      // 3. Save extracted text as a .txt file in processed bucket
      const destKey = `extracted-text/${sourceKey.split("/").pop().replace(/\.pdf$/i, ".txt")}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: PROCESSED_BUCKET,
          Key: destKey,
          Body: extractedText,
          ContentType: "text/plain",
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
            fileType: "pdf",
            status: "PROCESSED",
            pageCount,
            sizeBytes: pdfBuffer.length,
            textPreview: extractedText.slice(0, 500), // first 500 chars, avoid bloating the item
            createdAt: new Date().toISOString(),
          },
        })
      );

      console.log(`Successfully processed ${sourceKey} -> ${destKey}`);
    } catch (err) {
      console.error(`Failed to process ${sourceKey}:`, err);

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            fileId,
            originalKey: sourceKey,
            originalBucket: sourceBucket,
            fileType: "pdf",
            status: "FAILED",
            error: err.message,
            createdAt: new Date().toISOString(),
          },
        })
      );
      throw err;
    }
  }
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}