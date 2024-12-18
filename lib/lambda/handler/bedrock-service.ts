import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

function extractResponseObject(textResponse: string): any {
    try {
        const match = textResponse.match(/<response>([\s\S]*?)<\/response>/);
        console.log('json match', match);

        if (!match) {
            throw new Error('No content found between <response> tags');
        }
        const jsonContent = match[1];
        console.log('json content', jsonContent);
        return JSON.parse(jsonContent);
    } catch (error) {
        throw new Error(`Failed to extract response object: ${error}`);
    }
}

export const getRotationDetectionPrompt = (): string => {
    return `Please analyze this image to determine its rotation angle.
    Focus specifically on:
    1. Text orientation and readability
    2. Any visible lines of text
    3. Whether text appears upside down or sideways
    
    Wrap your response in <response> XML tags and provide ONLY a JSON object inside these tags.
    The JSON should contain:
    {
      "rotationRequired": boolean,
      "angleInDegrees": number,
      "confidence": number,
      "orientation": string,
      "detectionMethod": string,
      "recommendedAction": string
    }
    
    Important:
    - For upside-down text, angle should be 180
    - For sideways text: 90 for right rotation needed, 270 for left rotation needed
    - For normal orientation, angle should be 0
    - If multiple text elements exist, base the decision on the majority orientation
    - Consider the natural reading direction (left-to-right, top-to-bottom)
    
    Your response should look exactly like this:
    <response>
    {
      // JSON content here
    }
    </response>
    
    DO NOT provide any explanation - return ONLY the tagged JSON object.`;
};

export const getMainPrompt = () => {
    return `
        You are an expert document analysis system specializing in carefully extracting and collecting structured user information from handwritten documents in images.
        Your task is to analyze images containing handwritten information and extract specific details with extremely high accuracy.
        
        <goal>
        Your goal is to carefully analyze the image and structure the information into a perfect JSON object, wrapped in <response> tags.
        The JSON object must contain:
        1. code: A unique identifier (typically 12 digits). Analyze each digit individually with extreme care.
        2. user_full_name: The full name of the user, formatted as "FirstName LastName". Pay attention to capitalization.
        3. email: The email address of the user. Verify correct format and special characters.
        4. address: The complete mailing address, including street, city, state, and ZIP code.
        5. message: The main content or message, preserving exact quotation marks and formatting.
        </goal>
        
        <extraction_process>
        1. Image Orientation Check:
           - First determine if the image needs mental rotation
           - Process text in its natural reading direction
        
        2. Detailed Number Sequence Extraction:
           - Extract each digit individually
           - Format: Write out as "[0] [0] [0]..." first
           - Verify: Double-check each digit independently
           - Validate: Ensure correct length and sequence
        
        3. Text Content Extraction:
           - Process line by line
           - Pay attention to formatting and special characters
           - Verify email format validity
           - Ensure address components are complete
           - Preserve exact quotation marks in messages
        </extraction_process>
        
        <response_format>
        Your response must be formatted exactly like this:
        
        <response>
        {
            "code": "123456789012",
            "user_full_name": "John Smith",
            "email": "example@domain.com",
            "address": "123 Main St, City, State 12345",
            "message": "The exact message with preserved formatting"
        }
        </response>
        </response_format>
        
        <remember>
        - Correct any typos or errors due to OCR.
        - Double-check each digit in the code sequence
        - Ensure proper capitalization and formatting
        - Verify email format validity
        - Maintain complete address components
        - Preserve exact quotation marks and punctuation
        - Use double quotes for JSON keys and string values
        - Escape any quotes within string values using backslashes
        - Avoid trailing commas or extra characters
        - Return only valid, properly formatted JSON
        - No newline characters in the output JSON
        - Response must be wrapped in <response> tags
        - The entire response should contain nothing but the wrapped JSON object
        </remember>
        
        Before submitting your response:
        1. Verify the code sequence digit by digit
        2. Confirm email format
        3. Check address completeness
        4. Validate message formatting
        5. Ensure JSON validity
        6. Confirm response is properly wrapped in <response> tags
        
        DO NOT include any explanations or additional text outside the <response> tags.`;
};

export const invokeBedrockModel = async <T>(
    bedrockClient: BedrockRuntimeClient,
    modelId: string,
    imageBase64: string,
    prompt: string,
    maxTokens = 2000,
    temperature = 0.1,
): Promise<T> => {
    const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: imageBase64,
                        },
                    },
                    {
                        type: 'text',
                        text: prompt,
                    },
                ],
            },
        ],
    };

    const command = new InvokeModelCommand({
        contentType: 'application/json',
        body: JSON.stringify(payload),
        modelId,
    });

    const response = await bedrockClient.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    console.log('jsonString', jsonString);
    const parsedResponse = JSON.parse(jsonString);
    const { text } = parsedResponse.content[0];
    console.log('text', text);
    return extractResponseObject(text) as T ;
};