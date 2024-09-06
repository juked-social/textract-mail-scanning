
interface EventBody {
   id: string
}

interface LambdaEvent {
    Payload: string | EventBody;
}

export const handler = async (event: LambdaEvent) => {
    const { id, s3Path } = typeof event.Payload === 'string' ? JSON.parse(event.Payload || '{}') : event.Payload;

    return {
        id,
        s3Path
    };
};