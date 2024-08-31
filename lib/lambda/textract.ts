import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    TextractClient, Block
} from '@aws-sdk/client-textract';
import { TextractInterface } from './entry/textract';
import { extractCardValue, splitS3Url } from './handler/utils';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelResponse } from '@aws-sdk/client-bedrock-runtime';
import { updateMailInDynamoDB } from './handler/mail-service';
import { Mail } from './entry/mail';

// const textractClient = new TextractClient({ region: process.env.REGION });
const tableName = process.env.MAIL_METADATA_TABLE_NAME;
const s3Client = new S3Client({ region: process.env.REGION });
const openaiApiKey = process.env.OPENAI_API_KEY;
const bedrockModelId = process.env.BEDROCK_MODEL_ID;

// Define the type for messages
interface Message {
    role: string;
    content: string;
}

interface BedrockResponse {
    address: string | null
    code: string | null
    email: string | null
    message: string | null
    user_full_name: string | null
}

// Define the type for the response when no output class is provided
interface ChatCompletionResponse {
    choices: Array<{ message: { content: string } }>;
}

async function invokeBedrockModel(bedrockClient: BedrockRuntimeClient, textContent: string): Promise<any> {
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
`;
        const userMessage = {
            role: 'user',
            content: `Here is the text to analyze:\n${textContent}`
        };

        const requestBody = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 150,
            system: systemPrompt,
            messages: [ userMessage],
            temperature: 0.5,
            top_p: 0.9
        };

        const response: InvokeModelResponse = await bedrockClient.send(new InvokeModelCommand({
            modelId: bedrockModelId,
            body: JSON.stringify(requestBody),
            contentType: 'application/json',
            accept: 'application/json'
        }));
        console.log('Resp: ', response);
        //
        const responseBody = response?.body ? JSON.parse(new TextDecoder().decode(response.body)) : {
            choices: [{ text: '' }]
        };
        console.log('responseBody: ', responseBody);

        const extractedInformation: string = responseBody.content[0].text;

        console.log(`Extracted information: ${extractedInformation}`);
        const parsedResponse = JSON.parse(extractedInformation);

        console.log(`Parsed response: ${parsedResponse}`);
        return parsedResponse;
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

// Define the function to update mail in DynamoDB
export const handler = async (event: TextractInterface) => {
    const originalFilePath = event.manifest.s3Path;
    const anyMailId = extractCardValue(originalFilePath);

    const { bucket, key } = splitS3Url(event.textract_result.TextractTempOutputJsonPath);
    const bedrockClient = new BedrockRuntimeClient({});
    const textractResponse = await readTextFromS3(bucket, `${key}/1`);
    const textractResponseJson = JSON.parse(textractResponse);
    const text = textractResponseJson?.Blocks?.filter((block: Block) => block.BlockType === 'LINE')?.map((block: Block) => block.Text || '').join('\n') || '';

    console.log(text);

    const extractedInfo: BedrockResponse = await invokeBedrockModel(bedrockClient, text);

    if (extractedInfo === null) {
        return {};
    }

    const formattedResponse = {
        handwritten_confidence: 0.85,
        ...extractedInfo
    };
    formattedResponse.code = formattedResponse.code ? (formattedResponse.code.replace(/[^a-zA-Z0-9]/g, '')) : '';
    formattedResponse.user_full_name = formattedResponse.user_full_name ? formattedResponse.user_full_name.replace(/[^a-zA-Z\s]/g, '') : '';
    formattedResponse.email = formattedResponse.email ? formattedResponse.email.replace(/[^a-zA-Z0-9_.+-@]/g, '').toLowerCase() : '';
    formattedResponse.message = formattedResponse.message ? formattedResponse.message.replace(/[^a-zA-Z0-9@.\s]/g, '') : '';

    console.log('What you are going to write', formattedResponse);

    const mail: Mail = {
        any_mail_id: Number(anyMailId),
        assignedDate: '',
        creationDate: '',
        image_path: '',
        lastActionDate: '',
        message: JSON.stringify(formattedResponse),
        // ScrapPostCard: '',
    };

    // We will need to parse the textract output and extract the required information

    // Update the mail record with textract output
    if (mail) {
        const mailData = { ...mail, message: '' };
        // Update existing mail
        await updateMailInDynamoDB(mailData);
    }

    return { id: anyMailId };
};
