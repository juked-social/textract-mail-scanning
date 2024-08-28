// trigger.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const stateMachineArn = process.env.STATE_MACHINE_ARN!;
const sfnClient = new SFNClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Extract the body from the API Gateway event
        const body = JSON.parse(event.body || '{}');

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
