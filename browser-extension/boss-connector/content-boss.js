(function () {
if (window.__AUTO_GREETING_BOSS_COMMAND_BRIDGE__) {
  return;
}
window.__AUTO_GREETING_BOSS_COMMAND_BRIDGE__ = true;

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeJobLabelKey(value) {
  return normalizeText(value)
    .replace(/[_｜|]/g, ' ')
    .replace(/\b\d+\s*-\s*\d+\s*[kK]\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const BOSS_URLS = {
  recommend: 'https://www.zhipin.com/web/chat/recommend',
  chat: 'https://www.zhipin.com/web/chat/index',
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  const normalizedMin = Math.max(0, Math.floor(Math.min(min, max)));
  const normalizedMax = Math.max(normalizedMin, Math.floor(Math.max(min, max)));
  return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
}

function dispatchMouseLikeEvent(target, type, rect, point) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    screenX: point.x,
    screenY: point.y,
    button: 0,
    buttons: type === 'mousedown' ? 1 : 0,
    view: window,
  });

  target.dispatchEvent(event);
}

async function humanMoveAndClick(target) {
  if (!target) {
    return;
  }

  target.scrollIntoView({
    block: 'center',
    inline: 'center',
    behavior: 'smooth',
  });
  await wait(randomBetween(250, 600));

  const rect = target.getBoundingClientRect();
  const endPoint = {
    x: rect.left + Math.max(8, Math.min(rect.width - 8, randomBetween(12, Math.max(12, Math.floor(rect.width - 12))))),
    y: rect.top + Math.max(8, Math.min(rect.height - 8, randomBetween(12, Math.max(12, Math.floor(rect.height - 12))))),
  };
  const startPoint = {
    x: endPoint.x + randomBetween(-140, 140),
    y: endPoint.y + randomBetween(-90, 90),
  };
  const steps = randomBetween(6, 11);

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const point = {
      x: startPoint.x + (endPoint.x - startPoint.x) * progress + randomBetween(-3, 3),
      y: startPoint.y + (endPoint.y - startPoint.y) * progress + randomBetween(-3, 3),
    };
    dispatchMouseLikeEvent(target, 'mousemove', rect, point);
    if (index === 1) {
      dispatchMouseLikeEvent(target, 'mouseenter', rect, point);
      dispatchMouseLikeEvent(target, 'mouseover', rect, point);
    }
    await wait(randomBetween(18, 55));
  }

  dispatchMouseLikeEvent(target, 'mousedown', rect, endPoint);
  await wait(randomBetween(40, 120));
  dispatchMouseLikeEvent(target, 'mouseup', rect, endPoint);
  await wait(randomBetween(30, 90));
  dispatchMouseLikeEvent(target, 'click', rect, endPoint);
}

function parseCandidateCard(card) {
  const cardInner = card.querySelector('.card-inner[data-geek]');
  const text = normalizeText(card.textContent || '');
  const name = card.querySelector('.name')?.textContent?.trim() || '';
  const salary = card.querySelector('.salary-wrap span')?.textContent?.trim() || undefined;
  const activeTime = card.querySelector('.active-text')?.textContent?.trim() || undefined;
  const baseInfo = Array.from(card.querySelectorAll('.base-info span'))
    .map((element) => element.textContent?.trim() || '')
    .filter(Boolean);
  const expectText = normalizeText(card.querySelector('.expect-wrap .content')?.textContent || '');
  const latestWork = normalizeText(card.querySelector('.lately-work')?.textContent || '') || undefined;
  const labelRows = Array.from(card.querySelectorAll('.row.row-flex')).map((element) => ({
    label: element.querySelector('.label')?.textContent?.trim() || '',
    content: normalizeText(element.querySelector('.content')?.textContent || ''),
  }));
  const advantageRow = labelRows.find((item) => item.label === '优势');
  const timelineTexts = Array.from(card.querySelectorAll('.timeline-wrap .content'))
    .map((element) => normalizeText(element.textContent || ''))
    .filter(Boolean);
  const expectTokens = expectText.split(/\s+/).filter(Boolean);
  const workHistory = latestWork && latestWork !== '无工作经历'
    ? [{ companyName: latestWork }]
    : [];

  return {
    id: cardInner?.dataset.geek || name,
    cardKey: cardInner?.dataset.geek || undefined,
    geekKey: cardInner?.dataset.geek || undefined,
    name,
    salary,
    activeTime,
    age: baseInfo[0] ? Number.parseInt(baseInfo[0], 10) || undefined : undefined,
    experience: baseInfo[1] || undefined,
    education: baseInfo[2] || undefined,
    location: expectTokens[0] || undefined,
    expectedCity: expectTokens[0] || undefined,
    title: expectTokens.slice(1).join(' ') || undefined,
    expectedPosition: expectTokens.slice(1).join(' ') || undefined,
    advantage: advantageRow?.content || undefined,
    company: latestWork && latestWork !== '无工作经历' ? latestWork : undefined,
    resumePreview: timelineTexts.join(' | ') || undefined,
    workHistory,
    hasGreeted: !((card.querySelector('.btn.btn-greet')?.textContent || '').includes('打招呼')),
    cardText: text,
  };
}

