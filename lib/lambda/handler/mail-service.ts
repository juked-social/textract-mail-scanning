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
    UpdateCommandInput,
    ScanCommand,
    DeleteCommand,
    ScanCommandOutput,
    ScanCommandInput,
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
    ':code': mail.code || '',
    ':user_full_name': mail.user_full_name || '',
    ':email': mail.email || '',
    ':address': mail.address || '',
    ':is_valid': mail.is_valid || false,
    ':reason': mail.reason || '',
    ':is_shredded': mail.is_shredded || false
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
                    #lastActionDate = :lastActionDate,
                    #code = :code,
                    #user_full_name = :user_full_name,
                    #email = :email,
                    #address = :address,
                    #is_valid = :is_valid,
                    #reason = :reason,
                    #is_shredded = :is_shredded
            `,
            ExpressionAttributeValues: getAttributeValues(mail),
            ExpressionAttributeNames: {
                '#message': 'message',
                '#image_path': 'image_path',
                '#creationDate': 'creationDate',
                '#assignedDate': 'assignedDate',
                '#lastActionDate': 'lastActionDate',
                '#code': 'code',
                '#user_full_name': 'user_full_name',
                '#email': 'email',
                '#address': 'address',
                '#is_valid': 'is_valid',
                '#reason': 'reason',
                '#is_shredded': 'is_shredded'
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
        throw new Error('Error querying items from DynamoDB: ' + error);
    }
}

// Function to get mail by date range
export async function getMailByDates(startDate: string, endDate: string): Promise<Mail[]> {
    console.log(startDate, endDate);
    let allItems: Mail[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
        const params: ScanCommandInput = {
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastEvaluatedKey,
            FilterExpression: 'is_shredded=:false AND assignedDate BETWEEN :startDate AND :endDate',
            ExpressionAttributeValues: {
                ':startDate': startDate,
                ':endDate': endDate,
                ':false': false,
            },
        };

        try {
            const command = new ScanCommand(params);
            const result: ScanCommandOutput = await docClient.send(command);
            const items = result.Items as Mail[] || [];
            allItems = allItems.concat(items);
            lastEvaluatedKey = result.LastEvaluatedKey;
        } catch (error) {
            console.error('Error scanning DynamoDB table:', error);
            break;
        }
    } while (lastEvaluatedKey);

    return allItems;
}


// Function to delete mail from DynamoDB
export async function deleteMailFromDynamoDB(malId: number) {
    await retryOperation(async () => {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                [PARTITION_KEY_NAME]: PARTITION_KEY_NAME,
                'any_mail_id': malId
            },
        };

        const command = new DeleteCommand(params);
        await docClient.send(command);
    });
}

export async function getAllMails(): Promise<Mail[]> {
    let allItems: Mail[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
        const params: ScanCommandInput = {
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastEvaluatedKey,
            FilterExpression: 'is_valid = :true AND is_shredded=:false',
            ExpressionAttributeValues: {
                ':true': true,
                ':false': false,
            },
        };

        try {
            const command = new ScanCommand(params);
            const result: ScanCommandOutput = await docClient.send(command);
            const items = result.Items as Mail[] || [];
            allItems = allItems.concat(items);
            lastEvaluatedKey = result.LastEvaluatedKey;
        } catch (error) {
            console.error('Error scanning DynamoDB table:', error);
            break;
        }
    } while (lastEvaluatedKey);

    return allItems;
}