import { DynamoDB } from 'aws-sdk';

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.MAIL_METADATA_TABLE_NAME;

export const handler = async (event: any) => {
    // Mark process as complete in DynamoDB or perform any completion tasks
    console.log('All Textract jobs are complete.');
    return { status: 'Complete' };
};