function parseDialogCandidate(dialog, fallback) {
  const text = normalizeText(dialog.textContent || '');
  const skills = Array.from(
    dialog.querySelectorAll('.tag-list span, .skill-wrap span, .keywords-wrap span, .label-list span')
  )
    .map((element) => normalizeText(element.textContent || ''))
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, 12);
  const baseInfo = Array.from(dialog.querySelectorAll('.base-info span, .resume-user-info .base-info span'))
    .map((element) => normalizeText(element.textContent || ''))
    .filter(Boolean);
  const expectText =
    normalizeText(dialog.querySelector('.expect-wrap .content')?.textContent || '') ||
    fallback.expectedPosition ||
    '';
  const expectTokens = expectText.split(/\s+/).filter(Boolean);
  const latestWork =
    normalizeText(dialog.querySelector('.lately-work')?.textContent || '') ||
    fallback.company ||
    '';
  const timelineTexts = Array.from(
    dialog.querySelectorAll('.timeline-wrap .content, .resume-content .content, .resume-item .content')
  )
    .map((element) => normalizeText(element.textContent || ''))
    .filter(Boolean)
    .slice(0, 8);

  return {
    ...fallback,
    id: fallback.id || fallback.cardKey || fallback.name,
    geekKey: fallback.geekKey || fallback.cardKey || fallback.id,
    name:
      dialog.querySelector('.name')?.textContent?.trim() ||
      dialog.querySelector('.resume-user-info .name')?.textContent?.trim() ||
      fallback.name,
    salary:
      dialog.querySelector('.salary-wrap span')?.textContent?.trim() ||
      dialog.querySelector('.resume-user-info .salary')?.textContent?.trim() ||
      fallback.salary,
    age: baseInfo[0] ? Number.parseInt(baseInfo[0], 10) || fallback.age : fallback.age,
    experience: baseInfo[1] || fallback.experience,
    education: baseInfo[2] || fallback.education,
    location: expectTokens[0] || fallback.location,
    expectedCity: expectTokens[0] || fallback.expectedCity,
    title: expectTokens.slice(1).join(' ') || fallback.title,
    expectedPosition: expectTokens.slice(1).join(' ') || fallback.expectedPosition,
    company: latestWork && latestWork !== '无工作经历' ? latestWork : fallback.company,
    skills: skills.length > 0 ? skills : fallback.skills,
    resumePreview: timelineTexts.join(' | ') || fallback.resumePreview,
    dialogText: text.slice(0, 1600),
  };
}

function getActiveDialog() {
  return document.querySelector('.dialog-wrap.active, .dialog-lib-resume.recommendV2');
}

async function closeDialog() {
  const dialog = getActiveDialog();
  if (!dialog) {
    return false;
  }

  const closeButton = dialog.querySelector(
    '.icon-close, .btn-close, .dialog-close, [class*="close"], .resume-dialog-close'
  );
  if (closeButton instanceof HTMLElement) {
    await humanMoveAndClick(closeButton);
    await wait(randomBetween(350, 700));
    return true;
  }

  dialog.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
  );
  await wait(randomBetween(350, 700));
  return true;
}

let seenGeekKeys = new Set();
let currentCandidateGeekKey = null;

async function bossGetPageInfo() {
  let topUrl = '';
  try {
    topUrl = window.top?.location?.href || '';
  } catch {
    topUrl = '';
  }

  return {
    url: window.location.href,
    topUrl,
    title: document.title,
    recommendCards: document.querySelectorAll('.candidate-card-wrap').length,
    greetButtons: document.querySelectorAll('.btn.btn-greet').length,
    currentJobLabel: document.querySelector('.ui-dropmenu-label')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    textSnippet: (document.body?.innerText || '').trim().slice(0, 1200),
  };
}

