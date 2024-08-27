export const handler = async (event: any) => {
    console.log(event);

    const images = event?.images?.map((id: string) => ({
        id,
        s3Key: `images/${id}.jpg`,
    })) || [];
    return { images };
};
