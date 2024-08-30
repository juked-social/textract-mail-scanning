import fs from 'fs';
import path from 'path';
import { splitS3Url } from './handler/utils';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const s3Client = new S3Client({ region: process.env.REGION });

export async function processImage(imagePath: string): Promise<Buffer> {
    let image = sharp(imagePath);
    const metadata = await image.metadata();

    if (metadata.height && metadata.width && metadata.height > metadata.width) {
        image = image.rotate(-90);
    }
    image
        .resize({ width: 800, height: 520 })
        .normalize() // Improve contrast and brightness
        .linear(1.5, -50); // Adjust contrast (1.5) and brightness (-50);


    return image.toBuffer();
}

export const handler = async (event: any) => {
    try {
        const { s3Path } = event;

        const { bucket, key } = splitS3Url(s3Path);

        // Get image from S3
        const s3Command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });

        const { Body } = await s3Client.send(s3Command);

        if (!Body || !(Body instanceof Readable)) {
            throw new Error('Image not found or body is not a readable stream');
        }

        // Save image to temporary path
        const tempFilePath = path.join('/tmp', path.basename(s3Path));
        if (tempFilePath) {
            const fileStream = fs.createWriteStream(tempFilePath);

            // Pipe the readable stream into the file
            await new Promise<void>((resolve, reject) => {
                Body.pipe(fileStream);
                Body.on('end', () => resolve());
                Body.on('error', (err) => reject(err));
            });

            const buffer = await processImage(tempFilePath);

            // Upload processed image back to S3
            const s3ImagePut = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer
            });
            await s3Client.send(s3ImagePut);

            // Clean up temporary file
            fs.unlinkSync(tempFilePath);
        }
        return { s3Path };
    } catch (error) {
        console.error('Error during processing:', error);
        return {
            statusCode: 500,
            body: {
                message: 'Internal server error', error: error
            },
        };
    }
};
