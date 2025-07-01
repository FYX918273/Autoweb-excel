// 监听来自popup.js的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'collectQuestions') {
    try {
      const data = collectQuestions(message.settings);
      console.log('采集到的数据:', data);
      sendResponse({ data: data });
    } catch (error) {
      console.error('采集数据时发生错误:', error);
      sendResponse({ error: error.message });
    }
  } else if (message.action === 'analyzeSampleAndCollect') {
    try {
      // 分析样本HTML，生成选择器，然后采集所有题目
      const result = analyzeSampleAndCollect(message.sampleHtml);
      sendResponse({ data: result });
    } catch (error) {
      console.error('分析样本和采集数据时出错:', error);
      sendResponse({ error: error.message });
    }
  } else if (message.action === 'icveCollect') {
    try {
      // 使用ICVE预设选择器采集
      const data = collectQuestionsWithPreset('icve');
      console.log('ICVE采集数据:', data);
      sendResponse({ data: data });
    } catch (error) {
      console.error('ICVE采集数据时发生错误:', error);
      sendResponse({ error: error.message });
    }
  } else if (message.action === 'autoAnswer') {
    try {
      // 接收答案数据并执行自动答题
      const answers = message.answers;
      console.log('接收到自动答题请求:', answers);
      
      // 先回复开始状态
      sendResponse({ status: 'started' });
      
      // 执行自动答题
      autoAnswer(answers);
    } catch (error) {
      console.error('自动答题时发生错误:', error);
      chrome.runtime.sendMessage({
        action: 'answerError',
        error: error.message
      });
      sendResponse({ error: error.message });
    }
  }
  return true; // 保持消息通道开放以便异步响应
});

// 分析样本HTML并采集所有题目
function analyzeSampleAndCollect(sampleHtml) {
  console.log('开始分析样本HTML...');
  
  try {
    // 1. 创建临时DOM解析样本HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sampleHtml.trim();
    
    // 2. 分析样本结构，生成选择器
    const selectors = analyzeSampleStructure(tempDiv.firstChild);
    console.log('分析出的选择器:', selectors);
    
    if (!selectors.questionContainer) {
      throw new Error('无法识别题目容器结构');
    }
    
    // 3. 使用生成的选择器查找页面中的所有题目
    const allQuestions = collectAllQuestions(selectors);
    console.log('采集到题目数量:', allQuestions.length);
    
    return allQuestions;
  } catch (error) {
    console.error('分析样本过程中出错:', error);
    throw error;
  }
}

