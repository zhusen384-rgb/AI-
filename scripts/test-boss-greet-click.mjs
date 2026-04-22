import puppeteer from 'puppeteer';

const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const url =
  process.env.BOSS_RECOMMEND_URL ||
  'https://www.zhipin.com/web/frame/recommend/interaction?jobid=3fcfe6f68f9c40450nZ82NW-EFBV&status=2&filterParams=&t=';

async function main() {
  const browser = await puppeteer.connect({
    browserURL,
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();
  const requests = [];
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (!responseUrl.includes('zhipin.com')) return;
    if (!/api|wapi|chat|greet|friend|msg|recommend/i.test(responseUrl)) return;
    requests.push({
      url: responseUrl,
      status: response.status(),
      type: response.request().resourceType(),
    });
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const before = await page.evaluate(() => {
      const button = document.querySelector('.btn.btn-greet');
      return {
        url: location.href,
        textSnippet: (document.body?.innerText || '').trim().slice(0, 1200),
        firstButtonText: button?.textContent?.trim() || null,
      };
    });

    const button = await page.$('.btn.btn-greet');
    if (!button) {
      throw new Error('greet button not found');
    }

    const box = await button.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await button.click();
    }

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const after = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.btn.btn-greet, .btn.btn-chat, .btn'));
      return {
        url: location.href,
        textSnippet: (document.body?.innerText || '').trim().slice(0, 1600),
        firstButtonTexts: buttons.slice(0, 5).map((button) => button.textContent?.trim() || ''),
        contenteditables: Array.from(document.querySelectorAll('[contenteditable], textarea')).map((el) => ({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          placeholder: el.getAttribute('placeholder'),
          text: (el.textContent || '').trim().slice(0, 120),
        })),
      };
    });

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
          before,
          after,
          requests: uniqueRequests.slice(-100),
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
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
