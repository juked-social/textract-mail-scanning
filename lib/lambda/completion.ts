import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
import { deleteTempBucketItems, deleteTempTableItems } from './handler/temp-service';
import { shredAnytimeMails } from './handler/puppeteer-service';


export const handler = async (event: any) => {
    const body = typeof event.InputParameters.body === 'string' ? JSON.parse(event.InputParameters.body || '{}') : event.InputParameters.body;
    const { anytimeAspNetSessionId } = body;

    const idsArray = typeof event.Payload === 'string' ? JSON.parse(event.Payload || '[]') : event.Payload;

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

        const mailIds = idsArray.map((item: {id: string}) => item.id).join(', ');

        await shredAnytimeMails(page, mailIds, cookies);

        // await deleteTempTableItems();

        // await deleteTempBucketItems();

        return {
            statusCode: 200,
            body: {
                message: 'Complete'
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
