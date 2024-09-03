import { S3UrlParts } from '../entry/textract';

export function extractCardValue(s3Url: string): string {
    const regex = /card_(\d+)\.\w+$/;
    const match = s3Url.match(regex);

    if (match && match[1]) {
        return match[1];
    }

    return '';
}

export function levenshteinDistance(a: string, b: string): number {
    const alen = a.length;
    const blen = b.length;
    let row: number[] = Array.from({ length: blen + 1 }, (_, i) => i);
    let current: number[] = Array(blen + 1);

    for (let i = 0; i < alen; i++) {
        current[0] = i + 1;
        for (let j = 0; j < blen; j++) {
            const tmp = a[i] === b[j] ? row[j] : Math.min(row[j], row[j + 1], current[j]) + 1;
            current[j + 1] = tmp;
        }
        [row, current] = [current, row]; // Swap references
    }
    return row[blen];
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

// Function to fix an incomplete JSON string
export function fixIncompleteJSON(jsonString:string): string {
    jsonString = jsonString.trim();

    // Fix missing quotes
    const openQuotes = (jsonString.match(/"/g) || []).length;
    if (openQuotes % 2 !== 0) {
        jsonString += '"';
    }

    // Fix missing closing braces
    const openBraces = (jsonString.match(/{/g) || []).length;
    const closeBraces = (jsonString.match(/}/g) || []).length;
    const missingBraces = openBraces - closeBraces;
    for (let i = 0; i < missingBraces; i++) {
        jsonString += '}';
    }

    // Fix missing closing brackets
    const openBrackets = (jsonString.match(/\[/g) || []).length;
    const closeBrackets = (jsonString.match(/]/g) || []).length;
    const missingBrackets = openBrackets - closeBrackets;
    for (let i = 0; i < missingBrackets; i++) {
        jsonString += ']';
    }

    return JSON.stringify(jsonString);
}

