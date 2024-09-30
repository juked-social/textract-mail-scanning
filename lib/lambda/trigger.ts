import { APIGatewayProxyHandler } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { addDays, isBefore, isValid, parse } from 'date-fns';
import { formatDate, getPreviousDate } from './handler/utils';
import { getSecret } from './handler/secret-manager';
import { getAnytimeMailCookies } from './handler/recapture-2capture';

const stateMachineArn = process.env.STATE_MACHINE_ARN!;
const sfnClient = new SFNClient({ region: process.env.REGION });
const SECRET_ARN = process.env.SECRET_ARN || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    if (!event?.body) {
        console.error('Request body is missing');
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Request body is missing' })
        };
    }

    try {
        // Extract the body from the API Gateway event
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

        const secret = await getSecret(SECRET_ARN);
        const apiToken2Capture = secret?.apiToken2Capture || '';
        const anytimeMailUser = secret?.anytimeMailUser || '';
        const anytimeMailPassword = secret?.anytimeMailPassword || '';
        const anytimeMailSiteKey = secret?.anytimeMailSiteKey || '';

        // Get startDate and endDate from the request, or default to the previous day
        const startDate = body?.body?.startDate ? parse(body?.body?.startDate, 'MM/dd/yyyy', new Date()) : getPreviousDate();
        const endDate = body?.body?.endDate ? parse(body?.body?.endDate, 'MM/dd/yyyy', new Date()) : startDate;
        const cookies = await getAnytimeMailCookies(
            apiToken2Capture,
            anytimeMailUser,
            anytimeMailPassword,
            anytimeMailSiteKey
        );

        if (!cookies) {
            console.error('Failed to get AnytimeMail Cookies');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Failed to get AnytimeMail Cookies' }),
            };
        }

        const sessionIdCookie = cookies.find(cookie => cookie.name === 'ASP.NET_SessionId');

        if(!sessionIdCookie?.value){
            console.error('Failed to get AnytimeMail Cookies ASP.NET_SessionId');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Failed to get AnytimeMail Cookies ASP.NET_SessionId' }),
            };
        }

        if (isValid(startDate) && isValid(endDate)) {
            let currentDate = startDate;

            // Loop through each day and trigger a Step Function execution
            while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
                const formattedDate = formatDate(currentDate);
                console.log('Triggering Step Function for date:', formattedDate);

                // Create a new body with the date to pass to Step Function
                const executionInput = {
                    ...body,
                    body: {
                        ...body.body,
                        startDate: formattedDate,
                        endDate: formattedDate,
                        anytimeAspNetSessionId: sessionIdCookie?.value
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
        } else {
            console.error('Invalid dates provided');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid dates provided' }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Step Function triggered successfully for each day' }),
        };
    } catch (error) {
        console.error('Error starting Step Function execution', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error starting Step Function execution', error: error }),
        };
    }
};
