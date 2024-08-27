import { S3 } from 'aws-sdk';

const s3 = new S3();
const bucketName = process.env.IMAGE_BUCKET_NAME;

export const handler = async (event: any) => {
    const images = event.images.map((id: string) => ({
        id,
        s3Key: `images/${id}.jpg`,
    }));
    return { images };
};
