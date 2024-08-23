import {
    DynamoDBClient,
    ProvisionedThroughputExceededException,
} from '@aws-sdk/client-dynamodb';
import { Mail } from '../entry/mail';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    UpdateCommandInput
} from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const AWS_REGION = process.env.REGION;
const TABLE_NAME = process.env.MAIL_METADATA_TABLE_NAME;

if (!AWS_REGION || !TABLE_NAME) {
    throw new Error('Required environment variables are missing.');
}

const dynamoDbClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

const PARTITION_KEY_NAME = 'ScrapPostCard';

// Helper function to implement retry logic
async function retryOperation(operation: () => Promise<void>, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await operation();
            return; // Exit on success
        } catch (error) {
            if (error instanceof ProvisionedThroughputExceededException) {
                // Log specific message for throughput issues
                console.warn(`ProvisionedThroughputExceededException: ${error}`);
            } else {
                // Log general error message
                console.warn(`Retrying operation due to error: ${error}`);
            }

            if (i === retries - 1) {
                throw error; // Rethrow after last retry
            }

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

// Helper function to create common attribute values
const getAttributeValues = (mail: Mail) => ({
    ':message': mail.message,
    ':image_path': mail.image_path,
    ':creationDate': mail.creationDate,
    ':assignedDate': mail.assignedDate,
    ':lastActionDate': mail.lastActionDate,
});

// Function to save mail to DynamoDB
export async function saveMailToDynamoDB(mail: Mail) {
    await retryOperation(async () => {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                [PARTITION_KEY_NAME]: PARTITION_KEY_NAME,
                ...mail,
            },
        };
        const command = new PutCommand(params);
        await docClient.send(command);
    });
}

// Function to update mail in DynamoDB
export async function updateMailInDynamoDB(mail: Mail) {
    await retryOperation(async () => {
        const params: UpdateCommandInput = {
            TableName: TABLE_NAME,
            Key: {
                [PARTITION_KEY_NAME]: PARTITION_KEY_NAME,
                'any_mail_id': mail.any_mail_id
            },
            UpdateExpression: `
                set #message = :message,
                    #image_path = :image_path,
                    #creationDate = :creationDate,
                    #assignedDate = :assignedDate,
                    #lastActionDate = :lastActionDate
            `,
            ExpressionAttributeValues: getAttributeValues(mail),
            ExpressionAttributeNames: {
                '#message': 'message',
                '#image_path': 'image_path',
                '#creationDate': 'creationDate',
                '#assignedDate': 'assignedDate',
                '#lastActionDate': 'lastActionDate',
            },
            ReturnValues: 'UPDATED_NEW',
        };

        const command = new UpdateCommand(params);
        await docClient.send(command);
    });
}

// Function to get mail from DynamoDB
export async function getMailFromDynamoDB(malId: number) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            [PARTITION_KEY_NAME]: PARTITION_KEY_NAME,
            'any_mail_id': malId
        },
    };

    try {
        const command = new GetCommand(params);
        const result = await docClient.send(command);
        return result.Item as Mail | null;
    } catch (error) {
        console.error('Error fetching mail from DynamoDB:', error);
        return null;
    }
}
