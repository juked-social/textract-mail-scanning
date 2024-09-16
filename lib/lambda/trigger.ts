import { APIGatewayProxyHandler } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { addDays, isBefore, isValid, parse } from 'date-fns';

const stateMachineArn = process.env.STATE_MACHINE_ARN!;
const sfnClient = new SFNClient({ region: process.env.REGION });

function formatDate(date: Date): string {
    const month = ('0' + (date.getMonth() + 1)).slice(-2); // Months are zero-based
    const day = ('0' + date.getDate()).slice(-2);
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function getPreviousDate() {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    return now;
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Extract the body from the API Gateway event
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

        // Get startDate and endDate from the request, or default to the previous day
        const startDate = body?.body?.startDate ? parse(body?.body?.startDate, 'MM/dd/yyyy', new Date()) : getPreviousDate();
        const endDate = body?.body?.endDate ? parse(body?.body?.endDate, 'MM/dd/yyyy', new Date()) : startDate;

        if(isValid(startDate) && isValid(endDate)) {
            let currentDate = startDate;

            // Loop through each day and trigger a Step Function execution
            while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
                const formattedDate = formatDate(currentDate);
                console.log('formattedDate', formattedDate);

                // Create a new body with the date to pass to Step Function
                const executionInput = {
                    ...body,
                    body: {
                        ...body.body,
                        startDate: formattedDate,
                        endDate: formattedDate,
                    },
                };

                // Start the execution of the Step Function for the current day
                const command = new StartExecutionCommand({
                    stateMachineArn,
                    input: JSON.stringify(executionInput),
                });

                await sfnClient.send(command);

                // Move to the next day
                currentDate = addDays(currentDate, 1);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Step Function triggered successfully for each day' }),
        };
    } catch (error) {
        console.error('Error starting Step Function execution', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to trigger Step Function', error }),
        };
    }
};
