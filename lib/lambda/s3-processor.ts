import { S3Client } from '@aws-sdk/client-s3';
import { getMailByDates } from './handler/mail-service';
import { Mail } from './entry/mail';

const s3Client = new S3Client({ region: process.env.REGION });
const bucketName = process.env.IMAGE_BUCKET_NAME;

export const handler = async (event: any) => {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;
    const { startDate, endDate } = body;

    const mails = await getMailByDates(new Date(startDate).toISOString(), new Date(endDate).toISOString());

    console.log('Mails', mails?.length);

    const images = mails?.map((mail: Mail) => ({
        any_mail_id: mail.any_mail_id,
        s3Key: mail.image_path,
    })) || [];
    return { images };
};
