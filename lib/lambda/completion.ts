import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const { TEMP_TABLE_NAME, REGION, TEMP_BUCKET_NAME, S3_TEMP_OUTPUT_PREFIX } = process.env;

const dynamoDbClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    // delete everything from temp table
    try {
        // Scan the table
        const scanCommand = new ScanCommand({
            TableName: TEMP_TABLE_NAME
        });

        const data = await dynamoDbClient.send(scanCommand);

        // Check if items exist
        if (data.Items && data.Items.length > 0) {
            // Delete each item
            for (const item of data.Items) {
                const deleteCommand = new DeleteItemCommand({
                    TableName: TEMP_TABLE_NAME,
                    Key: {
                        ID: item.ID
                    }
                });

                await dynamoDbClient.send(deleteCommand);
            }
        }

        console.log('All items have been deleted.');
    } catch (error) {
        console.error('Error deleting items: ', error);
    }


    // delete everything from temp bucket folder
    try {
        // List objects in the specified folder
        const listObjectsCommand = new ListObjectsV2Command({
            Bucket: TEMP_BUCKET_NAME,
            Prefix: S3_TEMP_OUTPUT_PREFIX
        });

        const listResponse = await s3Client.send(listObjectsCommand);

        if (listResponse.Contents && listResponse.Contents.length > 0) {
            // Prepare delete requests
            const deleteParams = {
                Bucket: TEMP_BUCKET_NAME,
                Delete: {
                    Objects: listResponse.Contents.map(item => ({ Key: item.Key! }))
                }
            };

            // Delete objects
            const deleteCommand = new DeleteObjectsCommand(deleteParams);
            await s3Client.send(deleteCommand);

            console.log(`All objects in folder ${S3_TEMP_OUTPUT_PREFIX} have been deleted.`);
        } else {
            console.log(`No objects found in folder ${S3_TEMP_OUTPUT_PREFIX}.`);
        }
    } catch (error) {
        console.log('Error deleting objects: ', error);
    }

    return { status: 'Complete' };
};
