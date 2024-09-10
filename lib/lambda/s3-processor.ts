import { getMailByDates } from './handler/mail-service';
import { Mail } from './entry/mail';


export const handler = async (event: any) => {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;
    const { startDate, endDate } = body;

    const mails = await getMailByDates(new Date(startDate).toISOString(), new Date(endDate).toISOString());

    const images = mails?.filter((mail: Mail) => !!mail.image_path).map((mail: Mail) => ({
        s3Key: mail.image_path,
    })) || [];
    return { images };
};
