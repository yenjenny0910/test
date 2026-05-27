const fs = require('fs');
const path = require('path');

/**
 * 基礎行清洗：去除前後空白、中括號內容及前後斜線
 */
function cleanLine(line) {
    line = line.trim();
    if (!line) return "";
    // 移除中括號 [ ... ] 及其內容 (通常是音標)
    line = line.replace(/\[[^\]]*\]/g, ' ');
    // 移除前後的斜線與多餘空格
    line = line.replace(/[\s\/]+$/, '');
    line = line.replace(/^[\s\/]+/, '');
    // 將連續空格合併為單個空格
    line = line.replace(/\s+/g, ' ').trim();
    return line;
}

/**
 * 解析單行單字：完美解決「無詞性」、「多詞性前置」、「詞性夾在中間」等大考中心排版混亂問題
 */
function parseCleanedLine(line) {
    line = line.trim();
    if (!line) return [];

    // 支援的詞性清單
    const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];

    // 1. 第一步：利用中文字元（\u4e00-\u9fff）作為分水嶺，把「英文/詞性區」與「中文定義區」切開
    const splitMatch = line.match(/^([a-zA-Z\s\-'\.\/,1-9]+)([\u4e00-\u9fff].*)$/);
    if (!splitMatch) return []; // 格式完全不符則跳過

    let englishPart = splitMatch[1].trim();
    let defPart = splitMatch[2].trim();

    // 2. 第二步：從 englishPart 裡面，把所有藏在裡面的詞性（Pos）抓出來
    let foundPosInLine = [];
    posList.forEach(pos => {
        let idx = -1;
        while ((idx = englishPart.indexOf(pos, idx + 1)) !== -1) {
            // 確保不是其他單字的一部分（例如 general 裡面的 n.）
            const before = idx === 0 ? ' ' : englishPart[idx - 1];
            const after = idx + pos.length >= englishPart.length ? ' ' : englishPart[idx + pos.length];
            if (/[\s\/,;]/.test(before) && /[\s\/,;]/.test(after)) {
                foundPosInLine.push({ pos: pos, index: idx });
            }
        }
    });

    // 依出現位置排序
    foundPosInLine.sort((a, b) => a.index - b.index);

    let word = "";
    let finalPosList = [];

    // 3. 第三步：根據「詞性出現的位置」來通靈真正的單字是誰
    if (foundPosInLine.length > 0) {
        // 情況 A：詞性在中間（如 "apple n. 蘋果"），第一個詞性左邊的就是單字
        if (foundPosInLine[0].index > 1) {
            word = englishPart.slice(0, foundPosInLine[0].index).trim();
        } 
        // 情況 B：詞性在最前面（如 "vt., vi. drop"），最後一個詞性右邊的才是單字
        else {
            const lastPosObj = foundPosInLine[foundPosInLine.length - 1];
            word = englishPart.slice(lastPosObj.index + lastPosObj.pos.length).trim();
        }

        // 收集這行出現的所有詞性，並做標準化
        foundPosInLine.forEach(item => {
            let p = item.pos;
            if (p === 'a.') p = 'adj.';
            if (p === 'ad.') p = 'adv.';
            if (!finalPosList.includes(p)) finalPosList.push(p);
        });
    } else {
        // 情況 C：完全沒有詞性標記（如 "apple 蘋果"）
        word = englishPart;
    }

    // 4. 清理單字尾端的雜質（如大考中心的重複數字、多餘斜線逗號）
    word = word.replace(/[\/,;\s]+$/, '').replace(/^[\/,;\s]+/, ''); // 拔除首尾標點
    word = word.replace(/([^a-zA-Z0-9])\d+$/, '$1').replace(/[1-9]$/, '').trim(); // 拔除重複序號

    // 清理中文首尾雜質
    defPart = defPart.replace(/^[\s\/,\uff0c\u3001]+|[\s\/,\uff0c\u3001]+$/g, '').trim();

    if (!word) return [];

    // 5. 格式化輸出：如果有多個詞性，我們把它們打包在一起回傳
    const finalPosStr = finalPosList.length > 0 ? finalPosList.join(', ') : 'u.';
    
    return [{
        word: word,
        pos: finalPosStr,
        def: defPart
    }];
}

/**
 * 主程式：讀取根目錄 Level1~6.txt，進行自動清洗與智慧合併
 */
function main() {
    const baseDir = __dirname; 
    const allLevels = {};

    console.log("🚀 開始執行大考 7000 單字自動清洗中心...");

    for (let level = 1; level <= 6; level++) {
        const fileName = `Level${level}.txt`;
        const filePath = path.join(baseDir, fileName);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ 錯誤: 在根目錄找不到檔案 ${fileName}，跳過此級數！`);
            continue;
        }

        console.log(`📂 正在讀取並解析: ${fileName}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);

        // 1. 基礎清洗
        let cleanedLines = lines.map(line => cleanLine(line)).filter(line => line.length > 0);
        let mergedLines = [];
        
        // 2. 智慧型跨行黏合（如果下一行沒有中文，代表它是上一行未完的英文片語或例句）
        for (let i = 0; i < cleanedLines.length; i++) {
            let currentLine = cleanedLines[i];
            while (i < cleanedLines.length - 1 && !/[\u4e00-\u9fff]/.test(cleanedLines[i + 1])) {
                i++;
                currentLine += " " + cleanedLines[i];
            }
            mergedLines.push(currentLine);
        }

        let structuredWords = [];
        let currentWord = null;
        const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];

        // 每一個 Level 獨立宣告一個 Map，徹底杜絕跨關卡 Reference 被 clear() 刪除的 Bug
        const currentLevelMap = new Map();

        // 3. 解析每一行
        for (let i = 0; i < mergedLines.length; i++) {
            const line = mergedLines[i];
            
            try {
                let isContinuation = false;
                let posFound = null;

                // 檢查是否為特殊換行後獨立出現的詞性標頭
                for (const pos of posList) {
                    const regex = new RegExp(`^${pos.replace('.', '\\.')}(?:[^a-zA-Z]|$)`);
                    const match = line.match(regex);
                    if (match) {
                        posFound = pos;
                        isContinuation = true;
                        break;
                    }
                }

                if (!isContinuation && currentWord) {
                    const hasEnglishLetters = /[a-zA-Z]{2,}/.test(line);
                    if (!hasEnglishLetters) {
                        isContinuation = true; // 純中文，當作上一個單字的定義延伸
                    }
                }

                // 如果判定為上一行的延伸
                if (isContinuation && currentWord) {
                    if (posFound) {
                        const newDef = line.slice(posFound.length).trim();
                        let standardPos = posFound;
                        if (standardPos === 'a.') standardPos = 'adj.';
                        else if (standardPos === 'ad.') standardPos = 'adv.';

                        if (!currentWord.pos.includes(standardPos)) {
                            currentWord.pos = currentWord.pos ? `${currentWord.pos}, ${standardPos}` : standardPos;
                        }
                        currentWord.def = currentWord.def ? `${currentWord.def} ； (${standardPos}) ${newDef}` : `(${standardPos}) ${newDef}`;
                    } else {
                        currentWord.def = currentWord.def ? `${currentWord.def} ； ${line}` : line;
                    }
                    continue;
                }

                // 正常解析單行
                const parsedList = parseCleanedLine(line);
                if (parsedList.length > 0) {
                    parsedList.forEach(w => {
                        structuredWords.push(w);
                    });
                    // 更新當前的指標單字
                    currentWord = structuredWords[structuredWords.length - 1];
                }
            } catch (lineError) {
                console.warn(`⚠️ 警告: 解析此行時發生錯誤並跳過 -> "${line}":`, lineError.message);
            }
        }

        // 4. 在關卡內進行重複單字合併 (例如同個 Level 裡重複出現的單字)
        structuredWords.forEach(item => {
            const lowerWord = item.word.toLowerCase();
            
            if (currentLevelMap.has(lowerWord)) {
                let existing = currentLevelMap.get(lowerWord);
                if (!existing.pos.includes(item.pos)) {
                    existing.pos = `${existing.pos}, ${item.pos}`;
                }
                // 避免重複黏貼一樣的詞性標籤
                if (!existing.def.includes(`(${item.pos})`)) {
                    existing.def = `${existing.def} ； (${item.pos}) ${item.def}`;
                } else {
                    existing.def = `${existing.def} ； ${item.def}`;
                }
            } else {
                currentLevelMap.set(lowerWord, {
                    word: item.word,
                    pos: item.pos,
                    def: `(${item.pos}) ${item.def}`
                });
            }
        });

        // 轉成陣列存入對應關卡
        allLevels[`Level${level}`] = Array.from(currentLevelMap.values());
        console.log(`✅ ${fileName} 解析完畢，共計 ${allLevels[`Level${level}`].length} 個不重複單字。`);
    }

    // 5. 輸出成前端大寫變數相容格式
    const outputContent = `// 🤖 本檔案由雲端 Docker 自動清洗生成，請勿手動修改
const CEEC_WORDS = ${JSON.stringify(allLevels, null, 2)};
const ceec_words = CEEC_WORDS; 

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CEEC_WORDS;
}`;

    const outputFilePath = path.join(baseDir, 'ceec_words.js');
    fs.writeFileSync(outputFilePath, outputContent, 'utf8');
    
    console.log(`\n✨✨✨ 恭喜！大寫相容版資料庫清洗完畢！✨✨✨`);
    console.log(`📝 已成功在根目錄輸出全新結構檔：${outputFilePath}\n`);
}

main();
