import { getAllMails } from './handler/mail-service';
import { getSecret } from './handler/secret-manager';
import { Mail } from './entry/mail';
import { publishError } from './helpers';

const SECRET_ARN = process.env.SECRET_ARN || '';
const API_URL = process.env.API_URL || '';
const CHUNK_SIZE = 1000;

const splitIntoChunks = (array: Mail[], size: number): Mail[][] => {
    const result: Mail[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

const postChunk = async (chunk: Mail[], apiToken: string) => {
    try {
        const response = await fetch(`${API_URL}/aws/post-cards`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(chunk)
        });

        if (!response.ok) {
            const errorText = await response.text(); // Read error response body
            console.log(`HTTP error! status: ${response.status}, text: ${errorText}`);
            return {};
        }

        // Parse and return the response data
        return await response.json();
    } catch (error) {
        console.error('Error in postChunk:', error);
        return {};
    }
};

export const handler = async (event: any): Promise<any[]> => {
    try {
        const secret = await getSecret(SECRET_ARN);
        const apiToken = secret?.apiToken || '';

        const postData = await getAllMails();

        const transformedData = postData.map(mail => ({
            ...mail,
            assigned_date: mail.assignedDate
        }));

        // Split the data into chunks
        const chunks = splitIntoChunks(transformedData, CHUNK_SIZE);

        // Process each chunk and gather results
        const results = [];
        for (const chunk of chunks) {
            const responseData = await postChunk(chunk, apiToken);
            const data = typeof responseData === 'string' ? JSON.parse(responseData || '{}') : responseData;
            if (data && data.message === 'Success') {
                results.push(...chunk);
            }
        }

        // Return idsArray directly as the next state expects it
        if (!results || results.length === 0) {
            throw new Error('There are no emails in Anytimemailbox for the specified search period.');
        }

        return results?.map((mail) => ({ id: mail.any_mail_id }));
    } catch (error) {
        console.error('Error:', error);
        await publishError('ApiCaller', error);
        throw new Error('Failed to process mail data');
    }
};
