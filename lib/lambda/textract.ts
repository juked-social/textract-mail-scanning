import { Textract } from 'aws-sdk';
import { DynamoDB } from 'aws-sdk';
// import { getMailFromDynamoDB, saveMailToDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { AnytimeMailBox, Mail } from './entry/mail';
import { AnalyzeDocumentRequest } from 'aws-sdk/clients/textract';

const textract = new Textract();
const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.MAIL_METADATA_TABLE_NAME;

function createMailObject(mail: AnytimeMailBox): Mail {
    return {
        any_mail_id: mail.malId,
        message: mail.message,
        image_path: mail.imageUrl,
        creationDate: mail.creationDate,
        assignedDate: mail.assignedDate,
        lastActionDate: mail.lastActionDate,
    };
}


export const handler = async (event: any) => {
    const { image } = event;
    const s3Bucket = process.env.IMAGE_BUCKET_NAME;
    const textractParams: AnalyzeDocumentRequest = {
        FeatureTypes: [],
        Document: {
            S3Object: {
                Bucket: s3Bucket!,
                Name: image.s3Key,
            },
        }
    };

    const textractData = await textract.analyzeDocument(textractParams).promise();

    // // Check if mail already exists
    // const existingMail = await getMailFromDynamoDB(mail.malId);
    //
    // if (existingMail) {
    //     // Update existing mail
    //     await updateMailInDynamoDB(mailData);
    // } else {
    //     // Save new mail
    //     await saveMailToDynamoDB(mailData);
    // }
    // Save extracted data to DynamoDB
    await dynamoDb.put({
        TableName: tableName!,
        Item: {
            ScrapPostCard: image.id,
            TextractData: textractData,
        },
    }).promise();

    return { id: image.id, textractData };
};
