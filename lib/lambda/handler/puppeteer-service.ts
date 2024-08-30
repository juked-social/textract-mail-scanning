// Define headers outside functions to avoid unnecessary object creation
import { Page } from 'puppeteer';
import { AnytimeMailBox, Mail, AnytimeMailPageInfo } from '../entry/mail';
import { parse } from 'date-fns';
import { getMailFromDynamoDB, saveMailToDynamoDB, updateMailInDynamoDB } from './mail-service';
import { downloadAndSaveImage } from './image-service';

const headers = {
    'accept': 'application/json',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

// Helper function to create mail object from API response
function createMailObject(mail: AnytimeMailBox): Mail {
    return {
        any_mail_id: mail.malId,
        message: mail.message,
        image_path: mail.imageUrl,
        creationDate: new Date(mail.creationDate).toISOString(),
        assignedDate: new Date(mail.assignedDate).toISOString(),
        lastActionDate: new Date(mail.lastActionDate).toISOString(),
    };
}

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
        const responses = await Promise.all([
            page.evaluate(async (data, headers, cookies) => {
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
            }, data, headers, cookies)
        ]);

        return responses.flatMap(response => response?.mail?.items || []);
    } catch (error) {
        console.error('Error loading mails:', error);
        return [];
    }
}

export async function getAnytimeMailPageInfo(page: Page, startDate: Date, endDate: Date, cookies: {}, timestamp: number): Promise<AnytimeMailPageInfo> {
    let refTimestamp = timestamp;
    let isLastPage = false;
    const mailList: Mail[] = [];

    const mails = await fetchMails(page, refTimestamp, cookies);

    const mailPromises = mails.map(async (mail) => {
        const assignedDate = parse(mail.assignedDate, 'MM/dd/yyyy', new Date());
        const lastActionDate = parse(mail.lastActionDate, 'MM/dd/yyyy', new Date());

        if (startDate <= assignedDate && assignedDate <= endDate) {
            const mailData = createMailObject(mail);

            // Check if mail already exists
            const existingMail = await getMailFromDynamoDB(mail.malId);

            if (existingMail) {
                // Update existing mail
                await updateMailInDynamoDB(mailData);
            } else {
                // Save new mail
                await saveMailToDynamoDB(mailData);
            }

            mailList.push(mailData);
        }

        if (lastActionDate < startDate) {
            isLastPage = true;
            return;
        }
    });

    await Promise.all(mailPromises);

    if (mails.length === 0) {
        isLastPage = true;
    }

    if (mails.length > 0 && refTimestamp != mails[mails.length - 1].timestamp) {
        refTimestamp = Number(mails[mails.length - 1].timestamp);
    }

    return {
        isLastPage,
        refTimestamp,
        mailList
    };
}


export const downloadImages = async (page: Page, mailList: Mail[]) => {
    try {
        for (const mail of mailList) {
            // Generate a unique S3 key for the image
            const imageKey = `images/${mail.assignedDate.split('T')[0]}/card_${mail.any_mail_id}.jpg`;

            // Download and save image to S3
            const updatedUrl = `https://packmail.anytimemailbox.com/imagestore/${mail.any_mail_id}.s800.jpg?s3`;
            const updatedMail = { ...mail, image_path: await downloadAndSaveImage(page, updatedUrl, imageKey) };

            await updateMailInDynamoDB(updatedMail);
        }
    } catch (error){
        console.error(`Error saving image: ${error}`);
    }
};

export const shredAnytimeMails = async (page: Page, mailIds: string, cookies: {}) => {
    console.log('mailIds', mailIds);

    const request = await page.evaluate(async (mailIds, headers, cookies) => {
        const response = await fetch('https://packmail.anytimemailbox.com/app/mail-ajax/pendingcheck', {
            method: 'POST',
            headers: new Headers(headers),
            // todo apply mailIds
            body: new URLSearchParams({ malids: '' }),
            credentials: 'include',
        } as RequestInit);

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        return response.json();
    }, mailIds, headers, cookies);

    console.log('request', request);

    if(request.success){
        const result = await page.evaluate(async (mailIds, headers, cookies) => {
            const response = await fetch('https://packmail.anytimemailbox.com/app/mail-ajax/action', {
                method: 'POST',
                headers: new Headers(headers),
                // todo apply mailIds
                body: new URLSearchParams({ ids: '', status: '81' }),
                credentials: 'include',
            } as RequestInit);

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            return response.json();
        }, mailIds, headers, cookies);

        console.log('result', result);

        return result;
    }

    return null;
};