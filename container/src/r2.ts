import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { stat, readFile } from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MiB

export const downloadFile = async ({
	s3,
	bucket,
	fileKey,
	outputPath,
	timeoutMs = 10000,
}: {
	s3: S3Client;
	bucket: string;
	fileKey: string;
	outputPath: string;
	timeoutMs?: number;
}) => {
	try {
		// 1) Optionally HEAD to see size
		const { ContentLength } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: fileKey, Range: 'bytes=0-0' }));
		console.log('File size is', ContentLength);

		// 2) GetObject returns a streaming Body on Node
		const { Body, ETag } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: fileKey }));
		if (!Body) {
			throw new Error('No response body');
		}
		await pipeline(Body as NodeJS.ReadableStream, createWriteStream(outputPath), {
			signal: AbortSignal.timeout(timeoutMs),
		});
		return ETag;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			console.error(`Download timed out for ${bucket}/${fileKey} after ${timeoutMs}ms`);
			throw error;
		}
		console.error('Error downloading file:', error);
		throw error;
	}
};

export const uploadFile = async ({
	s3,
	bucket,
	fileKey,
	inputPath,
}: {
	s3: S3Client;
	bucket: string;
	fileKey: string;
	inputPath: string;
}) => {
	const { size } = await stat(inputPath);

	if (size <= MIN_PART_SIZE) {
		const fileBuffer = await readFile(inputPath);
		const { ETag } = await s3.send(new PutObjectCommand({ Bucket: bucket, Key: fileKey, Body: fileBuffer }));

		if (!ETag) throw new Error('Upload succeeded but no ETag');
		return ETag;
	}

	const fileStream = createReadStream(inputPath);
	const parallelUpload = new Upload({
		client: s3,
		params: { Bucket: bucket, Key: fileKey, Body: fileStream },
		queueSize: 4,
		partSize: MIN_PART_SIZE,
	});
	const result = await parallelUpload.done();
	if (!result.ETag) throw new Error('Upload succeeded but no ETag');
	return result.ETag;
};
