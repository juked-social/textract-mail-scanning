import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { splitS3Url } from './handler/utils';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event: any) => {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

    const { imagePath } = body;
    const { bucket, key } = splitS3Url(imagePath);

    if (!imagePath) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'imagePath is required' }),
        };
    }

    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: signedUrl }),
        };
    } catch (error) {
        console.error('Error generating signed URL:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error generating signed URL' }),
        };
    }
};
