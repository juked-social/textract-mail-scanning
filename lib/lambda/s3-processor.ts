import { getMailByDates } from './handler/mail-service';
import { Mail } from './entry/mail';


export const handler = async (event: any) => {
    try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;
        const { startDate, endDate } = body;

        // Convert startDate and endDate to ISO format
        const startISO = new Date(startDate).toISOString();
        const endISO = new Date(endDate).toISOString();

        const mails = await getMailByDates(startISO, endISO);

        const images = mails?.filter((mail: Mail) => !!mail.image_path).map((mail: Mail) => ({
            s3Key: mail.image_path,
        })) || [];

        return { images };
    }catch (e){
        console.log('Error getting mails', e);

        throw new Error('Failed to process mail data');
    }
};
