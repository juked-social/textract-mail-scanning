import { splitS3Url } from './handler/utils';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { publishError } from './helpers';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { getRotationDetectionPrompt, invokeBedrockModel } from './handler/bedrock-service';

interface IRotationDetectionResult {
    rotationRequired: boolean;
    angleInDegrees: number;
    confidence: number;
    orientation: string;
    detectionMethod: string;
    recommendedAction: string;
}

const bedrockModelId = process.env.BEDROCK_MODEL_ID;
const bedrockClient = new BedrockRuntimeClient({ region: process.env.REGION });
const s3Client = new S3Client({ region: process.env.REGION });

export async function processImage(imageBuffer: Buffer, isRotationRequired: boolean, rotationAngle: number): Promise<Buffer> {
    let image = sharp(imageBuffer);
    if (isRotationRequired) {
        image = image.rotate(-rotationAngle);
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
        if (!s3Path) {
            throw new Error('Missing required s3Path parameter');
        }
        if (!bedrockModelId) {
            throw new Error('Missing required bedrockModelId env variable');
        }
        const { bucket, key } = splitS3Url(s3Path);
        console.log(`Processing image: ${key}`);

        // Get image from S3
        const s3Command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const { Body } = await s3Client.send(s3Command);

        if (!Body || !(Body instanceof Readable)) {
            throw new Error('Image not found or body is not a readable stream');
        }
        // validate image rotation
        const imageBuffer = await streamToBuffer(Body);

        const imageBase64 = imageBuffer.toString('base64');
        const prompt = getRotationDetectionPrompt();
        const rotationDetectionResult = await invokeBedrockModel<IRotationDetectionResult>(
            bedrockClient,
            bedrockModelId,
            imageBase64,
            prompt,
        );
        console.log('rotationDetectionResult', rotationDetectionResult);
        const { rotationRequired, angleInDegrees } = rotationDetectionResult;
        // Process image using sharp directly from the buffer
        const processedBuffer = await processImage(imageBuffer, rotationRequired, Number(angleInDegrees));
        // Upload processed image back to S3
        const s3ImagePut = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: processedBuffer,
        });
        const putItemResult = await s3Client.send(s3ImagePut);
        console.log('putItemResult', putItemResult);
    } catch (error) {
        console.error('Error during image processing:', error);
        await publishError('ImageRotator', error);
        throw error;
    }
    return { s3Path };
};