import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME;
const URL_EXPIRY_SECONDS = 900; // 15 minutes

export const handler = async (event) => {
  try {
    const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
    let items = result.Items || [];

    // Generate a presigned download URL for each successfully processed file
    items = await Promise.all(
      items.map(async (item) => {
        if (item.status === "PROCESSED" && item.processedKey && item.processedBucket) {
          try {
            const command = new GetObjectCommand({
              Bucket: item.processedBucket,
              Key: item.processedKey,
            });
            const downloadUrl = await getSignedUrl(s3, command, {
              expiresIn: URL_EXPIRY_SECONDS,
            });
            return { ...item, downloadUrl };
          } catch (err) {
            console.error(`Failed to presign URL for ${item.processedKey}:`, err);
            return item; // fall back to no download link rather than failing the whole request
          }
        }
        return item;
      })
    );

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error("Error fetching files:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Failed to fetch files" }),
    };
  }
};