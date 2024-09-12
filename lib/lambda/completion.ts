import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
import { deleteTempBucketItems, deleteTempRotateTableItems, deleteTempTableItems } from './handler/temp-service';
import { shredAnytimeMails } from './handler/puppeteer-service';
import { getMailFromDynamoDB, updateMailInDynamoDB } from './handler/mail-service';
import { getSecret } from './handler/secret-manager';

const SECRET_ARN = process.env.SECRET_ARN || '';

export const handler = async (event: any) => {
    const secret = await getSecret(SECRET_ARN);
    const anytimeAspNetSessionId = secret?.anytimeAspNetSessionId || '';

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

        const mailIds = idsArray.filter((item: { id: string }) => !!item?.id).map((item: { id: string }) => item.id);

        await Promise.all(
            mailIds.map(async (id: string) => {
                const mail = await getMailFromDynamoDB(Number(id));
                if (mail) {
                    await updateMailInDynamoDB({
                        ...mail,
                        is_shredded: true
                    });
                }
            })
        );

        // call shred in anytimemailbox
        const mailIdsString = mailIds.join(', ');
        await shredAnytimeMails(page, mailIdsString, cookies);

        // delete temporary folders and tables for text extreact
        await deleteTempTableItems();
        await deleteTempRotateTableItems();
        await deleteTempBucketItems();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Complete'
            }),
        };
    } catch (error) {
        console.error('Error during processing:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                error: error,
            }),
        };
    } finally {
        await browser.close();
    }
};