async function bossSelectRecommendJob(payload) {
  const targetLabel = String(payload?.jobLabel || '').trim();
  const currentLabel = document.querySelector('.ui-dropmenu-label')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const targetLabelKey = normalizeJobLabelKey(targetLabel);
  const currentLabelKey = normalizeJobLabelKey(currentLabel);
  if (!targetLabel) {
    return {
      selected: currentLabel,
      changed: false,
      error: '缺少岗位名称',
    };
  }

  if (
    currentLabel === targetLabel ||
    (targetLabelKey && currentLabelKey && currentLabelKey === targetLabelKey)
  ) {
    const currentValue = document.querySelector('li.job-item.curr')?.getAttribute('value') || null;
    return {
      selected: currentLabel,
      value: currentValue,
      changed: false,
    };
  }

  const dropdown = document.querySelector('.ui-dropmenu-label');
  if (!dropdown) {
    return {
      selected: currentLabel,
      changed: false,
      error: '未找到岗位下拉框',
    };
  }

  await humanMoveAndClick(dropdown);
  await wait(randomBetween(650, 1000));

  const options = Array.from(document.querySelectorAll('li.job-item'));
  const target = options.find((option) => {
    const text = normalizeText(option.textContent || '');
    const optionKey = normalizeJobLabelKey(text);
    return (
      text === targetLabel ||
      text.includes(targetLabel) ||
      targetLabel.includes(text) ||
      (targetLabelKey && optionKey && optionKey === targetLabelKey) ||
      (targetLabelKey && optionKey && optionKey.includes(targetLabelKey)) ||
      (targetLabelKey && optionKey && targetLabelKey.includes(optionKey))
    );
  });

  if (!target) {
    return {
      selected: currentLabel,
      changed: false,
      error: `未找到岗位：${targetLabel}`,
    };
  }

  await humanMoveAndClick(target);
  await wait(randomBetween(1200, 1800));

  return {
    selected: document.querySelector('.ui-dropmenu-label')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    value: document.querySelector('li.job-item.curr')?.getAttribute('value') || null,
    changed: true,
  };
}

async function bossInspectNextCandidate(payload) {
  if (payload?.resetSeen) {
    seenGeekKeys = new Set();
    currentCandidateGeekKey = null;
  }

  await closeDialog();

  const cards = Array.from(document.querySelectorAll('.candidate-card-wrap'));
  const nextCard = cards.find((card) => {
    const parsed = parseCandidateCard(card);
    const key = parsed.geekKey || parsed.cardKey || parsed.id || parsed.name;
    if (!key) {
      return false;
    }

    if (parsed.hasGreeted) {
      seenGeekKeys.add(key);
      return false;
    }

    return !seenGeekKeys.has(key);
  });

  if (!nextCard) {
    return {
      exhausted: true,
      seenCount: seenGeekKeys.size,
      currentUrl: window.location.href,
    };
  }

  const before = parseCandidateCard(nextCard);
  const geekKey = before.geekKey || before.cardKey || before.id || before.name;
  if (geekKey) {
    seenGeekKeys.add(geekKey);
    currentCandidateGeekKey = geekKey;
  }

  const primaryClickTarget =
    nextCard.querySelector('.card-inner[data-geek]') ||
    nextCard.querySelector('.name') ||
    nextCard.querySelector('.candidate-info') ||
    nextCard;

  await humanMoveAndClick(primaryClickTarget);
  await wait(randomBetween(1000, 1600));

  const dialog = getActiveDialog();
  if (!dialog) {
    const secondaryClickTarget =
      nextCard.querySelector('.name') ||
      nextCard.querySelector('.avatar') ||
      nextCard;

    await humanMoveAndClick(secondaryClickTarget);
    await wait(randomBetween(1200, 1800));
  }

  const retriedDialog = getActiveDialog();
  if (!retriedDialog) {
    return {
      exhausted: false,
      error: '未成功打开候选人简历弹窗，已跳过该候选人',
      candidate: before,
      seenCount: seenGeekKeys.size,
      dialogVisible: false,
    };
  }

  return {
    exhausted: false,
    candidate: parseDialogCandidate(retriedDialog, before),
    dialogVisible: true,
    currentUrl: window.location.href,
    seenCount: seenGeekKeys.size,
  };
}

