// import { getMailFromDynamoDB, saveMailToDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
// import { AnytimeMailBox, Mail } from './entry/mail';
import { AnalyzeDocumentRequest, FeatureType } from 'aws-sdk/clients/textract';
import { getMailFromDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';

const textractClient = new TextractClient({ region: process.env.REGION });
const tableName = process.env.MAIL_METADATA_TABLE_NAME;
const s3Client = new S3Client({ region: process.env.REGION });

interface TextractInterface {
    manifest: {
        s3Path: string;
    },
    mime: string;
    classification: string;
    numberOfPages: number;
    fileSize: number;
    Payload: {
        Payload: {
            manifest: {
                s3_path: string;
                textract_features: FeatureType[];
                queries_config: AnalyzeDocumentRequest[];
                classification: string;
                numberOfPages: number;
                fileSize: number;
            },
            mime: string;
        },
        ExecutedVersion: string;

    },
    textract_result: {
        TextractTempOutputJsonPath: string;
    },
    StatusCode: number;
}

interface S3UrlParts {
    bucket: string;
    key: string;
}

function splitS3Url(s3Url: string): S3UrlParts {
    // Ensure the URL starts with the expected S3 prefix
    if (!s3Url.startsWith('s3://')) {
        throw new Error('Invalid S3 URL format.');
    }

    // Remove the 's3://' prefix
    const urlWithoutPrefix = s3Url.slice(5);

    // Split the remaining part into bucket and key parts
    const [bucket, ...keyParts] = urlWithoutPrefix.split('/');

    // Ensure both bucket and key are extracted correctly
    if (!bucket || keyParts.length === 0) {
        throw new Error('Invalid S3 URL structure.');
    }

    const key = keyParts.join('/');

    return {
        bucket,
        key,
    };
}

function extractCardValue(s3Url: string): string {
    const regex = /card_(\d+)\.\w+$/;
    const match = s3Url.match(regex);

    if (match && match[1]) {
        return match[1];
    }

    return '';
}


export const handler = async (event: TextractInterface) => {
    const mail = {};

    // Get the textract output from s3
    //       "s3Path": "s3://mailprocessingstack-mailimagebucket2feb9a43-x1ra2lv4z2yf/images/2024-08-27/card_18464977.jpg"
    const originalFilePath = event.manifest.s3Path;
    const anyMailId = extractCardValue(originalFilePath);

    // s3://mailprocessingstack-mailimagebucket2feb9a43-x1ra2lv4z2yf/mail-textract-temp-output/449172b95ec868ef103e76ea20c59b15bbac2612fd1d131f8e7613e11607328d
    const textractOutput = splitS3Url(event.textract_result.TextractTempOutputJsonPath);
    const textractOutputBucket = textractOutput.bucket;
    const textractOutputKey = textractOutput.key;

    const s3Command = new GetObjectCommand({
        Bucket: textractOutputBucket,
        Key: textractOutputKey
    });

    const textractResponse = await s3Client.send(s3Command);

    console.log(textractResponse, 'textractResponse');
    // We will need to parse the textract output and extract the required information

    // Update the mail record with textract output
    // if (mail) {
    //     const mailData = { ...mail, message: '' };
    //     // Update existing mail
    //     await updateMailInDynamoDB(mailData);
    // }

    return { id: anyMailId };
};
