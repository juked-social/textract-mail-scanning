import { getMailByDates } from './handler/mail-service';
import { Mail } from './entry/mail';
import { publishError } from './helpers';
import { splitS3Url } from './handler/utils';


export const handler = async (event: any) => {
    try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;
        const { startDate, endDate } = body;

        if (!startDate || !endDate) {
            throw new Error('Missing required date parameters');
        }

        // Convert startDate and endDate to ISO format
        const startISO = new Date(startDate).toISOString();
        const endISO = new Date(endDate).toISOString();

        const mails = await getMailByDates(startISO, endISO);

        const images = mails?.filter((mail: Mail) => !!mail.image_path).map((mail: Mail) => ({
            s3Key: splitS3Url(mail.image_path)?.key,
        })) || [];

        return { images };
    }catch (error){
        console.error('Error processing mail data:', error);
        await publishError('S3Processor', error);
        throw new Error('Failed to process mail data');
    }
};
