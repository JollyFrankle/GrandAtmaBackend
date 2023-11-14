import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.connect({
        browserWSEndpoint: 'wss://chrome.browserless.io/'
    });
    const page = await browser.newPage();

    // Navigate to the desired page
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });

    // Generate PDF from the page
    await page.pdf({ path: 'temp/example.pdf', format: 'A4' });

    await browser.close();
  })();