// 分析样本结构，生成选择器
function analyzeSampleStructure(sampleElement) {
  const selectors = {
    questionContainer: null,
    title: null,
    question: null,
    optionsList: null,
    optionItems: null,
    optionLabel: null,
    optionContent: null
  };
  
  // 分析整个题目容器
  if (sampleElement.classList && sampleElement.classList.length > 0) {
    // 使用类名作为选择器
    const classNames = Array.from(sampleElement.classList).join('.');
    selectors.questionContainer = `.${classNames}`;
  } else if (sampleElement.id) {
    // 使用ID作为选择器
    selectors.questionContainer = `#${sampleElement.id}`;
  } else {
    // 使用标签名作为选择器
    selectors.questionContainer = sampleElement.tagName.toLowerCase();
  }
  
  // 查找题目标题（通常包含序号和题型）
  const titleElement = sampleElement.querySelector('.title, .question-title, h3, h4, [class*="title"], [class*="header"]');
  if (titleElement) {
    if (titleElement.classList && titleElement.classList.length > 0) {
      selectors.title = `.${Array.from(titleElement.classList).join('.')}`;
    } else {
      selectors.title = titleElement.tagName.toLowerCase();
    }
  }
  
  // 查找题目内容
  const questionElement = sampleElement.querySelector('h5, .question-content, p, [class*="content"], span.htmlP');
  if (questionElement) {
    // 创建选择器
    if (questionElement.classList && questionElement.classList.length > 0) {
      selectors.question = `.${Array.from(questionElement.classList).join('.')}`;
    } else {
      selectors.question = questionElement.tagName.toLowerCase();
    }
    
    // 如果题目内容在span标签中，可能需要进一步细化
    if (questionElement.tagName.toLowerCase() === 'h5' && questionElement.querySelector('span')) {
      const span = questionElement.querySelector('span');
      if (span.classList && span.classList.length > 0) {
        selectors.question = `h5 .${Array.from(span.classList).join('.')}`;
      } else {
        selectors.question = 'h5 span';
      }
    }
  }
  
  // 查找选项列表容器
  const optionsContainer = sampleElement.querySelector('.optionList, .options, .answers, [class*="option"], [class*="answer"]');
  if (optionsContainer) {
    if (optionsContainer.classList && optionsContainer.classList.length > 0) {
      selectors.optionsList = `.${Array.from(optionsContainer.classList).join('.')}`;
    } else {
      selectors.optionsList = optionsContainer.tagName.toLowerCase();
    }
    
    // 查找单个选项元素
    const optionItem = optionsContainer.querySelector('.el-radio, .option, .answer, [class*="option"], li, .el-checkbox');
    if (optionItem) {
      if (optionItem.classList && optionItem.classList.length > 0) {
        selectors.optionItems = `.${Array.from(optionItem.classList).join('.')}`;
      } else {
        selectors.optionItems = optionItem.tagName.toLowerCase();
      }
      
      // 查找选项字母标签和内容
      const optionLabel = optionItem.querySelector('span:not(.htmlP), label, [class*="label"]');
      if (optionLabel) {
        if (optionLabel.classList && optionLabel.classList.length > 0) {
          selectors.optionLabel = `.${Array.from(optionLabel.classList).join('.')}`;
        } else {
          const dataAttrs = optionLabel.getAttribute('data-v-6ec4bbdf') !== null ? '[data-v-6ec4bbdf]:not(.htmlP)' : '';
          selectors.optionLabel = `${optionLabel.tagName.toLowerCase()}${dataAttrs}`;
        }
      }
      
      const optionContent = optionItem.querySelector('.htmlP, .ql-editor, [class*="content"], p');
      if (optionContent) {
        if (optionContent.classList && optionContent.classList.length > 0) {
          selectors.optionContent = `.${Array.from(optionContent.classList).join('.')}`;
        } else {
          selectors.optionContent = optionContent.tagName.toLowerCase();
        }
      }
    }
  } else {
    // 如果找不到选项列表容器，尝试直接查找选项元素
    // 这种情况可能选项直接位于题目容器中，而不是嵌套在专门的选项列表中
    const optionLetters = sampleElement.querySelectorAll('span, label');
    for (const el of optionLetters) {
      const text = el.textContent.trim();
      if (text === 'A.' || text === 'A. ' || text === 'A') {
        if (el.classList && el.classList.length > 0) {
          selectors.optionLabel = `.${Array.from(el.classList).join('.')}`;
        } else {
          const dataAttrs = el.getAttribute('data-v-6ec4bbdf') !== null ? '[data-v-6ec4bbdf]' : '';
          selectors.optionLabel = `${el.tagName.toLowerCase()}${dataAttrs}`;
        }
        break;
      }
    }
    
    const contentElements = sampleElement.querySelectorAll('.htmlP, .ql-editor, [class*="content"], p');
    if (contentElements.length > 0) {
      const firstContent = contentElements[0];
      if (firstContent.classList && firstContent.classList.length > 0) {
        selectors.optionContent = `.${Array.from(firstContent.classList).join('.')}`;
      } else {
        selectors.optionContent = firstContent.tagName.toLowerCase();
      }
    }
  }
  
  return selectors;
}

