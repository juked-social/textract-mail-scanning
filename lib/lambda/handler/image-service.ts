import { Page } from 'puppeteer';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { splitS3Url } from './utils';

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


// Function to delete an image from S3
export async function deleteImageFromS3(imageKey: string): Promise<void> {
    try {
        const { key } = splitS3Url(imageKey);

        // Create a delete command
        const command = new DeleteObjectCommand({
            Bucket: bucketName!,
            Key: key,
        });

        // Send the delete command to S3
        await s3.send(command);

        console.log(`Successfully deleted image from S3 with key ${imageKey}`);
    } catch (error) {
        console.error(`Error deleting image from S3: ${error}`);
    }
}