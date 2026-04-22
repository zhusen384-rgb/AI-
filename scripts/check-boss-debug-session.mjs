import puppeteer from 'puppeteer';

const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const browserWSEndpoint = process.env.AUTO_GREETING_CHROME_WS_ENDPOINT || '';

const BOSS_SELECTORS = {
  loggedIn: ['.nav-figure', '.user-nav', '.nav-job-manage'],
  recommendPageReady: ['.candidate-list-item', '.recommend-card', '.job-card-wrapper'],
};

function pickFirstSelector(selectors, document) {
  return selectors.find((selector) => document.querySelector(selector)) || null;
}

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

    await page.goto('https://www.zhipin.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mainPageState = await page.evaluate((selectors) => {
      const loggedInSelector = selectors.loggedIn.find((selector) => document.querySelector(selector)) || null;
      return {
        url: window.location.href,
        title: document.title,
        loggedIn: Boolean(loggedInSelector),
        loggedInSelector,
      };
    }, BOSS_SELECTORS);

    const result = {
      browserURL,
      browserWSEndpoint: browserWSEndpoint || null,
      mainPageState,
      recommendPageState: null,
      screenshotPath: null,
    };

    if (mainPageState.loggedIn) {
      await page.goto('https://www.zhipin.com/geek/job/recommend.html', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const recommendPageState = await page.evaluate((selectors) => {
        const readySelector =
          selectors.recommendPageReady.find((selector) => document.querySelector(selector)) || null;
        return {
          url: window.location.href,
          title: document.title,
          ready: Boolean(readySelector),
          readySelector,
          candidateCards: document.querySelectorAll('.candidate-list-item, .recommend-card, .job-card-wrapper').length,
        };
      }, BOSS_SELECTORS);

      result.recommendPageState = recommendPageState;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const screenshotPath = `/tmp/check-boss-debug-session-${Date.now()}.png`;

    if (page) {
      try {
        await page.screenshot({ path: screenshotPath, fullPage: false });
      } catch {
        // ignore screenshot errors in failure path
      }
    }

    console.error(
      JSON.stringify(
        {
          browserURL,
          browserWSEndpoint: browserWSEndpoint || null,
          error: error instanceof Error ? error.message : String(error),
          screenshotPath,
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