// 使用生成的选择器采集所有题目
function collectAllQuestions(selectors) {
  const result = [];
  
  // 找到所有题目容器
  const allQuestionContainers = document.querySelectorAll(selectors.questionContainer);
  console.log(`找到 ${allQuestionContainers.length} 个题目容器`);
  
  for (let i = 0; i < allQuestionContainers.length; i++) {
    const container = allQuestionContainers[i];
    
    try {
      // 1. 提取题目标题（序号和题型）
      let titleText = '';
      let titleElement = null;
      
      if (selectors.title) {
        titleElement = container.querySelector(selectors.title);
        if (titleElement) {
          titleText = titleElement.textContent.trim();
        }
      } else {
        // 尝试查找标题元素
        titleElement = container.querySelector('.title, .question-title, h3, h4');
        if (titleElement) {
          titleText = titleElement.textContent.trim();
        }
      }
      
      // 提取序号
      let number = '';
      const numberMatch = titleText.match(/(\d+)\./);
      if (numberMatch) {
        number = numberMatch[1];
      } else {
        // 如果标题中没有找到序号，使用索引作为序号
        number = (i + 1).toString();
      }
      
      // 提取题型
      let questionType = '';
      const typeMatch = titleText.match(/【(.+?)】/);
      if (typeMatch) {
        questionType = typeMatch[1];
      }
      
      // 2. 提取题目内容
      let questionText = '';
      
      if (selectors.question) {
        const questionElement = container.querySelector(selectors.question);
        if (questionElement) {
          questionText = questionElement.textContent.trim();
        }
      }
      
      // 3. 提取选项 - 自动识别选项数量
      const optionMap = new Map(); // 使用Map存储选项，键为选项字母，值为选项内容
      
      if (selectors.optionsList && selectors.optionItems) {
        // 如果有选项列表和选项项选择器
        const optionsList = container.querySelector(selectors.optionsList);
        if (optionsList) {
          const optionItems = optionsList.querySelectorAll(selectors.optionItems);
          
          optionItems.forEach((item) => {
            let optionLetter = '';
            let optionContent = '';
            
            // 提取选项字母
            if (selectors.optionLabel) {
              const labelElement = item.querySelector(selectors.optionLabel);
              if (labelElement) {
                const labelText = labelElement.textContent.trim();
                // 提取选项字母 (A, B, C, ...)
                const letterMatch = labelText.match(/^([A-Z])[\.。\s]?/);
                if (letterMatch) {
                  optionLetter = letterMatch[1]; // 获取匹配的字母
                }
              }
            }
            
            // 如果没有通过选择器找到字母，尝试从整个选项文本中提取
            if (!optionLetter) {
              const itemText = item.textContent.trim();
              const letterMatch = itemText.match(/^([A-Z])[\.。\s]/);
              if (letterMatch) {
                optionLetter = letterMatch[1];
              }
            }
            
            // 提取选项内容
            if (selectors.optionContent) {
              const contentElement = item.querySelector(selectors.optionContent);
              if (contentElement) {
                optionContent = contentElement.textContent.trim();
              }
            } else {
              // 如果没有内容选择器，使用选项项的文本，并移除选项字母部分
              optionContent = item.textContent.trim().replace(/^[A-Z][\.。\s]?/, '');
            }
            
            // 如果找到了选项字母和内容，添加到Map中
            if (optionLetter && optionContent) {
              optionMap.set(optionLetter, optionContent);
            }
          });
        }
      } else if (selectors.optionLabel && selectors.optionContent) {
        // 如果有选项标签和内容选择器，但没有明确的选项列表结构
        // 这种情况可能是选项直接散布在容器中，而不是嵌套在特定列表中
        
        // 获取所有选项标签
        const optionLabels = container.querySelectorAll(selectors.optionLabel);
        
        for (const labelElement of optionLabels) {
          const labelText = labelElement.textContent.trim();
          // 提取选项字母 (A, B, C, ...)
          const letterMatch = labelText.match(/^([A-Z])[\.。\s]?/);
          
          if (letterMatch) {
            const optionLetter = letterMatch[1];
            
            // 查找此标签后的内容元素
            let contentElement = labelElement.nextElementSibling;
            if (contentElement && (selectors.optionContent ? contentElement.matches(selectors.optionContent) : true)) {
              const optionContent = contentElement.textContent.trim();
              
              // 添加到选项Map
              optionMap.set(optionLetter, optionContent);
            }
          }
        }
      } else {
        // 最后一种尝试：直接查找所有元素并分析它们的文本
        const allElements = Array.from(container.querySelectorAll('*'));
        
        for (let j = 0; j < allElements.length; j++) {
          const el = allElements[j];
          const text = el.textContent.trim();
          
          // 检查是否是选项字母
          const letterMatch = text.match(/^([A-Z])[\.。\s]?$/);
          if (letterMatch) {
            const optionLetter = letterMatch[1];
            
            // 查找内容元素
            for (let k = j + 1; k < allElements.length; k++) {
              const contentEl = allElements[k];
              const contentText = contentEl.textContent.trim();
              // 确保内容不是另一个选项字母
              if (contentText && !isOptionLetter(contentText)) {
                optionMap.set(optionLetter, contentText);
                break;
              }
            }
          }
        }
      }
      
      // 构建题目数据对象
      const questionData = {
        number: number,
        type: questionType,
        question: questionText,
      };
      
      // 添加选项 - 按字母顺序
      const optionLetters = Array.from(optionMap.keys()).sort();
      for (const letter of optionLetters) {
        questionData[`option${letter}`] = optionMap.get(letter);
      }
      
      result.push(questionData);
      
    } catch (error) {
      console.error(`处理第 ${i + 1} 个题目时出错:`, error);
    }
  }
  
  return result;
}

