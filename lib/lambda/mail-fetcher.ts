import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
import { downloadImages, getAnytimeMailPageInfo } from './handler/puppeteer-service';

interface EventBody {
    startDate: string;
    endDate: string;
    anytimeAspNetSessionId: string;
    refTimestamp?: string;
}

interface LambdaEvent {
    body: string | EventBody;
}

export const handler = async (event: LambdaEvent) => {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body;

    const { startDate, endDate, anytimeAspNetSessionId, refTimestamp = '0' } = body;

    if (!startDate || !endDate || !anytimeAspNetSessionId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required parameters' }),
        };
    }

    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
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

        const anytimeMailPageInfo = await getAnytimeMailPageInfo(page,
            new Date(startDate),
            new Date(endDate),
            cookies,
            Number(refTimestamp)
        );

        await downloadImages(page, anytimeMailPageInfo.mailList);

        return {
            statusCode: 200,
            body: {
                toNextPage: !anytimeMailPageInfo.isLastPage && Number(refTimestamp) !== anytimeMailPageInfo.refTimestamp,
                refTimestamp: anytimeMailPageInfo.refTimestamp,
                startDate,
                endDate,
                anytimeAspNetSessionId,
            },
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
