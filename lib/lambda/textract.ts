import { Textract } from 'aws-sdk';
import { DynamoDB } from 'aws-sdk';
// import { getMailFromDynamoDB, saveMailToDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { AnytimeMailBox, Mail } from './entry/mail';
import { AnalyzeDocumentRequest } from 'aws-sdk/clients/textract';
import { getMailFromDynamoDB, updateMailInDynamoDB } from './handler/mail-service';

const textract = new Textract();
const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.MAIL_METADATA_TABLE_NAME;

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

    // const textractData = await textract.analyzeDocument(textractParams).promise();
    const textractData = '';

    // Check if mail already exists
    const mail = await getMailFromDynamoDB(image.any_mail_id);

    if (mail) {
        const mailData = { ...mail, message: '' };
        // Update existing mail
        await updateMailInDynamoDB(mailData);
    }

    return { id: image.id, textractData };
};