// 使用预设选择器采集题目
function collectQuestionsWithPreset(presetName) {
  const presets = {
    'icve': {
      numberSelector: 'div.title.titleTwo',
      questionSelector: 'h5 span.htmlP.ql-editor',
      optionsSelector: 'span[data-v-6ec4bbdf]:not(.htmlP), span.htmlP.ql-editor'
    }
    // 可以添加更多预设
  };
  
  const preset = presets[presetName];
  if (!preset) {
    throw new Error(`未找到预设: ${presetName}`);
  }
  
  return collectQuestions(preset);
}

// 根据选择器采集题目数据
function collectQuestions(settings) {
  try {
    console.log('开始采集题目，使用选择器:', settings);
    const result = [];
    
    // 获取序号和题型元素
    const titleElements = getElementsFromSelector(settings.numberSelector);
    console.log('找到标题元素数量:', titleElements.length);
    
    // 获取题目元素
    const questionElements = getElementsFromSelector(settings.questionSelector);
    console.log('找到题目元素数量:', questionElements.length);
    
    // 获取所有选项元素（不分组）
    const allOptionsElements = getElementsFromSelector(settings.optionsSelector);
    console.log('找到选项元素数量:', allOptionsElements.length);
    
    // 确定采集的题目数量
    const count = Math.min(titleElements.length, questionElements.length);
    if (count === 0) {
      console.warn('未找到题目元素');
      return [];
    }
    
    // 更高级的选项分组方法：基于位置关系和HTML结构
    // 从每个题目标题元素找到下一个题目标题之间的选项
    const questionGroups = [];
    
    // 首先确定每个题目的Y坐标（垂直位置）
    const questionPositions = [];
    for (let i = 0; i < count; i++) {
      const titleRect = titleElements[i].getBoundingClientRect();
      const questionRect = questionElements[i].getBoundingClientRect();
      
      // 记录题目位置信息
      questionPositions.push({
        index: i,
        titleTop: titleRect.top,
        questionTop: questionRect.top,
        questionBottom: questionRect.bottom
      });
    }
    
    // 按垂直位置排序
    questionPositions.sort((a, b) => a.titleTop - b.titleTop);
    
    // 根据选项元素的垂直位置，将它们分配给最近的题目
    const optionGroups = Array(count).fill().map(() => []);
    
    // 对每个选项元素，找到它属于哪个题目
    for (let i = 0; i < allOptionsElements.length; i++) {
      const optionRect = allOptionsElements[i].getBoundingClientRect();
      const optionTop = optionRect.top;
      
      // 找到当前选项应该属于哪个题目
      // 规则：属于紧随其后的第一个题目
      let assignedQuestion = -1;
      
      for (let j = 0; j < questionPositions.length - 1; j++) {
        const currentQuestion = questionPositions[j];
        const nextQuestion = questionPositions[j + 1];
        
        // 如果选项在当前题目之后、下一题之前
        if (optionTop >= currentQuestion.questionBottom && 
            optionTop < nextQuestion.titleTop) {
          assignedQuestion = j;
          break;
        }
      }
      
      // 如果选项在最后一题之后
      if (assignedQuestion === -1 && 
          optionTop >= questionPositions[questionPositions.length - 1].questionBottom) {
        assignedQuestion = questionPositions.length - 1;
      }
      
      // 如果找到了对应题目，添加到该题目的选项组
      if (assignedQuestion !== -1) {
        optionGroups[assignedQuestion].push(allOptionsElements[i]);
      }
    }
    
    // 处理每个题目的选项组
    for (let i = 0; i < count; i++) {
      const originalIndex = questionPositions[i].index;
      
      // 从题目标题中提取序号和题型
      const titleText = titleElements[originalIndex] ? titleElements[originalIndex].textContent.trim() : '';
      console.log('题目标题文本:', titleText);
      
      const numberMatch = titleText.match(/(\d+)\./);
      const typeMatch = titleText.match(/【(.+?)】/);
      
      const number = numberMatch ? numberMatch[1] : `${i + 1}`;
      const questionType = typeMatch ? typeMatch[1] : '';
      
      // 获取题目文本
      const question = questionElements[originalIndex] ? questionElements[originalIndex].textContent.trim() : '';
      
      // 使用Map存储选项，自动识别选项数量
      const optionMap = new Map();
      
      // 获取当前题目的选项
      const options = optionGroups[i];
      console.log(`题目${i+1}(${number})的选项数量:`, options.length);
      
      // 分析选项结构
      let currentLetter = '';
      
      for (let j = 0; j < options.length; j++) {
        const text = options[j].textContent.trim();
        
        // 检测选项字母
        const letterMatch = text.match(/^([A-Z])[\.。\s]?$/);
        if (letterMatch) {
          currentLetter = letterMatch[1];
        } else if (currentLetter) {
          // 如果当前有字母，则将文本添加到相应选项
          optionMap.set(currentLetter, text);
          currentLetter = ''; // 重置当前字母
        }
      }
      
      // 构建题目数据对象
      const item = {
        number: number,
        type: questionType,
        question: question
      };
      
      // 添加选项 - 按字母顺序
      const optionLetters = Array.from(optionMap.keys()).sort();
      for (const letter of optionLetters) {
        item[`option${letter}`] = optionMap.get(letter);
      }
      
      result.push(item);
    }
    
    return result;
  } catch (error) {
    console.error('采集题目时出错:', error);
    throw error; // 重新抛出错误以便通知调用者
  }
}