async function bossReviewCurrentCandidateResume(payload) {
  const dialog = getActiveDialog();
  if (!dialog) {
    return {
      error: '未找到正在查看的简历弹窗',
    };
  }

  const durationMs = Math.max(1000, Number(payload?.durationMs || 1000));
  const endAt = Date.now() + durationMs;
  const scrollContainer =
    dialog.querySelector('.dialog-body') ||
    dialog.querySelector('.resume-detail') ||
    dialog.querySelector('.resume-body') ||
    dialog.querySelector('.dialog-content') ||
    dialog;

  let actions = 0;
  while (Date.now() < endAt) {
    const remaining = endAt - Date.now();
    const stepDelay = Math.min(remaining, randomBetween(1200, 2800));
    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - (scrollContainer.clientHeight || 0)
    );

    if (maxScrollTop > 0) {
      const nextTop = Math.min(
        maxScrollTop,
        Math.max(0, scrollContainer.scrollTop + randomBetween(120, 320))
      );
      scrollContainer.scrollTo({
        top: nextTop,
        behavior: 'smooth',
      });
      actions += 1;
    }

    const hoverTarget = dialog.querySelector('.resume-user-info') || dialog;
    if (hoverTarget instanceof HTMLElement) {
      const rect = hoverTarget.getBoundingClientRect();
      const point = {
        x: rect.left + Math.max(10, Math.floor(rect.width * 0.5)) + randomBetween(-18, 18),
        y: rect.top + Math.max(10, Math.floor(rect.height * 0.4)) + randomBetween(-12, 12),
      };
      dispatchMouseLikeEvent(hoverTarget, 'mousemove', rect, point);
    }

    await wait(stepDelay);
  }

  return {
    success: true,
    durationMs,
    actions,
  };
}

async function bossGreetCurrentCandidate() {
  const dialog = getActiveDialog();
  if (!dialog) {
    return {
      error: '未打开候选人简历弹窗，禁止直接打招呼',
    };
  }

  const button = dialog.querySelector('.btn-v2.btn-sure-v2.btn-greet');
  if (!(button instanceof HTMLElement)) {
    return {
      error: '简历弹窗内未找到打招呼按钮',
    };
  }

  const buttonTextBefore = normalizeText(button.textContent || '');
  await humanMoveAndClick(button);
  await wait(randomBetween(850, 1200));

  return {
    candidateKey: currentCandidateGeekKey,
    buttonTextBefore,
    buttonTextAfter: normalizeText(button.textContent || ''),
  };
}

async function bossSkipCurrentCandidate() {
  const closed = await closeDialog();
  await wait(randomBetween(300, 600));
  return {
    candidateKey: currentCandidateGeekKey,
    closed,
  };
}

async function bossResetSeenCandidates() {
  seenGeekKeys = new Set();
  currentCandidateGeekKey = null;
  await closeDialog();
  return {
    success: true,
  };
}

async function bossInspectFirstCandidate() {
  return bossInspectNextCandidate({ resetSeen: true });
}

async function bossGreetFirstCandidate() {
  return bossGreetCurrentCandidate();
}

async function waitForSelector(selector, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
    await wait(250);
  }
  return null;
}

async function bossOpenChatPage() {
  if (!window.location.href.includes('/web/chat/index')) {
    window.location.href = BOSS_URLS.chat;
    await wait(1800);
  }

  const session = await waitForSelector('.geek-item', 12000);
  return {
    url: window.location.href,
    ready: Boolean(session),
  };
}

