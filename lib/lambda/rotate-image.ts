import { splitS3Url } from './handler/utils';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const s3Client = new S3Client({ region: process.env.REGION });

export async function processImage(imageBuffer: Buffer): Promise<Buffer> {
    let image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (metadata.height && metadata.width && metadata.height > metadata.width) {
        image = image.rotate(-90);
    }

    image
        .normalize() // Improve contrast and brightness
        .linear(1.5, -50); // Adjust contrast (1.5) and brightness (-50);

    return image.toBuffer();
}

const streamToBuffer = (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
};

export const handler = async (event: any) => {
    const { s3Path } = event;

    try {
        const { bucket, key } = splitS3Url(s3Path);

        // Get image from S3
        const s3Command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const { Body } = await s3Client.send(s3Command);

        if (!Body || !(Body instanceof Readable)) {
            throw new Error('Image not found or body is not a readable stream');
        }

        // Convert stream to buffer
        const imageBuffer = await streamToBuffer(Body);

        // Process image using sharp directly from the buffer
        const processedBuffer = await processImage(imageBuffer);

        // Upload processed image back to S3
        const s3ImagePut = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: processedBuffer,
        });
        await s3Client.send(s3ImagePut);

    } catch (error) {
        console.error('Error during processing:', error);
        throw new Error('Error during processing: ' + error);
    }
    return { s3Path };
};