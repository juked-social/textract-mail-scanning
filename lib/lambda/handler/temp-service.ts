import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const { TEMP_TABLE_NAME, REGION, TEMP_BUCKET_NAME, S3_TEMP_OUTPUT_PREFIX, TEMP_ROTATE_TABLE_NAME } = process.env;
const dynamoDbClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

export const deleteTempTableItems = async () => {
    // delete everything from temp table
    try {
        // Scan the table
        const scanCommand = new ScanCommand({
            TableName: TEMP_TABLE_NAME
        });

        const data = await dynamoDbClient.send(scanCommand);

        // Check if items exist
        // Create an array of promises for deletion
        const deletePromises = data.Items?.map(item => {
            if (item?.ID) {
                const deleteCommand = new DeleteItemCommand({
                    TableName: TEMP_TABLE_NAME,
                    Key: {
                        ID: { S: item.ID } // Correctly format 'ID' based on DynamoDB's expected attribute type
                    }
                });

                return dynamoDbClient.send(deleteCommand);
            } else {
                console.warn('Item does not have an ID attribute:', item);
                return Promise.resolve(); // Resolve with no action if ID is missing
            }
        }) || [];

        // Wait for all deletions to complete
        await Promise.all(deletePromises);

        console.log('All items have been deleted.');
    } catch (error) {
        console.error('Error deleting items: ', error);
        throw error;
    }
};


export const deleteTempRotateTableItems = async () => {
    // delete everything from temp table
    try {
        // Scan the table
        const scanCommand = new ScanCommand({
            TableName: TEMP_ROTATE_TABLE_NAME
        });

        const data = await dynamoDbClient.send(scanCommand);

        // Check if items exist
        // Create an array of promises for deletion
        const deletePromises = data.Items?.map(item => {
            if (item?.ID) {
                const deleteCommand = new DeleteItemCommand({
                    TableName: TEMP_ROTATE_TABLE_NAME,
                    Key: {
                        ID: { S: item.ID } // Correctly format 'ID' based on DynamoDB's expected attribute type
                    }
                });

                return dynamoDbClient.send(deleteCommand);
            } else {
                console.warn('Item does not have an ID attribute:', item);
                return Promise.resolve(); // Resolve with no action if ID is missing
            }
        }) || [];

        // Wait for all deletions to complete
        await Promise.all(deletePromises);

        console.log('All items have been deleted.');
    } catch (error) {
        console.error('Error deleting items: ', error);
        throw error;
    }
};

export const deleteTempBucketItems = async () => {

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
        throw error;
    }
};


export async function cleanTextFromS3(bucket: string, folderPrefix: string): Promise<void> {
    try {
        console.log(`Clearing folder from S3: bucket=${bucket}, prefix=${folderPrefix}`);

        // Step 1: List all objects in the folder (objects with the specified prefix)
        const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: folderPrefix
        });
        const listResult = await s3Client.send(listCommand);

        // Check if the folder has any objects
        if (!listResult.Contents || listResult.Contents.length === 0) {
            console.log(`No objects found with prefix ${folderPrefix}`);
            return;
        }

        // Step 2: Prepare keys for deletion
        const objectsToDelete = listResult.Contents.map(item => ({ Key: item.Key! }));

        // Step 3: Delete the objects
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: objectsToDelete,
            },
        });
        await s3Client.send(deleteCommand);
        console.log(`All objects in folder with prefix ${folderPrefix} have been deleted.`);
    } catch (error) {
        console.log(`Error deleting folder from S3: bucket=${bucket}, prefix=${folderPrefix}, error=${error}`);
        throw error;
    }
}