function parseChatSession(item) {
  const text = (item.textContent || '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  let cursor = 0;
  let unreadCount = 0;

  if (text[cursor] && /^\d+$/.test(text[cursor])) {
    unreadCount = Number.parseInt(text[cursor], 10);
    cursor += 1;
  }

  const lastMessageTime = text[cursor] || '';
  const candidateName = text[cursor + 1] || '';
  const lastMessage = text.slice(cursor + 3).join(' ') || text[cursor + 2] || '';

  return {
    candidateId: item.getAttribute('data-id') || '',
    candidateName,
    lastMessage,
    lastMessageTime,
    unreadCount,
    hasNewMessage: unreadCount > 0,
  };
}

async function bossGetChatSessions() {
  await bossOpenChatPage();
  const items = Array.from(document.querySelectorAll('.geek-item'));
  return items
    .map((item) => parseChatSession(item))
    .filter((item) => item.candidateId);
}

async function openChatSession(candidateId) {
  await bossOpenChatPage();
  const target = document.querySelector(`.geek-item[data-id="${candidateId}"]`);
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  await humanMoveAndClick(target);
  await wait(randomBetween(700, 1200));
  return true;
}

function parseChatMessage(item, candidateId, index) {
  const content = normalizeText(
    item.querySelector('.text')?.textContent || item.textContent || ''
  );
  const rawTime = item.querySelector('.time')?.textContent?.trim() || '';
  const isSelf = item.classList.contains('item-myself');
  const type = item.querySelector('img')
    ? 'image'
    : /微信|vx|电话|手机号|邮箱/i.test(content)
      ? 'contact'
      : /简历/.test(content)
        ? 'resume'
        : 'text';

  return {
    id: `${candidateId}-${index}`,
    content,
    sender: isSelf ? 'hr' : 'candidate',
    rawTime,
    type,
  };
}

async function bossGetChatHistory(payload) {
  const candidateId = String(payload?.candidateId || '').trim();
  if (!candidateId) {
    return {
      error: '缺少候选人 ID',
    };
  }

  const opened = await openChatSession(candidateId);
  if (!opened) {
    return {
      error: '未找到对应聊天会话',
    };
  }

  const items = Array.from(document.querySelectorAll('.item-friend, .item-myself'));
  return {
    candidateId,
    messages: items
      .map((item, index) => parseChatMessage(item, candidateId, index))
      .filter((item) => item.content),
  };
}

async function humanTypeIntoEditor(editor, text) {
  editor.focus();
  editor.textContent = '';
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));
  await wait(randomBetween(180, 320));

  let current = '';
  for (const char of text) {
    current += char;
    editor.textContent = current;
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    await wait(randomBetween(45, 120));
  }
}

async function bossReplyMessage(payload) {
  const candidateId = String(payload?.candidateId || '').trim();
  const message = String(payload?.message || '').trim();
  if (!candidateId || !message) {
    return {
      error: '缺少候选人 ID 或回复内容',
    };
  }

  const opened = await openChatSession(candidateId);
  if (!opened) {
    return {
      error: '未找到对应聊天会话',
    };
  }

  const editor = await waitForSelector('#boss-chat-editor-input', 8000);
  if (!(editor instanceof HTMLElement)) {
    return {
      error: '未找到聊天输入框',
    };
  }

  await humanTypeIntoEditor(editor, message);
  await wait(randomBetween(250, 500));

  const sendButton = document.querySelector('.submit, .submit-content');
  if (!(sendButton instanceof HTMLElement)) {
    return {
      error: '未找到发送按钮',
    };
  }

  await humanMoveAndClick(sendButton);
  await wait(randomBetween(700, 1200));

  return {
    candidateId,
    message,
    success: true,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type !== 'BOSS_COMMAND') {
        sendResponse({
          ok: false,
          error: '未知 Boss 指令',
        });
        return;
      }

      let result;
      switch (message.command) {
        case 'boss.getPageInfo':
          result = await bossGetPageInfo();
          break;
        case 'boss.selectRecommendJob':
          result = await bossSelectRecommendJob(message.payload);
          break;
        case 'boss.inspectFirstCandidate':
          result = await bossInspectFirstCandidate();
          break;
        case 'boss.greetFirstCandidate':
          result = await bossGreetFirstCandidate();
          break;
        case 'boss.inspectNextCandidate':
          result = await bossInspectNextCandidate(message.payload);
          break;
        case 'boss.reviewCurrentCandidateResume':
          result = await bossReviewCurrentCandidateResume(message.payload);
          break;
        case 'boss.greetCurrentCandidate':
          result = await bossGreetCurrentCandidate();
          break;
        case 'boss.skipCurrentCandidate':
          result = await bossSkipCurrentCandidate();
          break;
        case 'boss.resetSeenCandidates':
          result = await bossResetSeenCandidates();
          break;
        case 'boss.openChatPage':
          result = await bossOpenChatPage();
          break;
        case 'boss.getChatSessions':
          result = await bossGetChatSessions();
          break;
        case 'boss.getChatHistory':
          result = await bossGetChatHistory(message.payload);
          break;
        case 'boss.replyMessage':
          result = await bossReplyMessage(message.payload);
          break;
        default:
          sendResponse({
            ok: false,
            error: `未知 Boss 命令：${message.command}`,
          });
          return;
      }

      sendResponse({
        ok: true,
        data: result,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});
})();
