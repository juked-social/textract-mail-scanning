import {S3Client} from '@aws-sdk/client-s3';

export const handler = async (event: any) => {
    console.log(event);

    const s3Client = new S3Client({ region: process.env.REGION });
    const bucketName = process.env.IMAGE_BUCKET_NAME;


    const images = event?.images?.map((id: string) => ({
        id,
        s3Key: `images/${id}.jpg`,
    })) || [];
    return { images };
};
