import { getAllMails } from './handler/mail-service';
import { getSecret } from './handler/secret-manager';
import { Mail } from './entry/mail';

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

const postChunk = async (chunk: Mail[], apiToken: string): Promise<any[]> => {
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
            return []; // Return an empty array in case of error
        }

        // Parse and return the response data
        const responseData = await response.json();
        const data = typeof responseData === 'string' ? JSON.parse(responseData || '{}') : responseData;

        if (!data || !data.result || !data.result.shred) {
            return [];
        }

        return data.result.shred || [];
    } catch (error) {
        console.error('Error in postChunk:', error);
        return [];
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
            results.push(...responseData); // Use spread operator to flatten the results
        }

        console.log(results);

        // Return idsArray directly as the next state expects it
        if (!results || results.length === 0) {
            return [];
        }

        return results?.map((id: string) => ({ id }));
    } catch (error) {
        console.error('Error:', error);

        throw new Error('Failed to process mail data');
    }
};
