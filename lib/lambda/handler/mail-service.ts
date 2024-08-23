import {
    DynamoDBClient,
    ReturnValue,
} from '@aws-sdk/client-dynamodb';
import { AnytimeMailBox } from '../entry/mail';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);
const TABLE_NAME = process.env.MAIL_METADATA_TABLE_NAME || '';

// Function to save mail to DynamoDB
export async function saveMailToDynamoDB(mail: AnytimeMailBox) {
    const params = {
        TableName: TABLE_NAME,
        Item: {
            AnytimeMailBox: { S: 'AnytimeMailBox' },
            ...mail,
        },
    };

    try {
        const command = new PutCommand(params);
        await docClient.send(command);
    } catch (error) {
        console.error('Error saving mail to DynamoDB:', error);
    }
}

// Function to update mail in DynamoDB
export async function updateMailInDynamoDB(mail: AnytimeMailBox) {
    const params: UpdateCommandInput = {
        TableName: TABLE_NAME,
        Key: {
            AnytimeMailBox: 'AnytimeMailBox',
            malId: mail.malId,
        },
        UpdateExpression: `
        set message = :message,
            messageColor = :messageColor,
            imageUrl = :imageUrl,
            imageVersion = :imageVersion,
            date = :date,
            timeZoneText = :timeZoneText,
            creationDate = :creationDate,
            creationDate_utc = :creationDate_utc,
            assignedDate = :assignedDate,
            assignedDate_utc = :assignedDate_utc,
            lastActionDate = :lastActionDate,
            lastActionDate_utc = :lastActionDate_utc,
            status = :status,
            currentStatusId = :currentStatusId,
            currentStatus = :currentStatus,
            pastStatus = :pastStatus,
            isNeedLoadDetail = :isNeedLoadDetail,
            senderDetails = :senderDetails,
            read = :read,
            title = :title,
            refKey = :refKey,
            pages = :pages,
            actions = :actions,
            folder = :folder,
            version = :version,
            timestamp = :timestamp,
            metadata = :metadata
    `,
        ExpressionAttributeValues: {
            ':message': mail.message,
            ':messageColor': mail.messageColor,
            ':imageUrl': mail.imageUrl,
            ':imageVersion': mail.imageVersion,
            ':date': mail.date.toISOString(),
            ':timeZoneText': mail.timeZoneText,
            ':creationDate': mail.creationDate,
            ':creationDate_utc': mail.creationDate_utc.toISOString(),
            ':assignedDate': mail.assignedDate,
            ':assignedDate_utc': mail.assignedDate_utc.toISOString(),
            ':lastActionDate': mail.lastActionDate,
            ':lastActionDate_utc': mail.lastActionDate_utc.toISOString(),
            ':status': mail.status,
            ':currentStatusId': mail.currentStatusId,
            ':currentStatus': mail.currentStatus,
            ':pastStatus': mail.pastStatus,
            ':isNeedLoadDetail': mail.isNeedLoadDetail,
            ':senderDetails': mail.senderDetails,
            ':read': mail.read,
            ':title': mail.title,
            ':refKey': mail.refKey,
            ':pages': mail.pages,
            ':actions': mail.actions,
            ':folder': mail.folder,
            ':version': mail.version,
            ':timestamp': mail.timestamp,
            ':metadata': mail.metadata,
        },
        ReturnValues: 'UPDATED_NEW' as ReturnValue,
    };

    try {
        const command = new UpdateCommand(params);
        await docClient.send(command);
    } catch (error) {
        console.error('Error updating mail in DynamoDB:', error);
    }
}

// Function to get mail from DynamoDB
export async function getMailFromDynamoDB(malId: number) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            AnytimeMailBox: 'AnytimeMailBox',
            malId: malId,
        },
    };

    try {
        const command = new GetCommand(params);
        const result = await docClient.send(command);
        return result.Item as AnytimeMailBox | null;
    } catch (error) {
        console.error('Error fetching mail from DynamoDB:', error);
        return null;
    }
}