import puppeteer from 'puppeteer';

const targetUrl = process.argv[2] || 'https://www.zhipin.com/geek/job/recommend.html';
const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const browserWSEndpoint = process.env.AUTO_GREETING_CHROME_WS_ENDPOINT || '';

async function run() {
  let browser;
  let page;

  try {
    browser = await puppeteer.connect(
      browserWSEndpoint
        ? { browserWSEndpoint, defaultViewport: { width: 1440, height: 960 } }
        : { browserURL, defaultViewport: { width: 1440, height: 960 } }
    );

    page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise((resolve) => setTimeout(resolve, 4000));

    const snapshot = await page.evaluate(() => {
      const text = (document.body?.innerText || '').trim();
      const interestingSelectors = [
        '.candidate-list-item',
        '.recommend-card',
        '.job-card-wrapper',
        '.job-recommend-main',
        '.recommend-search-expect',
        '.ui-dropmenu-label',
        '.job-list-wrap',
        '.chat-list',
        '.session-list',
      ];
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => ({
          href: anchor.href,
          text: (anchor.textContent || '').trim(),
        }))
        .filter((item) => item.href.includes('zhipin.com'))
        .filter((item) => /推荐|牛人|沟通|聊天|candidate|recommend|chat|geek|job/i.test(item.href + ' ' + item.text))
        .slice(0, 80);

      const selectorCounts = Object.fromEntries(
        interestingSelectors.map((selector) => [selector, document.querySelectorAll(selector).length])
      );

      return {
        url: window.location.href,
        title: document.title,
        textSnippet: text.slice(0, 2000),
        selectorCounts,
        links,
      };
    });

    const screenshotPath = `/tmp/inspect-boss-page-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(
      JSON.stringify(
        {
          targetUrl,
          screenshotPath,
          ...snapshot,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          targetUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
    if (browser) {
      await browser.disconnect();
    }
  }
}

run();
