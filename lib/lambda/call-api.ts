import { getMailFromDynamoDB } from './handler/mail-service';

const { API_TOKEN } = process.env;
const apiUrl = 'https://api.goldsink.com/aws/post-cards';

export const handler = async (event: any) => {
    try {
        const idsArray = typeof event.Payload === 'string' ? JSON.parse(event.Payload || '[]') : event.Payload;

        // Fetch mail data for each id in idsArray
        const postData = await Promise.all(
            idsArray
                .filter((item: { id: string }) => !!item?.id) // Filter out items without an id
                .map(async (item: { id: string }) => {
                    const mail = await getMailFromDynamoDB(Number(item.id));
                    return {
                        ...mail,
                        assigned_date: mail?.assignedDate
                    };
                })
        );

        console.log('Prepared postData:', postData);

        // Make POST request with postData
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parse and log the response data
        const responseData = await response.json();
        console.log('Response:', responseData);

        return JSON.stringify(idsArray);
    } catch (error) {
        console.error('Error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to post data' })
        };
    }
};