// 根据选择器获取元素
function getElementsFromSelector(selector) {
  if (!selector) return [];
  
  try {
    // 判断是否为XPath
    if (selector.startsWith('/')) {
      return getElementsFromXPath(selector);
    } else {
      // CSS选择器
      return Array.from(document.querySelectorAll(selector));
    }
  } catch (error) {
    console.error('选择器解析错误:', error);
    return [];
  }
}

// 从XPath获取元素
function getElementsFromXPath(xpath) {
  const result = [];
  const xpathResult = document.evaluate(
    xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
  );
  
  for (let i = 0; i < xpathResult.snapshotLength; i++) {
    result.push(xpathResult.snapshotItem(i));
  }
  
  return result;
}

// 获取选项组 - 处理选项可能按题目分组的情况
function getOptionsGroups(selector) {
  if (!selector) return [];
  
  try {
    // 如果选择器包含双分隔符 ">>" 表示有两级选择器
    if (selector.includes('>>')) {
      const [groupSelector, itemSelector] = selector.split('>>').map(s => s.trim());
      const groups = getElementsFromSelector(groupSelector);
      
      return groups.map(group => {
        if (itemSelector.startsWith('/')) {
          // XPath选择器
          const result = [];
          const xpathResult = document.evaluate(
            itemSelector, group, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
          );
          
          for (let i = 0; i < xpathResult.snapshotLength; i++) {
            result.push(xpathResult.snapshotItem(i));
          }
          
          return result;
        } else {
          // CSS选择器
          return Array.from(group.querySelectorAll(itemSelector));
        }
      });
    } else {
      // 获取所有选项
      return [];
    }
  } catch (error) {
    console.error('分析选项组时出错:', error);
    return [];
  }
}

// 辅助函数：检查一个文本是否为选项字母
function isOptionLetter(text) {
  return /^[A-Z][\.。\s]?$/.test(text);
}

