import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { s3Client } from "./client";

export type StorageFolder = "originals" | "spaces" | "avatars" | "documents";

export interface UploadFileInput {
  buffer: Buffer;
  contentType: string;
  extension: string;
  folder: StorageFolder;
}

export interface UploadFileResult {
  key: string;
  signedUrl: string;
}

function getBucketName(): string {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("Falta la variable de entorno S3_BUCKET_NAME");
  }
  return bucket;
}

export async function getPresignedFileUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const bucket = getBucketName();

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
}

export async function resolveSpaceImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  return getPresignedFileUrl(imageUrl);
}

/**
 * Resolves a space card thumbnail URL: returns http/https URLs as-is, checks S3
 * for a Lambda-generated thumbnail under `thumbnails/` when the key starts with
 * `originals/` (falling back to the original key if not yet available), and signs
 * legacy `spaces/` keys directly.
 */
export async function resolveSpaceThumbnailUrl(
  imageUrl: string
): Promise<string> {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  if (imageUrl.startsWith("originals/")) {
    const thumbnailKey = imageUrl.replace(/^originals\//, "thumbnails/");
    try {
      const bucket = getBucketName();
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: thumbnailKey,
        })
      );
      return getPresignedFileUrl(thumbnailKey);
    } catch {
      return getPresignedFileUrl(imageUrl);
    }
  }

  return getPresignedFileUrl(imageUrl);
}

export async function uploadFileToS3({
  buffer,
  contentType,
  extension,
  folder,
}: UploadFileInput): Promise<UploadFileResult> {
  const bucket = getBucketName();
  const key = `${folder}/${randomUUID()}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const signedUrl = await getPresignedFileUrl(key);
  return { key, signedUrl };
}

export async function deleteFileFromS3(key: string): Promise<void> {
  const bucket = getBucketName();

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
