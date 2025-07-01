// 插件安装或更新时初始化设置
chrome.runtime.onInstalled.addListener(function(details) {
  // 初始化默认设置 - 自定义采集不设置默认值，保持空白
  chrome.storage.sync.get(['numberSelector', 'questionSelector', 'optionsSelector'], function(items) {
    // 不设置默认选择器，让用户自行配置
  });
});

// 监听来自popup或content脚本的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'getSettings') {
    // 获取设置
    chrome.storage.sync.get(['numberSelector', 'questionSelector', 'optionsSelector'], function(items) {
      sendResponse(items);
    });
    return true; // 保持消息通道开放以便异步响应
  } else if (message.action === 'saveSettings') {
    // 保存设置
    chrome.storage.sync.set({
      numberSelector: message.settings.numberSelector,
      questionSelector: message.settings.questionSelector,
      optionsSelector: message.settings.optionsSelector
    }, function() {
      sendResponse({success: true});
    });
    return true;
  } else if (message.action === 'getIcveSettings') {
    // 获取ICVE预设
    sendResponse({
      numberSelector: 'div.title.titleTwo',
      questionSelector: 'h5 span.htmlP.ql-editor',
      optionsSelector: 'span[data-v-6ec4bbdf]:not(.htmlP), span.htmlP.ql-editor'
    });
    return true;
  }
});

// 监听标签页更新，以便在需要时重新注入内容脚本
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    // 仅在网页URL上运行，避免在Chrome内部页面或设置页面上运行
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      files: ['content.js']
    }).catch(error => {
      console.error('内容脚本注入错误:', error);
    });
  }
});

// 立即设置选择器默认值（确保不需要重新安装插件）
chrome.storage.sync.set({
  numberSelector: 'div.title.titleTwo',
  questionSelector: 'h5 span.htmlP.ql-editor',
  optionsSelector: 'span[data-v-6ec4bbdf]:not(.htmlP), span.htmlP.ql-editor'
});

// 监听来自content.js的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'log') {
    console.log('老范网页题目采集助手:', message.data);
  }
  return true;
}); 