// 自动答题功能实现
async function autoAnswer(answers) {
  try {
    // 查找页面上的所有题目
    const questions = document.querySelectorAll('.subjectDet');
    
    if (questions.length === 0) {
      chrome.runtime.sendMessage({
        action: 'answerError',
        error: '页面上未找到题目，请确保在正确的题目页面'
      });
      return;
    }
    
    console.log(`找到 ${questions.length} 个题目，开始自动答题`);
    console.log('答案数据:', answers);
    
    let answeredCount = 0;
    
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      // 获取题号
      const titleElement = question.querySelector('.title.titleTwo');
      if (!titleElement) {
        console.log('无法找到题目标题元素，跳过');
        continue;
      }
      
      // 从题目标题中提取题号
      const titleText = titleElement.textContent.trim();
      console.log(`题目标题文本: ${titleText}`);
      const titleMatch = titleText.match(/(\d+)/);
      if (!titleMatch) {
        console.log('无法从标题中提取题号，跳过');
        continue;
      }
      
      const questionNumber = parseInt(titleMatch[1]);
      console.log(`处理题号: ${questionNumber}`);
      
      // 查找对应的答案
      const answer = answers.find(a => a.number === questionNumber);
      if (!answer) {
        console.log(`题号 ${questionNumber} 没有找到匹配的答案，跳过`);
        continue;
      }
      
      // 获取题目文本用于显示
      const questionText = question.querySelector('h5 span.htmlP.ql-editor')?.textContent || '无题目文本';
      
      // 通知答题进度
      chrome.runtime.sendMessage({
        action: 'answerProgressUpdate',
        current: i + 1,
        total: questions.length,
        questionText: questionText.substring(0, 30) + (questionText.length > 30 ? '...' : '')
      });
      
      console.log(`处理第 ${questionNumber} 题，正确答案: ${answer.option}`);
      
      // 判断是单选题还是多选题
      const isMultiple = answer.isMultiple || answer.option.includes('、') || answer.option.length > 1;
      console.log(`题目类型: ${isMultiple ? '多选题' : '单选题'}`);
      
      if (isMultiple) {
        // 处理多选题
        // 首先尝试使用.el-checkbox
        let checkboxes = question.querySelectorAll('.el-checkbox');
        
        // 如果找不到.el-checkbox，尝试其他可能的多选框选择器
        if (checkboxes.length === 0) {
          console.log('未找到.el-checkbox，尝试其他选择器');
          checkboxes = question.querySelectorAll('label.checkbox, input[type="checkbox"], .checkbox-item, .el-radio');
        }
        
        // 如果仍然找不到，尝试通用选择器
        if (checkboxes.length === 0) {
          console.log('尝试查找通用选项元素');
          const allOptions = question.querySelectorAll('label, .option-item');
          // 过滤可能是选项的元素
          checkboxes = Array.from(allOptions).filter(el => {
            const text = el.textContent.trim();
            return /^[A-Z]\./.test(text) || el.querySelector('input[type="checkbox"]') || el.querySelector('input[type="radio"]');
          });
        }
        
        // 特殊情况：如果题目包含单选按钮，但答案是多选，可能是界面显示问题
        if (checkboxes.length === 0) {
          console.log('未找到复选框，尝试将单选按钮视为多选项');
          checkboxes = question.querySelectorAll('.el-radio');
        }
        
        console.log(`找到 ${checkboxes.length} 个可能的多选框选项`);
        
        if (checkboxes.length > 0) {
          let hasMatched = false;
          // 解析答案中的选项，支持"A、B、C、D"和"ABCD"两种格式
          let selectedOptions;
          if (answer.option.includes('、')) {
            selectedOptions = answer.option.split('、');
          } else {
            selectedOptions = Array.from(answer.option);
          }
          
          console.log(`多选题选项: ${selectedOptions.join(', ')}`);
          
          // 首先为所有选项元素创建一个映射表
          const optionMap = new Map();
          
          // 收集所有选项和对应的字母
          checkboxes.forEach((checkbox, index) => {
            // 尝试多种方式获取选项字母
            let checkboxLetter = '';
            
            // 方法1：直接从内容中提取
            const text = checkbox.textContent.trim();
            const letterMatch = text.match(/^([A-Z])[\.。\s]/);
            if (letterMatch) {
              checkboxLetter = letterMatch[1];
            }
            
            // 方法2：查找特定元素
            if (!checkboxLetter) {
              const letterEl = checkbox.querySelector('span[data-v-6ec4bbdf], .option-label, .checkbox-label');
              if (letterEl) {
                const elText = letterEl.textContent.trim();
                const elLetterMatch = elText.match(/^([A-Z])[\.。\s]?/);
                if (elLetterMatch) {
                  checkboxLetter = elLetterMatch[1];
                }
              }
            }
            
            // 方法3：从文本节点中提取
            if (!checkboxLetter) {
              // 递归获取所有文本节点
              const textNodes = [];
              const getTextNodes = (node) => {
                if (node.nodeType === 3) { // 文本节点
                  textNodes.push(node);
                } else {
                  for (const child of node.childNodes) {
                    getTextNodes(child);
                  }
                }
              };
              getTextNodes(checkbox);
              
              // 查找包含字母的文本节点
              for (const textNode of textNodes) {
                const letterMatch = textNode.nodeValue.trim().match(/^([A-Z])[\.。\s]/);
                if (letterMatch) {
                  checkboxLetter = letterMatch[1];
                  break;
                }
              }
            }
            
            // 方法4：获取选项内容，用于后续内容匹配
            const optionContent = checkbox.querySelector('span.htmlP.ql-editor')?.textContent.trim() || 
                               checkbox.querySelector('.option-content')?.textContent.trim() || '';
            
            // 将选项添加到映射表
            if (checkboxLetter) {
              optionMap.set(checkboxLetter, { element: checkbox, content: optionContent, index });
              console.log(`映射选项 ${checkboxLetter} -> ${optionContent.substring(0, 20)}...`);
            }
          });
          
          // 分别处理每个选项字母
          for (const optionLetter of selectedOptions) {
            let found = false;
            
            // 先通过字母匹配
            if (optionMap.has(optionLetter)) {
              const option = optionMap.get(optionLetter);
              console.log(`匹配选项: ${optionLetter}`);
              
              // 检查该选项是否已被选中
              const isChecked = option.element.classList.contains('is-checked') || 
                               option.element.querySelector('input:checked') ||
                               option.element.getAttribute('aria-checked') === 'true';
              
              if (!isChecked) {
                // 点击选择
                option.element.click();
                console.log(`已点击选项: ${optionLetter}`);
                found = true;
                hasMatched = true;
                
                // 等待一下，避免操作太快
                await new Promise(resolve => setTimeout(resolve, 300));
              } else {
                console.log(`选项 ${optionLetter} 已经被选中`);
                found = true;
                hasMatched = true;
              }
            }
            
            // 如果没有通过字母找到，尝试更激进的方法
            if (!found) {
              console.log(`未能通过字母找到选项 ${optionLetter}，尝试额外方法`);
              
              // 1. 尝试通过选项在页面中的顺序猜测
              // 假设选项是按ABCD顺序排列的
              const optionIndex = optionLetter.charCodeAt(0) - 'A'.charCodeAt(0);
              if (optionIndex >= 0 && optionIndex < checkboxes.length) {
                const checkbox = checkboxes[optionIndex];
                console.log(`通过索引 ${optionIndex} 匹配选项 ${optionLetter}`);
                
                // 点击选择
                checkbox.click();
                found = true;
                hasMatched = true;
                
                // 等待一下
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
            
            if (!found) {
              console.log(`警告: 未能找到选项 ${optionLetter}`);
            }
          }
          
          if (hasMatched) {
            answeredCount++;
            console.log(`成功匹配多选题 ${questionNumber}`);
          } else {
            console.log(`警告: 多选题 ${questionNumber} 没有成功匹配任何选项`);
          }
        } else {
          console.log(`警告: 多选题 ${questionNumber} 未找到任何多选框元素`);
        }
      } else {
        // 处理单选题
        const radioButtons = question.querySelectorAll('.el-radio');
        console.log(`找到 ${radioButtons.length} 个单选按钮`);
        
        let bestMatch = null;
        let bestMatchScore = 0;
        
        // 收集所有选项的内容和对应的单选按钮
        const allOptions = [];
        
        for (const radio of radioButtons) {
          // 尝试多种方式获取选项字母
          let optionLetter = '';
          const letterEl = radio.querySelector('span[data-v-6ec4bbdf]');
          
          if (letterEl) {
            optionLetter = letterEl.textContent.trim()[0] || '';
          } else {
            // 尝试从整体文本中提取
            const text = radio.textContent.trim();
            const letterMatch = text.match(/^([A-Z])[\.。\s]/);
            if (letterMatch) {
              optionLetter = letterMatch[1];
            }
          }
          
          const optionContent = radio.querySelector('span.htmlP.ql-editor')?.textContent.trim() || 
                              radio.querySelector('.option-content')?.textContent.trim() || '';
          
          allOptions.push({ element: radio, letter: optionLetter, content: optionContent });
          console.log(`选项 ${optionLetter}: ${optionContent.substring(0, 20)}...`);
        }
        
        // 1. 优先通过选项内容进行匹配
        for (const option of allOptions) {
          const contentMatchScore = calculateContentMatchScore(answer.content, option.content);
          console.log(`内容匹配得分 ${option.letter}: ${contentMatchScore}`);
          if (contentMatchScore > bestMatchScore) {
            bestMatchScore = contentMatchScore;
            bestMatch = option;
          }
        }
        
        // 如果内容匹配度高，则选择该选项
        if (bestMatch && bestMatchScore > 0.5) {
          console.log(`通过内容匹配到选项: ${bestMatch.letter} - ${bestMatch.content.substring(0, 20)}...`);
          bestMatch.element.click();
          answeredCount++;
        } else {
          // 2. 如果内容匹配不理想，则尝试通过字母匹配
          const letterMatch = allOptions.find(option => option.letter === answer.option);
          if (letterMatch) {
            console.log(`通过字母匹配到选项: ${letterMatch.letter}`);
            letterMatch.element.click();
            answeredCount++;
          } else {
            console.log(`警告: 未能匹配题号 ${questionNumber} 的任何选项`);
          }
        }
        
        // 等待一下，避免操作太快
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 每道题之间添加小延迟，避免操作太快
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 通知完成
    chrome.runtime.sendMessage({
      action: 'answerCompleted',
      total: answeredCount
    });
    
    console.log(`自动答题完成，成功回答了 ${answeredCount} 道题`);
    
  } catch (error) {
    console.error('自动答题过程中出错:', error);
    chrome.runtime.sendMessage({
      action: 'answerError',
      error: error.message
    });
  }
}

// 计算两段文字内容的匹配度（返回0-1的分数，1表示完全匹配）
function calculateContentMatchScore(answerContent, optionContent) {
  if (!answerContent || !optionContent) return 0;
  
  // 去除空格、标点等干扰因素
  const cleanText1 = answerContent.replace(/[,，。.、；;:：\s]/g, '');
  const cleanText2 = optionContent.replace(/[,，。.、；;:：\s]/g, '');
  
  // 完全匹配
  if (cleanText1 === cleanText2) return 1;
  
  // 如果一方包含另一方（大部分文字）
  if (cleanText1.includes(cleanText2) && cleanText2.length > 10) return 0.9;
  if (cleanText2.includes(cleanText1) && cleanText1.length > 10) return 0.9;
  
  // 如果有部分匹配
  const minMatchLength = Math.min(20, Math.min(cleanText1.length, cleanText2.length) * 0.7); // 最小匹配长度
  
  // 检查前20个字符（或更少）是否有相似度
  const prefix1 = cleanText1.substring(0, Math.min(30, cleanText1.length));
  const prefix2 = cleanText2.substring(0, Math.min(30, cleanText2.length));
  
  if (prefix1.includes(prefix2.substring(0, minMatchLength)) || 
      prefix2.includes(prefix1.substring(0, minMatchLength))) {
    return 0.8;
  }
  
  // 检查任意位置的匹配
  for (let i = 0; i < cleanText1.length - minMatchLength + 1; i++) {
    const subStr = cleanText1.substring(i, i + minMatchLength);
    if (cleanText2.includes(subStr)) {
      return 0.7;
    }
  }
  
  // 检查较短的匹配
  const shortMatchLength = Math.min(10, Math.min(cleanText1.length, cleanText2.length) * 0.5);
  for (let i = 0; i < cleanText1.length - shortMatchLength + 1; i++) {
    const subStr = cleanText1.substring(i, i + shortMatchLength);
    if (cleanText2.includes(subStr)) {
      return 0.6;
    }
  }
  
  return 0;
} 