import {APIGatewayProxyHandlerV2} from 'aws-lambda';
import puppeteer, {Page} from "puppeteer";
import chromium from "@sparticuz/chromium";
import {parse} from "date-fns";

const headers = {
    'accept': 'application/json',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

async function loadMoreMails(page: Page, refTimestamp: number, sessionId: string): Promise<any[]> {
    const cookies = {
        'ASP.NET_SessionId': sessionId,
    };

    const data = {
        loadMenu: '1',
        refMalId: '0',
        refTimestamp: refTimestamp.toString(),
        subsetMalIds: '',
        filter: '',
    };

    try {
        const response = await page.evaluate(async (data, headers, cookies) => {
            const response = await fetch('https://packmail.anytimemailbox.com/app/mailbox-ajax/inbox', {
                method: 'POST',
                headers: new Headers(headers),
                body: new URLSearchParams(data),
                credentials: 'include', // Include cookies
            } as RequestInit);

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            return response.json();
        }, data, headers, cookies);

        return response.mail.items;
    } catch (error) {
        console.error('Error loading mails:', error);
        return [];
    }
}

async function getMailIds(page: Page, startDate: Date, endDate: Date, sessionId: string): Promise<any[]> {
    let mailList: any[] = [];
    let refTimestamp = 0;
    let flag = true;

    while (flag) {
        const mails = await loadMoreMails(page, refTimestamp, sessionId);

        for (const mail of mails) {
            const assignedDate = parse(mail.assignedDate, 'MM/dd/yyyy', new Date());
            const lastActionDate = parse(mail.lastActionDate, 'MM/dd/yyyy', new Date());
            const mailId = mail.malId;

            if (startDate <= assignedDate && assignedDate <= endDate) {
                mailList.push({any_mail_id: mailId, assigned_date: assignedDate, last_action_date: lastActionDate});
            }

            if (lastActionDate < startDate) {
                flag = false;
                break;
            }
        }

        if (mails.length === 0) {
            flag = false;
        }

        if (mails.length > 0) {
            refTimestamp = mails[mails.length - 1].timestamp;
        }
    }

    return mailList;
}


export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const {startDate, endDate, anytimeAspNetSessionId} = JSON.parse(event.body || '{}');

    if (!startDate || !endDate || !anytimeAspNetSessionId) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Missing required parameters'}),
        };
    }

    try {
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true
        });
        const page = await browser.newPage();
        await page.goto('https://packmail.anytimemailbox.com/app/home');
        await page.setCookie({
            name: 'ASP.NET_SessionId',
            value: anytimeAspNetSessionId,
            domain: 'packmail.anytimemailbox.com',
        });
        const mailIds = await getMailIds(page, new Date(startDate), new Date(endDate), anytimeAspNetSessionId);
        console.log('Mail Length:', mailIds.length);
        await browser.close();

        return {
            statusCode: 200,
            body: JSON.stringify({message: 'Emails are being processed successfully'}),
        };

    } catch (error) {
        console.error('Error during Puppeteer execution:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({message: 'Internal server error', error: error}),
        };
    }
};
