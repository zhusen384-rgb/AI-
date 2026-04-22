import puppeteer from 'puppeteer';

const browserURL = process.env.AUTO_GREETING_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const jobLabel = process.env.BOSS_RECOMMEND_JOB_LABEL || '';
const greetMode = process.env.BOSS_RECOMMEND_DO_GREET === 'true';

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectJob(frame, targetLabel) {
  if (!targetLabel) {
    return null;
  }

  const currentJob = await frame.evaluate(() => {
    const current = document.querySelector('.ui-dropmenu-label');
    return current ? current.textContent?.replace(/\s+/g, ' ').trim() || '' : '';
  });

  if (currentJob === targetLabel) {
    const currentValue = await frame.evaluate(() => {
      const current = document.querySelector('li.job-item.curr');
      return current?.getAttribute('value') || null;
    });
    return {
      selected: currentJob,
      value: currentValue,
      changed: false,
    };
  }

  const dropdown = await frame.$('.ui-dropmenu-label');
  if (!dropdown) {
    return {
      selected: currentJob,
      value: null,
      changed: false,
      error: '未找到岗位下拉框',
    };
  }

  await dropdown.click();
  await wait(800);

  const option = await frame.evaluateHandle((label) => {
    const options = Array.from(document.querySelectorAll('li.job-item'));
    return options.find((item) => {
      const text = item.textContent?.replace(/\s+/g, ' ').trim() || '';
      return text === label || text.includes(label) || label.includes(text);
    }) || null;
  }, targetLabel);

  const optionElement = option.asElement();
  if (!optionElement) {
    return {
      selected: currentJob,
      value: null,
      changed: false,
      error: `未找到岗位：${targetLabel}`,
    };
  }

  const responsePromise = frame.page().waitForResponse(
    (response) => response.url().includes('/wapi/zpjob/rec/geek/list') && response.status() === 200,
    { timeout: 10000 }
  ).catch(() => null);

  await optionElement.click();
  const response = await responsePromise;
  await wait(1500);

  const selected = await frame.evaluate(() => {
    const current = document.querySelector('.ui-dropmenu-label');
    return current ? current.textContent?.replace(/\s+/g, ' ').trim() || '' : '';
  });
  const value = await frame.evaluate(() => {
    const current = document.querySelector('li.job-item.curr');
    return current?.getAttribute('value') || null;
  });

  return {
    selected,
    value,
    changed: true,
    responseUrl: response?.url() || null,
  };
}

async function inspectFirstCard(frame) {
  const card = await frame.$('.candidate-card-wrap');
  if (!card) {
    return {
      error: '未找到候选人卡片',
    };
  }

  const before = await card.evaluate((root) => {
    const name = root.querySelector('.name')?.textContent?.trim() || '';
    const buttonText = root.querySelector('.btn.btn-greet')?.textContent?.trim() || '';
    const inner = root.querySelector('.card-inner[data-geek]');
    return {
      name,
      greetText: buttonText,
      geekKey: inner?.getAttribute('data-geek') || null,
      cardText: root.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
    };
  });

  let detailResponse = null;
  const detailPromise = frame.page().waitForResponse(
    (response) => response.url().includes('/wapi/zpjob/view/geek/info') && response.status() === 200,
    { timeout: 10000 }
  ).catch(() => null);

  const box = await card.boundingBox();
  if (box) {
    await frame.page().mouse.move(box.x + Math.min(120, box.width / 2), box.y + Math.min(120, box.height / 2), {
      steps: 12,
    });
    await frame.page().mouse.click(box.x + Math.min(120, box.width / 2), box.y + Math.min(120, box.height / 2));
  } else {
    await card.click();
  }

  const response = await detailPromise;
  await frame.waitForSelector('.dialog-wrap.active .btn-v2.btn-sure-v2.btn-greet', {
    timeout: 5000,
  }).catch(() => null);
  if (response) {
    try {
      detailResponse = {
        url: response.url(),
        status: response.status(),
        textSnippet: (await response.text()).slice(0, 3000),
      };
    } catch (error) {
      detailResponse = {
        url: response.url(),
        status: response.status(),
        error: String(error),
      };
    }
  }

  return {
    before,
    detailResponse,
  };
}

async function greetCandidate(frame, geekKey) {
  const dialogButton = await frame.$('.dialog-wrap.active .btn-v2.btn-sure-v2.btn-greet');
  const button = dialogButton || await frame.$('.btn.btn-greet');
  if (!button) {
    return {
      error: '未找到打招呼按钮',
    };
  }

  let startResponse = null;
  const greetRequests = [];
  const page = frame.page();
  const listener = async (response) => {
    const url = response.url();
    if (!url.includes('zhipin.com')) return;
    if (!/checkJobOpen|chat\/start|view\/geek\/info/.test(url)) return;
    let textSnippet = null;
    if (url.includes('/wapi/zpjob/chat/start')) {
      try {
        textSnippet = (await response.clone().text()).slice(0, 3000);
      } catch {
        textSnippet = null;
      }
    }
    greetRequests.push({
      url,
      status: response.status(),
      type: response.request().resourceType(),
      textSnippet,
    });
  };
  page.on('response', listener);

  const buttonTextBefore = await button.evaluate((element) => element.textContent?.trim() || '');
  const startPromise = page.waitForResponse(
    (response) => response.url().includes('/wapi/zpjob/chat/start') && response.status() === 200,
    { timeout: 12000 }
  ).catch(() => null);

  const box = await button.boundingBox();
  if (dialogButton) {
    await frame.evaluate(() => {
      const button = document.querySelector('.dialog-wrap.active .btn-v2.btn-sure-v2.btn-greet');
      button?.click();
    });
  } else if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await button.click();
  }

  const response = await startPromise;
  const buttonTextAfter = await button.evaluate((element) => element.textContent?.trim() || '');
  if (response) {
    try {
      startResponse = {
        url: response.url(),
        status: response.status(),
        textSnippet: (await response.text()).slice(0, 3000),
      };
    } catch (error) {
      startResponse = {
        url: response.url(),
        status: response.status(),
        error: String(error),
      };
    }
  }

  page.off('response', listener);

  return {
    buttonTextBefore,
    buttonTextAfter,
    startResponse,
    requests: greetRequests,
  };
}

async function run() {
  const browser = await puppeteer.connect({
    browserURL,
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();
  try {
    await page.goto('https://www.zhipin.com/web/chat/recommend', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await wait(5000);

    const frame = page.frames().find((item) => item.url().includes('/web/frame/recommend/'));
    if (!frame) {
      throw new Error('未找到推荐牛人 iframe');
    }

    await frame.waitForSelector('.candidate-card-wrap', { timeout: 15000 });
    const selectedJob = await selectJob(frame, jobLabel);
    await wait(2000);

    const cardSummary = await frame.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.candidate-card-wrap')).slice(0, 5);
      return cards.map((card) => ({
        name: card.querySelector('.name')?.textContent?.trim() || '',
        greetText: card.querySelector('.btn.btn-greet')?.textContent?.trim() || '',
        salary: card.querySelector('.salary-wrap span')?.textContent?.trim() || '',
        cardText: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }));
    });

    const detail = await inspectFirstCard(frame);
    const greet = greetMode ? await greetCandidate(frame, detail.before?.geekKey) : null;

    const screenshotPath = `/tmp/test-boss-recommend-flow-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(
      JSON.stringify(
        {
          browserURL,
          jobLabel: jobLabel || null,
          selectedJob,
          frameUrl: frame.url(),
          cardSummary,
          detail,
          greet,
          screenshotPath,
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

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        browserURL,
        jobLabel: jobLabel || null,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
