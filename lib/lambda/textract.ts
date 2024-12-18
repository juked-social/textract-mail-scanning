import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BedrockResponse, isValidReason } from './entry/textract';
import {
    extractCardValue,
    splitS3Url
} from './handler/utils';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { getMailFromDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { Mail } from './entry/mail';
import * as levenshtein from 'fast-levenshtein';
import { publishError } from './helpers';
import { Readable } from 'node:stream';
import { getMainPrompt, invokeBedrockModel } from './handler/bedrock-service';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.REGION });

const s3Client = new S3Client({ region: process.env.REGION });
const bedrockModelId = process.env.BEDROCK_MODEL_ID;

function calculateSimilarityPercentage(message:string, expectedMessage:string): number {
    const distance = levenshtein.get(message, expectedMessage);
    const maxLength = Math.max(message.length, expectedMessage.length);

    // Calculate similarity percentage
    return (1 - (distance / maxLength)) * 100;
}

const streamToBuffer = (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
};

function isValid(mail: BedrockResponse): isValidReason {
    const expectedMessage = 'I wish to receive Sweeps Coins to participate in the sweepstakes promotions offered by Chanced. By submitting this request, I hereby declare that I have read, understood and agree to be bound by Chanced\'s Terms and Conditions and Sweeps Rules.';

    const threshold = 80; // Adjust based on acceptable distance
    const distance = calculateSimilarityPercentage(mail.message || '', expectedMessage);

    if (distance < threshold) {
        return {
            is_valid: false,
            reason: 'Statement Invalid'
        };
    }

    if (!mail.handwritten_confidence || mail.handwritten_confidence < 0.85) {
        return {
            is_valid: false,
            reason: 'AI generated'
        };
    }

    if (!mail.code || mail.code?.length >= 20) {
        return {
            is_valid: false,
            reason: 'Invalid code'
        };
    }

    if (!mail.user_full_name) {
        return {
            is_valid: false,
            reason: 'Invalid user name'
        };
    }

    if (!mail.email || mail.email?.length >= 255) {
        return {
            is_valid: false,
            reason: 'Invalid email'
        };
    }

    return {
        is_valid: true,
    };
}

// Define the function to update mail in DynamoDB
export const handler = async (event: any) => {
    event = event.Payload ? event.Payload : event;
    console.log('event', event);
    const { s3Path } = event;
    if(!s3Path || !bedrockModelId) {
        throw new Error('Missing required  parameter');
    }
    try {
        console.log('s3Path', s3Path);
        const { bucket, key } = splitS3Url(s3Path);
        const anyMailId = extractCardValue(s3Path);
        if(!anyMailId){
            return { id: '', s3Path };
        }
        const s3Command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        const { Body } = await s3Client.send(s3Command);
        if (!Body || !(Body instanceof Readable)) {
            throw new Error('Image not found or body is not a readable stream');
        }
        const imageBuffer = await streamToBuffer(Body);
        const imageBase64 = imageBuffer.toString('base64');

        const prompt = getMainPrompt();
        const formattedResponse = await invokeBedrockModel<BedrockResponse>(
            bedrockClient,
            bedrockModelId,
            imageBase64,
            prompt,
        );

        formattedResponse.code = formattedResponse.code ? (formattedResponse.code.replace(/[^a-zA-Z0-9]/g, '')) : '';
        formattedResponse.user_full_name = formattedResponse.user_full_name ? formattedResponse.user_full_name.replace(/[^a-zA-Z\s]/g, '') : '';
        formattedResponse.email = formattedResponse.email ? formattedResponse.email.replace(/[^a-zA-Z0-9_.+-@]/g, '').toLowerCase() : '';
        formattedResponse.message = formattedResponse.message ? formattedResponse.message.replace(/[^a-zA-Z0-9@.\s]/g, '') : '';

        console.log('formattedResponse', formattedResponse);

        const mail = await getMailFromDynamoDB(Number(anyMailId));

        if (mail) {
            const is_valid_reason = isValid(formattedResponse);

            const mailObj: Mail = {
                ...mail,
                ...formattedResponse,
                lastActionDate: new Date().toISOString(),
                is_valid: is_valid_reason.is_valid,
                reason: is_valid_reason.reason
            };

            await updateMailInDynamoDB(mailObj);

            if(is_valid_reason.is_valid) {
                return { id: anyMailId, s3Path };
            }
        }
    }catch (error){
        console.error('Error processing textract data:', error);
        await publishError('TextractProcessor', error);
        throw error;
    }

    return { id: '', s3Path };
};
