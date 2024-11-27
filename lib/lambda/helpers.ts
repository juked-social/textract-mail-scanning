import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const TOPIC_ARN = process.env.TOPIC_ARN || '';
const REGION = process.env.REGION || '';
const snsClient = new SNSClient({ region: REGION });

export const publishError = async (serviceName: string, error: Error | unknown) => {
    const isCustomError = error instanceof Error;
    const errorMessage = isCustomError ? error.message : 'Unknown error';
    const description = isCustomError
        ? `:x: ${errorMessage}`
        : `:x: ${errorMessage}
        Full error object: ${error}`;

    const slackFormatEvent = {
        version: '1.0',
        source: 'custom',
        content: {
            description: description,
            title: `:alert: ${serviceName} Lambda Error`
        }
    };

    try {
        await snsClient.send(new PublishCommand({
            TopicArn: TOPIC_ARN,
            Message: JSON.stringify(slackFormatEvent)
        }));
    } catch (snsError) {
        console.error('Failed to publish to SNS:', snsError);
    }
};