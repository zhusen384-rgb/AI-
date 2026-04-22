import puppeteer from 'puppeteer';

const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const browserWSEndpoint = process.env.AUTO_GREETING_CHROME_WS_ENDPOINT || '';

async function run() {
  let browser;

  try {
    browser = await puppeteer.connect(
      browserWSEndpoint
        ? { browserWSEndpoint, defaultViewport: { width: 1440, height: 960 } }
        : { browserURL, defaultViewport: { width: 1440, height: 960 } }
    );

    const pages = await browser.pages();
    const snapshot = [];

    for (const page of pages) {
      snapshot.push({
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    }

    console.log(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

run();
