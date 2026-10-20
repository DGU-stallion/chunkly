/**
 * Background service worker：注册右键菜单触发切分，处理设置页的自定义域名权限申请。
 */

const MENU_ID = "chunkly-chunk-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "用 Chunkly 切分选中文本",
    contexts: ["selection"],
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "CHUNKLY_TRIGGER" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REQUEST_HOST_PERMISSION" && typeof message.origin === "string") {
    chrome.permissions
      .request({ origins: [message.origin] })
      .then((granted) => sendResponse({ granted }))
      .catch(() => sendResponse({ granted: false }));
    return true; // 异步响应
  }
  return undefined;
});
