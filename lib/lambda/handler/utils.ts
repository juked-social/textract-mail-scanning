import { S3UrlParts } from '../entry/textract';

export function extractCardValue(s3Url: string): string {
    const regex = /card_(\d+)\.\w+$/;
    const match = s3Url.match(regex);

    if (match && match[1]) {
        return match[1];
    }

    return '';
}

export function splitS3Url(s3Url: string): S3UrlParts {
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
