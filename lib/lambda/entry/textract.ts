import { FeatureType } from '@aws-sdk/client-textract';

export interface TextractInterfaceQuery {
    text: string;
    alies: string;
}
export interface TextractInterface {
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
                queries_config: TextractInterfaceQuery[];
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

export interface S3UrlParts {
    bucket: string;
    key: string;
}