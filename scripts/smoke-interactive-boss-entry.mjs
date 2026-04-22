import puppeteer from 'puppeteer';
import fs from 'fs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanType(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(80 + Math.floor(Math.random() * 80));
  }
}

async function run() {
  let browser;
  let page;

  try {
    const useGoogleSearch = process.env.SMOKE_VIA_GOOGLE === 'true';
    const executablePath =
      process.env.AUTO_GREETING_CHROME_EXECUTABLE_PATH ||
      [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ].find((candidate) => fs.existsSync(candidate));

    browser = await puppeteer.launch({
      headless: false,
      slowMo: 50,
      defaultViewport: { width: 1440, height: 960 },
      args: ['--disable-blink-features=AutomationControlled'],
      executablePath,
    });

    page = await browser.newPage();
    page.setDefaultTimeout(30000);

    let viaSearch = false;
    if (useGoogleSearch) {
      try {
        await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(1200);

        const searchInput = await page.$('textarea[name="q"], input[name="q"]');
        if (searchInput) {
          await humanType(page, 'textarea[name="q"], input[name="q"]', 'boss直聘');
          await sleep(600);
          await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => undefined);
          await sleep(1500);

          const resultHref = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            const candidate = anchors.find((anchor) => {
              const href = anchor.href || '';
              const text = (anchor.innerText || anchor.textContent || '').trim();
              return href.includes('zhipin.com') && text.length > 0;
            });

            if (!candidate?.href) {
              return null;
            }

            try {
              const url = new URL(candidate.href);
              return url.searchParams.get('q') || url.searchParams.get('url') || candidate.href;
            } catch {
              return candidate.href;
            }
          });

          if (resultHref) {
            await page.goto(resultHref, { waitUntil: 'networkidle2', timeout: 20000 });
            viaSearch = true;
          }
        }
      } catch {
        viaSearch = false;
      }
    }

    if (!viaSearch) {
      await page.goto('https://www.zhipin.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    }

    await sleep(5000);
    const screenshotPath = `/tmp/smoke-interactive-boss-entry-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const snapshot = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      textSnippet: (document.body?.innerText || '').trim().slice(0, 1200),
    }));

    console.log(JSON.stringify({ viaSearch, screenshotPath, ...snapshot }, null, 2));
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
      await browser.close().catch(() => undefined);
    }
  }
}

run();
