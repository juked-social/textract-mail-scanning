import { FeatureType } from '@aws-sdk/client-textract';

export interface TextractInterfaceQuery {
    text: string;
    alies: string;
}

export interface TextractInterface {
    Payload: TextractInterfacePayload
    InputParameters: InputParameters
}

export interface TextractInterfacePayload {
    manifest: TextractManifest
    mime: string
    classification: any
    numberOfPages: number
    fileSize: number
    Payload: Payload2
    textract_result: TextractResult
}

export interface TextractManifest {
    s3Path: string
}

export interface Payload2 {
    ExecutedVersion: string
    Payload: string[]
    SdkHttpMetadata: string[]
    SdkResponseMetadata: string[]
    StatusCode: number
}

export interface TextractResult {
    TextractTempOutputJsonPath: string
}

export interface InputParameters {
    body: Body
}

export interface Body {
    startDate: string
    endDate: string
    anytimeAspNetSessionId: string
}


export interface S3UrlParts {
    bucket: string;
    key: string;
}
