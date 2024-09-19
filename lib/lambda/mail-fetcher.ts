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
    const { startDate, endDate, refTimestamp = '0', anytimeAspNetSessionId } = body;

    if (!startDate || !endDate || !anytimeAspNetSessionId) {
        throw new Error('Missing required parameters');
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
            },
        };
    } catch (error) {
        console.error('Error during processing:', error);
        throw new Error('Error during processing: ' + error);
    } finally {
        await browser.close();
    }
};
