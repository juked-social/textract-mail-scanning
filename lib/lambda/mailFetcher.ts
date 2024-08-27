import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import puppeteer, { Browser, Page } from 'puppeteer';
import chromium from '@sparticuz/chromium';
import { parse } from 'date-fns';
import { S3 } from 'aws-sdk';
import { AnytimeMailBox, Mail } from './entry/mail';

const s3 = new S3({
    region: process.env.REGION,
});
const bucketName = process.env.IMAGE_BUCKET_NAME; // The S3 bucket name

// Define headers outside functions to avoid unnecessary object creation
const headers = {
    'accept': 'application/json',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

// Helper function to fetch mails
async function fetchMails(page: Page, refTimestamp: number, cookies: {}): Promise<AnytimeMailBox[]> {
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
                credentials: 'include',
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

// Helper function to create mail object from API response
function createMailObject(mail: AnytimeMailBox): Mail {
    return {
        any_mail_id: mail.malId,
        message: mail.message,
        image_path: mail.imageUrl,
        creationDate: mail.creationDate,
        assignedDate: mail.assignedDate,
        lastActionDate: mail.lastActionDate,
    };
}

// Helper function to download an image and save it to S3
async function downloadAndSaveImage(imageUrl: string, imageKey: string) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image from ${imageUrl}`);
        }
        // @ts-ignore
        const imageData = await response.buffer();

        await s3.putObject({
            Bucket: bucketName!,
            Key: imageKey,
            Body: imageData,
            ContentType: 'image/jpeg', // Adjust based on actual content type
        }).promise();

        console.log(`Successfully saved image to S3 with key ${imageKey}`);
    } catch (error) {
        console.error(`Error saving image to S3: ${error}`);
        throw error;
    }
}

async function getMailIds(page: Page, startDate: Date, endDate: Date, cookies: {}): Promise<Mail[]> {
    const mailList: Mail[] = [];
    let refTimestamp = 0;
    let flag = true;

    while (flag) {
        console.log('refTimestamp', refTimestamp);
        const mails = await fetchMails(page, refTimestamp, cookies);

        for (const mail of mails) {
            const assignedDate = parse(mail.assignedDate, 'MM/dd/yyyy', new Date());
            const lastActionDate = parse(mail.lastActionDate, 'MM/dd/yyyy', new Date());

            console.log('timestamp', mail.timestamp);
            if (startDate <= assignedDate && assignedDate <= endDate) {
                const mailData = createMailObject(mail);

                console.log('Processing mail with timestamp:', mail.timestamp);

                // Generate a unique S3 key for the image
                const imageKey = `images/${mail.malId}.jpg`;

                // Download and save image to S3
                await downloadAndSaveImage(mail.imageUrl, imageKey);

                // Update image path in DynamoDB to point to the S3 location
                mailData.image_path = `s3://${bucketName}/${imageKey}`;

                mailList.push(mailData);
            }

            if (lastActionDate < startDate) {
                flag = false;
                break;
            }
        }

        if (mails.length === 0) {
            flag = false;
        }

        if (mails.length > 0 && refTimestamp != mails[mails.length - 1].timestamp) {
            refTimestamp = mails[mails.length - 1].timestamp;
        }
    }

    return mailList;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const { startDate, endDate, anytimeAspNetSessionId } = JSON.parse(event.body || '{}');

    if (!startDate || !endDate || !anytimeAspNetSessionId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required parameters' }),
        };
    }

    let browser: Browser | null = null;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true,
        });
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

        const mailIds = await getMailIds(page, new Date(startDate), new Date(endDate), cookies);

        console.log('Mail Length:', mailIds.length);

        await browser.close();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Emails processed successfully' }),
        };
    } catch (error) {
        console.error('Error during processing:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error', error: error }),
        };
    }
};
