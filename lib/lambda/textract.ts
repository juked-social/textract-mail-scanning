import { S3Client } from '@aws-sdk/client-s3';
import {
    AnalyzeDocumentCommand, AnalyzeDocumentCommandInput,
    QueriesConfig,
    TextractClient,
    FeatureType, AnalyzeDocumentCommandOutput
} from '@aws-sdk/client-textract';
import { S3UrlParts, TextractInterface, TextractInterfaceQuery } from './entry/textract';

const textractClient = new TextractClient({ region: process.env.REGION });
const tableName = process.env.MAIL_METADATA_TABLE_NAME;
const s3Client = new S3Client({ region: process.env.REGION });

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

function createQueriesConfig(queriesConfigItems: TextractInterfaceQuery[]): QueriesConfig {
    return {
        Queries: queriesConfigItems?.map((query) => ({ Text: query.text, Alias: query.alies })) || []
    };
}

function parseTextractResponse(
    response: AnalyzeDocumentCommandOutput,
    queriesConfigItems: TextractInterfaceQuery[]
) {
    if(!response?.Blocks) {
        return null;
    }

    const queries: { text: string, resultId: string }[] = [];
    const results: {[key:string]: { text: string, confidence: number }} = {};
    const configs: { [key: string]: string } = {};
    queriesConfigItems.map(q => configs[q.text] = q.alies);

    console.log(queriesConfigItems);

    // Create a map for QUERY blocks
    response.Blocks.forEach(block => {
        if (block.BlockType === 'QUERY') {
            queries.push({
                text: block.Query?.Text || '',
                resultId: block.Relationships?.find(r => r.Type === 'ANSWER')?.Ids?.[0] || ''
            });
        }
    });

    // Create a map for QUERY_RESULT blocks
    response.Blocks.forEach(block => {
        if (block.BlockType === 'QUERY_RESULT' && block.Id) {
            results[block.Id] = {
                text: block.Text || '',
                confidence: block.Confidence || 0
            };
        }
    });

    // Combine QUERY and QUERY_RESULT
    const combinedResults: {[key:string]: { text: string, confidence: number }} = {};
    queries.map(query => {
        const result = results[query.resultId];

        if (result && query?.text) {
            combinedResults[query.text] = {
                text: result.text,
                confidence: result.confidence
            };
        }
    });

    return combinedResults;
}

// Function to analyze document with queries
async function analyzeDocumentWithQueries(
    bucket: string,
    key: string,
    featureTypes: FeatureType[],
    queriesConfigItems: TextractInterfaceQuery[]
) {
    const documentLocation = { S3Object: { Bucket: bucket, Name: key } };

    const input: AnalyzeDocumentCommandInput = {
        Document: documentLocation,
        FeatureTypes: featureTypes,
        QueriesConfig: createQueriesConfig(queriesConfigItems),
    };

    const command = new AnalyzeDocumentCommand(input);
    const result = await textractClient.send(command);

    console.log(result);

    return parseTextractResponse(result, queriesConfigItems);
}

export const handler = async (event: TextractInterface) => {
    // Get the textract output from s3
    //       "s3Path": "s3://mailprocessingstack-mailimagebucket2feb9a43-x1ra2lv4z2yf/images/2024-08-27/card_18464977.jpg"
    const originalFilePath = event.manifest.s3Path;
    const anyMailId = extractCardValue(originalFilePath);

    // s3://mailprocessingstack-mailimagebucket2feb9a43-x1ra2lv4z2yf/mail-textract-temp-output/449172b95ec868ef103e76ea20c59b15bbac2612fd1d131f8e7613e11607328d

    const { bucket, key } = splitS3Url(originalFilePath);

    // Analyze document with queries
    const analysisResult = await analyzeDocumentWithQueries(bucket,
        key,
        event.Payload.Payload.manifest.textract_features,
        event.Payload.Payload.manifest.queries_config);

    console.info('Textract analysis result:', JSON.stringify(analysisResult));

    // const textractOutput = splitS3Url(event.textract_result.TextractTempOutputJsonPath);
    // const textractOutputBucket = textractOutput.bucket;
    // const textractOutputKey = textractOutput.key;
    //
    // const s3Command = new GetObjectCommand({
    //     Bucket: textractOutputBucket,
    //     Key: `${textractOutputKey}/1`
    // });
    //
    // const textractResponse = await s3Client.send(s3Command);
    //
    // console.log(textractResponse);

    // We will need to parse the textract output and extract the required information

    // Update the mail record with textract output
    // if (mail) {
    //     const mailData = { ...mail, message: '' };
    //     // Update existing mail
    //     await updateMailInDynamoDB(mailData);
    // }

    return { id: anyMailId };
};
