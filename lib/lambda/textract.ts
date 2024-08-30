import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    TextractClient, Block
} from '@aws-sdk/client-textract';
import { TextractInterface } from './entry/textract';
import { extractCardValue, splitS3Url } from './handler/utils';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const textractClient = new TextractClient({ region: process.env.REGION });
const tableName = process.env.MAIL_METADATA_TABLE_NAME;
const s3Client = new S3Client({ region: process.env.REGION });
const openaiApiKey = process.env.OPENAI_API_KEY;
const bedrockModelId = process.env.BEDROCK_MODEL_ID;

// Define the type for messages
interface Message {
    role: string;
    content: string;
}

// Define the type for the response when no output class is provided
interface ChatCompletionResponse {
    choices: Array<{ message: { content: string } }>;
}

async function invokeBedrockModel(bedrockClient: BedrockRuntimeClient, textContent: string): Promise<any> {
    try {
        console.log('Invoking Bedrock model');

        // Construct the prompt for Bedrock
        const promptText = `
        Extract the following information from the text:
        - Code
        - Address
        - Email
        - Name
        - Message

        Text to analyze:
        ${textContent}`;

        console.log(bedrockModelId);

        const response = await bedrockClient.send(new InvokeModelCommand({
            modelId: bedrockModelId,
            body: JSON.stringify({
                prompt: promptText,
                max_tokens: 150,
                temperature: 0.5,
                top_p: 0.9
            }),
            contentType: 'application/json',
            accept: 'application/json'
        }));

        const responseBody = JSON.parse(response.body.transformToString('utf-8'));
        const extractedInformation = responseBody.choices[0].text.trim();

        return JSON.parse(extractedInformation);
    } catch (error) {
        console.log(`Error invoking Bedrock model: ${error}`);
        throw error;
    }
}

// Define the type for the response when an output class is provided
interface OutputClassResponse<T> {
    choices: Array<{ message: { parsed: T } }>;
}

// Retry logic function
async function retry<T>(fn: () => Promise<T>, retries: number, delay: number): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) {
            throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        return retry(fn, retries - 1, delay);
    }
}

// Function to ask GPT
async function askGPT<T = any>(
    messages: Message[],
    outputClass?: new (...args: any[]) => T
): Promise<string | T | null> {
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const requestBody = {
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.85,
    };

    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    };

    try {
        // Retry up to 3 times with a random delay between 60 and 120 seconds
        const response = await retry(() => fetch(endpoint, fetchOptions), 3, Math.random() * (120000 - 60000) + 60000);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const responseData = await response.json();

        return responseData;
        //
        // if (outputClass) {
        //     const parsedResponse = responseData as OutputClassResponse<T>;
        //     if (parsedResponse.choices[0].message.parsed === null) {
        //         return null;
        //     }
        //     return parsedResponse.choices[0].message.parsed;
        // } else {
        //     const contentResponse = responseData as ChatCompletionResponse;
        //     return contentResponse.choices[0].message.content;
        // }
    } catch (error) {
        console.error('Error asking GPT:', error);
        throw error;
    }
}

// Define the function to read text from S3
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

export const handler = async (event: TextractInterface) => {
    const originalFilePath = event.manifest.s3Path;
    const anyMailId = extractCardValue(originalFilePath);

    const { bucket, key } = splitS3Url(event.textract_result.TextractTempOutputJsonPath);
    const bedrockClient = new BedrockRuntimeClient({});
    const textractResponse = await readTextFromS3(bucket, `${key}/1`);
    const textractResponseJson = JSON.parse(textractResponse);
    const text = textractResponseJson?.Blocks?.filter((block: Block) => block.BlockType === 'LINE')?.map((block: Block) => block.Text || '').join('\n') || '';

    console.log(text);

    // BEDROCK need access
    // const extractedInfo = await invokeBedrockModel(bedrockClient, text);

    // CHATGPT need valid API KEY
    // const prompt = `
    // Extract the following information from the text:
    //     - code
    //     - address
    //     - email
    //     - name
    //     - message`;
    //
    // const messages = [
    //     { role: 'system', content: prompt },
    //     { role: 'user', content: text },
    // ];
    //
    // const extractedInfo = await askGPT(messages);
    //
    // console.log(JSON.stringify(extractedInfo));
    //
    // if (extractedInfo === null) {
    //     return {};
    // }

    // const response = extractedInfo;
    // response.handwritten_confidence = 0.85;
    // response.code = response.code.replace(/[^a-zA-Z0-9]/g, '');
    // response.user_full_name = response.user_full_name.replace(/[^a-zA-Z\s]/g, '');
    // response.email = response.email.replace(/[^a-zA-Z0-9_.+-@]/g, '').toLowerCase();
    // response.message = response.message.replace(/[^a-zA-Z0-9@.\s]/g, '');
    //
    // console.log(response);

    // We will need to parse the textract output and extract the required information

    // Update the mail record with textract output
    // if (mail) {
    //     const mailData = { ...mail, message: '' };
    //     // Update existing mail
    //     await updateMailInDynamoDB(mailData);
    // }

    return { id: anyMailId };
};
