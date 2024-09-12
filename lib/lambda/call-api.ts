import { getAllMails } from './handler/mail-service';
import { getSecret } from './handler/secret-manager';

const SECRET_ARN = process.env.SECRET_ARN || '';
const API_URL = process.env.API_URL || '';

export const handler = async (event: any) => {
    try {
        const secret = await getSecret(SECRET_ARN);
        const apiToken = secret?.apiToken || '';

        const postData = await getAllMails();

        const transformedData = postData.map(mail => ({
            ...mail,
            assigned_date: mail.assignedDate
        }));

        // Make POST request with postData
        const response = await fetch(`${API_URL}/aws/post-cards`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(transformedData)
        });

        if (!response.ok) {
            const errorText = await response.text(); // Read error response body
            console.log(`HTTP error! status: ${response.status}, text: ${errorText}`);
            return [];
        }

        // Parse and log the response data
        const responseData = await response.json();

        console.log(responseData);
        const data = typeof responseData === 'string' ? JSON.parse(responseData || '{}') : responseData;

        if(!data || !data?.result?.shred){
            return [];
        }

        // Return idsArray directly as the next state expects it
        return data?.result?.shred?.map((id: string) => ({ id }));
    } catch (error) {
        console.error('Error:', error);

        return {
            message: 'Failed to post data',
            error: error
        };
    }
};
