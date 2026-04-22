import puppeteer from 'puppeteer';

const targetLabel = process.argv[2] || '看过我';
const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';

async function main() {
  const browser = await puppeteer.connect({
    browserURL,
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();
  const requests = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('zhipin.com')) return;
    if (!/api|wapi|geek|job|chat|recommend/i.test(url)) return;
    requests.push({
      url,
      status: response.status(),
      type: response.request().resourceType(),
    });
  });

  try {
    await page.goto('https://www.zhipin.com/web/chat/job/list', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const iframeInfo = await page.evaluate(() => {
      const frame = document.querySelector('iframe');
      return {
        hasFrame: Boolean(frame),
        frameSrc: frame?.getAttribute('src') || null,
      };
    });

    const frame = page.frames().find((item) => item.url().includes('/web/frame/job/list-new'));
    let clickInfo = null;

    if (frame) {
      const handles = await frame.$$('.job-about-num-wrapper .inner-box');
      for (const handle of handles) {
        const text = await handle.evaluate((element) =>
          (element.textContent || '').replace(/\s+/g, ' ').trim()
        );

        if (!text.includes(targetLabel)) {
          continue;
        }

        const box = await handle.boundingBox();
        if (!box) {
          continue;
        }

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        clickInfo = { text };
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const snapshot = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      textSnippet: (document.body?.innerText || '').trim().slice(0, 1800),
      iframeCount: document.querySelectorAll('iframe').length,
    }));

    const uniqueRequests = [];
    const seen = new Set();
    for (const request of requests) {
      const key = `${request.status}|${request.type}|${request.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRequests.push(request);
    }

    console.log(
      JSON.stringify(
        {
          targetLabel,
          iframeInfo,
          clickInfo,
          snapshot,
          requests: uniqueRequests.slice(-120),
        },
        null,
        2
      )
    );
  } finally {
    await page.close().catch(() => undefined);
    await browser.disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        targetLabel,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
