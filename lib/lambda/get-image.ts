import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { splitS3Url } from './handler/utils';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
    if (!event?.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Request body is missing' })
        };
    }

    // Parse the body and handle potential errors
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

    const { imagePath } = body;

    if (!imagePath) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'imagePath is required' })
        };
    }

    let bucket = '', key = '';

    try {
        const result = splitS3Url(imagePath);
        bucket = result.bucket;
        key = result.key;
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: error || 'Invalid S3 URL' }),
        };
    }

    if(!bucket || !key){
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'No necessary params' })
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
