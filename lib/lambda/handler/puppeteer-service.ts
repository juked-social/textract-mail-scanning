// Define headers outside functions to avoid unnecessary object creation
import { Page } from 'puppeteer';
import { AnytimeMailBox, Mail, AnytimeMailPageInfo } from '../entry/mail';
import { parse } from 'date-fns';
import { getMailFromDynamoDB, saveMailToDynamoDB, updateMailInDynamoDB } from './mail-service';
import {downloadAndSaveImage} from "./image-service";

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
        creationDate: mail.creationDate,
        assignedDate: mail.assignedDate,
        lastActionDate: mail.lastActionDate,
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

export async function getMailIds(page: Page, startDate: Date, endDate: Date, cookies: {}): Promise<Mail[]> {
    const mailList: Mail[] = [];
    let refTimestamp = 0;
    let flag = true;

    while (flag) {
        const mails = await fetchMails(page, refTimestamp, cookies);

        const mailPromises = mails.map(async (mail) => {
            const assignedDate = parse(mail.assignedDate, 'MM/dd/yyyy', new Date());
            const lastActionDate = parse(mail.lastActionDate, 'MM/dd/yyyy', new Date());

            if (startDate <= assignedDate && assignedDate <= endDate) {
                const mailData = createMailObject(mail);

                // // Generate a unique S3 key for the image
                // const imageKey = `images/${mail.malId}.jpg`;
                //
                // // Download and save image to S3
                // const updatedUrl = `https://packmail.anytimemailbox.com/imagestore/${mail.malId}.s800.jpg?s3`;
                // mailData.image_path = await downloadAndSaveImage(page, updatedUrl, imageKey, cookies);

                console.log('Processing mail with timestamp:', mail.timestamp);
                //
                // // Check if mail already exists
                // const existingMail = await getMailFromDynamoDB(mail.malId);
                //
                // if (existingMail) {
                //     // Update existing mail
                //     await updateMailInDynamoDB(mailData);
                // } else {
                //     // Save new mail
                //     await saveMailToDynamoDB(mailData);
                // }

                mailList.push(mailData);
            }

            if (lastActionDate < startDate) {
                flag = false;
                return;
            }
        });

        await Promise.all(mailPromises);

        if (mails.length === 0) {
            flag = false;
        }

        if (mails.length > 0 && refTimestamp != mails[mails.length - 1].timestamp) {
            refTimestamp = mails[mails.length - 1].timestamp;
        }
    }

    return mailList;
}


export async function getAnytimeMailPageInfo(page: Page, startDate: Date, endDate: Date, cookies: {}, timestamp: number): Promise<AnytimeMailPageInfo> {
    let refTimestamp = timestamp;
    let isLastPage = false;

    const mails = await fetchMails(page, refTimestamp, cookies);

    const mailPromises = mails.map(async (mail) => {
        const assignedDate = parse(mail.assignedDate, 'MM/dd/yyyy', new Date());
        const lastActionDate = parse(mail.lastActionDate, 'MM/dd/yyyy', new Date());

        if (startDate <= assignedDate && assignedDate <= endDate) {
            const mailData = createMailObject(mail);

            // Generate a unique S3 key for the image
            const imageKey = `images/${mail.malId}.jpg`;

            // Download and save image to S3
            const updatedUrl = `https://packmail.anytimemailbox.com/imagestore/${mail.malId}.s800.jpg?s3`;
            mailData.image_path = await downloadAndSaveImage(page, updatedUrl, imageKey, cookies, refTimestamp);

            console.log('Processing mail with timestamp:', mail.timestamp);

            // Check if mail already exists
            const existingMail = await getMailFromDynamoDB(mail.malId);

            if (existingMail) {
                // Update existing mail
                await updateMailInDynamoDB(mailData);
            } else {
                // Save new mail
                await saveMailToDynamoDB(mailData);
            }
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
        refTimestamp
    };
}
