import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';

// Helper function to wait for a CAPTCHA solution from 2Captcha
export async function getCaptchaSolution(siteKey: string, pageUrl:string, apiToken2Capture: string, timeout = 300000) {
    const startTime = Date.now();

    try {
        console.log('Submitting CAPTCHA solution request to 2Captcha...');

        // Step 1: Submit CAPTCHA solution request to 2Captcha using fetch
        const requestUrl = `http://2captcha.com/in.php?key=${apiToken2Capture}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`;

        const requestResponse = await fetch(requestUrl);
        const requestData = await requestResponse.json();

        const captchaId = requestData.request;
        console.log('Captcha request ID:', captchaId);

        if(captchaId === 'ERROR_ZERO_BALANCE'){
            throw new Error('ERROR ZERO BALANCE');
        }

        // Step 2: Poll for CAPTCHA solution
        let solution = '';
        while (!solution) {
            if (Date.now() - startTime > timeout) {
                throw new Error('CAPTCHA solving timed out');
            }

            console.log('Waiting for CAPTCHA solution...');
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking

            const resultUrl = `http://2captcha.com/res.php?key=${apiToken2Capture}&action=get&id=${captchaId}&json=1`;
            const resultResponse = await fetch(resultUrl);
            const resultData = await resultResponse.json();

            if (resultData.status === 1) {
                solution = resultData.request; // Captcha solution token
                console.log('Captcha solved:', solution);
            }
        }

        return solution;
    } catch (error) {
        console.error('Error solving CAPTCHA:', error);
        throw error;
    }
}

export const getAnytimeMailCookies = async (
    apiToken2Capture: string,
    anytimeMailUser: string,
    anytimeMailPassword: string,
    anytimeMailSiteKey: string
) => {
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
        headless: true,
    });

    try {
        const page = await browser.newPage();
        await page.goto('https://packmail.anytimemailbox.com', { waitUntil: 'networkidle2' });

        await page.type('#f_uid', anytimeMailUser);
        await page.type('#f_pwd', anytimeMailPassword);

        const pageUrl = page.url();
        const captchaSolution = await getCaptchaSolution(anytimeMailSiteKey, pageUrl, apiToken2Capture);

        if(!captchaSolution){
            return '';
        }

        await page.evaluate((captchaSolution) => {
            const recaptcha = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
            if (recaptcha) {
                recaptcha.style.display = 'block';
                recaptcha.value = captchaSolution;
            }
        }, captchaSolution);

        await page.waitForSelector('button[type="submit"]');
        await page.click('button[type="submit"]');

        await page.waitForSelector('*[class*="menu-bar"]');

        return await page.cookies();
    } catch (error) {
        console.error('Error in getAnytimeAspNetSessionIdCookies:', error);
        throw error;
    } finally {
        await browser.close();
    }
};
