import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
import { getAnytimeMailPageInfo } from './handler/puppeteer-service';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

    const { startDate, endDate, anytimeAspNetSessionId, refTimestamp = '0' } = body;

    if (!startDate || !endDate || !anytimeAspNetSessionId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required parameters' }),
        };
    }

    console.log(refTimestamp);

    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://packmail.anytimemailbox.com/app/home', {
            waitUntil: 'networkidle2',
        });
        await page.setCookie({
            name: 'ASP.NET_SessionId',
            value: anytimeAspNetSessionId,
            domain: 'packmail.anytimemailbox.com',
        });

        const cookies = {
            'ASP.NET_SessionId': anytimeAspNetSessionId
        };

        console.log('getting mails');

        const anytimeMailPageInfo = await getAnytimeMailPageInfo(page, new Date(startDate), new Date(endDate), cookies, Number(refTimestamp));

        return {
            statusCode: 200,
            body: JSON.stringify(
                {
                    toNextPage: !anytimeMailPageInfo.isLastPage && Number(refTimestamp) !== anytimeMailPageInfo.refTimestamp,
                    refTimestamp: anytimeMailPageInfo.refTimestamp,
                    startDate,
                    endDate,
                    anytimeAspNetSessionId,
                }),
        };
    } catch (error) {
        console.error('Error during processing:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error', error: error, toNextPage: false }),
        };
    } finally {
        await browser.close();
    }
};
