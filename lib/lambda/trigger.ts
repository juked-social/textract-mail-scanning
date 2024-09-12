import { APIGatewayProxyHandler } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const stateMachineArn = process.env.STATE_MACHINE_ARN!;
const sfnClient = new SFNClient({ region: process.env.REGION });


function getPreviousDate(): string {
    const now = new Date();
    now.setDate(now.getDate() - 1); // Go back one day
    const month = ('0' + (now.getMonth() + 1)).slice(-2); // Months are zero-based
    const day = ('0' + now.getDate()).slice(-2);
    const year = now.getFullYear();
    return `${month}/${day}/${year}`;
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Extract the body from the API Gateway event
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;
        console.log(body);

        // Ensure `body` and `body.body` are defined before attempting to destructure
        const startDate = body?.body?.startDate;
        const endDate = body?.body?.endDate;

        // Handle missing `startDate` and `endDate`
        if (!startDate && !endDate) {
            const previousDate = getPreviousDate();
            body.body = {
                startDate: previousDate,
                endDate: previousDate,
            };
        }

        // Start the execution of the state machine
        const command = new StartExecutionCommand({
            stateMachineArn,
            input: JSON.stringify(body),
        });

        await sfnClient.send(command);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Step Function triggered successfully' }),
        };
    } catch (error) {
        console.error('Error starting Step Function execution', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to trigger Step Function', error }),
        };
    }
};
