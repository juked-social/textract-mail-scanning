import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    Block
} from '@aws-sdk/client-textract';
import { BedrockResponse, isValidReason, TextractInterface } from './entry/textract';
import {
    extractCardValue,
    fixIncompleteJSON,
    splitS3Url
} from './handler/utils';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelResponse } from '@aws-sdk/client-bedrock-runtime';
import { getMailFromDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { Mail } from './entry/mail';
import * as levenshtein from 'fast-levenshtein';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.REGION });

const s3Client = new S3Client({ region: process.env.REGION });
const bedrockModelId = process.env.BEDROCK_MODEL_ID;

function calculateSimilarityPercentage(message:string, expectedMessage:string): number {
    const distance = levenshtein.get(message, expectedMessage);
    const maxLength = Math.max(message.length, expectedMessage.length);

    // Calculate similarity percentage
    return (1 - (distance / maxLength)) * 100;
}

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

    if (!mail.code) {
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

    if (!mail.email) {
        return {
            is_valid: false,
            reason: 'Invalid email'
        };
    }

    return {
        is_valid: true,
    };
}


async function invokeBedrockModel(bedrockClient: BedrockRuntimeClient, textContent: string) {
    try {
        console.log('Invoking Bedrock model');
        const systemPrompt = `You are a highly intelligent text processing assistant. 
        Your task is to extract specific information from text extracted via OCR (Optical Character Recognition) from handwritten mail.
        The OCR text might contain minor errors or typos, so carefully analyze the content to correct any mistakes and extract the following details:

        1. **Code**: A unique identifier, typically alphanumeric.
        2. **User Full Name**: The full name of the user, formatted as "FirstName LastName".
        3. **Email**: The email address of the user.
        4. **Address**: The complete mailing address of the user, including street, city, state, and ZIP code.
        5. **Message**: The main content or message from the user.

        Ensure that the output is structured as a JSON object with the following keys: "code", "user_full_name", "email", "address", and "message".

        Example input text might include:
        - OCR text with varying levels of legibility.
        - Mixed formats or partial information that needs correcting or formatting.

        Remember:
        - Correct any typos or errors due to OCR.
        - Ensure proper capitalization and formatting.
        - If certain information is missing or incomplete, infer the best possible result.
        - Only return a perfect JSON object in this format, and no other string values.
        `;

        const userMessage = {
            role: 'user',
            content: `Here is the text to analyze:\n${textContent}`
        };

        const requestBody = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 150,
            system: systemPrompt,
            messages: [userMessage],
            temperature: 0.5,
            top_p: 0.9
        };

        const response: InvokeModelResponse = await bedrockClient.send(new InvokeModelCommand({
            modelId: bedrockModelId,
            body: JSON.stringify(requestBody),
            contentType: 'application/json',
            accept: 'application/json'
        }));

        const responseBody = response?.body ? new TextDecoder('utf-8').decode(response.body) : '';

        // Parse JSON string to object
        const extractedInformationJSON = JSON.parse(responseBody);

        // Assume extractedInformation is the text you want to clean
        const infoText = extractedInformationJSON?.content?.[0]?.text?.split('{')[0].trim();
        let extractedInformation = extractedInformationJSON?.content?.[0]?.text
            ?.replace(infoText, '')
            .replace(/\n/g, '')
            .trim();

        const transformedJson = fixIncompleteJSON(extractedInformation);

        // If no match is found, try appending a closing brace if needed
        if (transformedJson.match(/\{[\s\S]*}/)) {
            extractedInformation = transformedJson;
        } else {
            console.error('Error parsing corrected JSON');
            return null;
        }

        // Ensure extractedInformation is an object
        return JSON.parse(extractedInformation || '{}');
    } catch (error) {
        console.log(`Error invoking Bedrock model: ${error}`);
        throw error;
    }
}

async function readTextFromS3(bucket: string, key: string): Promise<string> {
    try {
        console.log(`Reading text from S3: bucket=${bucket}, key=${key}`);

        // Create and send the GetObjectCommand
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3Client.send(command);
        return (await response.Body?.transformToString('utf-8') || '');
    } catch (error) {
        console.log(`Error reading text from S3: bucket=${bucket}, key=${key}, error=${error}`);
        throw error;
    }
}

// Define the function to update mail in DynamoDB
export const handler = async (event: TextractInterface) => {
    try {
        const originalFilePath = event?.Payload?.manifest?.s3Path;
        const anyMailId = extractCardValue(originalFilePath);

        const { bucket, key } = splitS3Url(event.Payload.textract_result.TextractTempOutputJsonPath);
        const textractResponse = await readTextFromS3(bucket, `${key}/1`);
        const textractResponseJson = JSON.parse(textractResponse);

        const text = textractResponseJson?.Blocks
            ?.filter((block: Block) => block.BlockType === 'LINE')
            ?.map((block: Block) => block.Text || '')
            .join('\n')
            || '';

        let extractedInfo = await invokeBedrockModel(bedrockClient, text);

        if (extractedInfo === null) {
            return {};
        }

        if (typeof extractedInfo === 'string') {
            extractedInfo = JSON.parse(extractedInfo);
        }

        const formattedResponse = {
            handwritten_confidence: 0.85,
            ...extractedInfo
        };

        formattedResponse.code = formattedResponse.code ? (formattedResponse.code.replace(/[^a-zA-Z0-9]/g, '')) : '';
        formattedResponse.user_full_name = formattedResponse.user_full_name ? formattedResponse.user_full_name.replace(/[^a-zA-Z\s]/g, '') : '';
        formattedResponse.email = formattedResponse.email ? formattedResponse.email.replace(/[^a-zA-Z0-9_.+-@]/g, '').toLowerCase() : '';
        formattedResponse.message = formattedResponse.message ? formattedResponse.message.replace(/[^a-zA-Z0-9@.\s]/g, '') : '';

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
                return { id: anyMailId };
            }
        }
    }catch (error){
        console.log(`Error extracting text: error=${error}`);
    }

    return { id: '' };
};
