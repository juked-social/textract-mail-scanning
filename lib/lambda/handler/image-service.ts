import { Page } from 'puppeteer';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.REGION });
const bucketName = process.env.IMAGE_BUCKET_NAME; // The S3 bucket name

// Helper function to download an image and save it to S3
export async function downloadAndSaveImage(page: Page, imageUrl: string, imageKey: string) {
    try {
        await page.goto(imageUrl, { waitUntil: 'networkidle2' });

        // Get the final URL after redirections
        const finalUrl = page.url();

        const response = await fetch(finalUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image from ${imageUrl}`);
        }

        const imageData = await response.arrayBuffer();

        // Upload the image to S3
        const command = new PutObjectCommand({
            Bucket: bucketName!,
            Key: imageKey,
            Body: Buffer.from(imageData),
            ContentType: 'image/jpeg', // Adjust based on actual content type
        });

        await s3.send(command);

        console.log(`Successfully saved image to S3 with key ${imageKey}`);
        return `s3://${bucketName}/${imageKey}`;
    } catch (error) {
        console.error(`Error saving image to S3: ${error}`);
        return '';
    }
}
