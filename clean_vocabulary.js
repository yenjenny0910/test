const fs = require('fs');
const path = require('path');

/**
 * 基礎行清洗：去除前後空白、中括號內容及前後斜線
 */
function cleanLine(line) {
    line = line.trim();
    if (!line) return "";
    // 移除中括號 [ ... ] 及其內容
    line = line.replace(/\[[^\]]*\]/g, ' ');
    // 移除前後的斜線與多餘空格
    line = line.replace(/[\s\/]+$/, '');
    line = line.replace(/^[\s\/]+/, '');
    // 將連續空格合併為單個空格
    line = line.replace(/\s+/g, ' ').trim();
    return line;
}

/**
 * 解析單行單字：支援多重詞性、片語、中英文分流
 */
function parseCleanedLine(line) {
    line = line.trim();
    if (!line) return [];

    // 常見詞性清單（依長度排序，避免短詞性提前截斷長詞性）
    const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];
    
    let posMatches = [];
    posList.forEach(pos => {
        let idx = -1;
        while ((idx = line.indexOf(pos, idx + 1)) !== -1) {
            const before = idx === 0 ? ' ' : line[idx - 1];
            const after = idx + pos.length >= line.length ? ' ' : line[idx + pos.length];
            if (/[\s\/]/.test(before) && /[\s\u4e00-\u9fff]/.test(after)) {
                posMatches.push({ pos: pos, index: idx });
            }
        }
    });

    posMatches.sort((a, b) => a.index - b.index);

    let results = [];

    if (posMatches.length > 0) {
        let rawWord = line.slice(0, posMatches[0].index).trim();
        // 核心改動：利用 Regex 拔除單字尾端純粹用來識別重複的數字（例如 "pop1" -> "pop"）
        let word = rawWord.replace(/([a-zA-Z\s\-'\.\/]+)\d+$/, '$1').trim();

        for (let i = 0; i < posMatches.length; i++) {
            let currentPos = posMatches[i].pos;
            let startDef = posMatches[i].index + currentPos.length;
            let endDef = (i + 1 < posMatches.length) ? posMatches[i + 1].index : line.length;
            let def = line.slice(startDef, endDef).trim();
            
            // 移除中文定義首尾的多餘斜線或逗號
            def = def.replace(/^[\s\/,\uff0c\u3001]+|[\s\/,\uff0c\u3001]+$/g, '').trim();

            // 詞性標準化
            let standardPos = currentPos;
            if (standardPos === 'a.') standardPos = 'adj.';
            else if (standardPos === 'ad.') standardPos = 'adv.';

            if (word && def) {
                results.push({ word: word, pos: standardPos, def: def });
            }
        }
    } else {
        // 處理沒有詞性標記的特殊行或漏網之魚
        const match = line.match(/^([a-zA-Z\s\-'\.\d]+)([\u4e00-\u9fff].*)$/);
        if (match) {
            let rawWord = match[1].trim();
            let word = rawWord.replace(/([a-zA-Z\s\-'\.\/]+)\d+$/, '$1').trim();
            let def = match[2].trim();
            results.push({ word: word, pos: 'u.', def: def });
        }
    }

    return results;
}

/**
 * 主程式：讀取根目錄 Level1~6.txt，進行自動清洗與智慧合併
 */
function main() {
    // 🟢 關鍵修正：baseDir 直接指向當前 js 所在的根目錄，不再進入 data 資料夾
    const baseDir = __dirname; 
    const allLevels = {};
    
    // 用於智慧合併重複單字的 Map (Key 為英文單字本身)
    const globalMergedMap = new Map();

    console.log("🚀 開始執行大考 7000 單字自動清洗中心...");

    for (let level = 1; level <= 6; level++) {
        const fileName = `Level${level}.txt`;
        const filePath = path.join(baseDir, fileName);

        // 防呆：如果雲端遺漏了某個 Level 檔案，印出警告但不崩潰
        if (!fs.existsSync(filePath)) {
            console.error(`❌ 錯誤: 在根目錄找不到檔案 ${fileName}，跳過此級數！`);
            continue;
        }

        console.log(`📂 正在讀取並解析: ${fileName}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);

        // 預處理：清洗線條並處理換行造成的斷詞
        let cleanedLines = lines.map(line => cleanLine(line)).filter(line => line.length > 0);
        let mergedLines = [];
        
        for (let i = 0; i < cleanedLines.length; i++) {
            let currentLine = cleanedLines[i];
            // 如果某一行不含任何中文，且下一行存在，則視為未完結的英文片語進行合併
            while (i < cleanedLines.length - 1 && !/[\u4e00-\u9fff]/.test(currentLine)) {
                i++;
                currentLine += " " + cleanedLines[i];
            }
            mergedLines.push(currentLine);
        }

        let structuredWords = [];
        let currentWord = null;
        const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];

        // 逐行解析單字
        for (let i = 0; i < mergedLines.length; i++) {
            const line = mergedLines[i];
            
            try {
                let isContinuation = false;
                let posFound = null;

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
                        isContinuation = true;
                    }
                }

                // 處理多行定義延伸
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

                const parsedList = parseCleanedLine(line);
                if (parsedList.length > 0) {
                    parsedList.forEach(w => {
                        structuredWords.push(w);
                    });
                    currentWord = structuredWords[structuredWords.length - 1];
                }
            } catch (lineError) {
                // 🚨 行解析防撞機制：某行出錯僅跳過並提示，確保整個部署不崩潰
                console.warn(`⚠️ 警告: 解析此行時發生錯誤並跳過 -> "${line}":`, lineError.message);
            }
        }

        // 🧠 【核心智慧合併機制】將重複出現、去完數字後的單字完美融合
        structuredWords.forEach(item => {
            const lowerWord = item.word.toLowerCase();
            
            if (globalMergedMap.has(lowerWord)) {
                // 發現重複單字（如之前的 pop1 與 pop2）
                let existing = globalMergedMap.get(lowerWord);
                
                // 合併詞性（避免重複寫入相同的詞性）
                if (!existing.pos.includes(item.pos)) {
                    existing.pos = `${existing.pos}, ${item.pos}`;
                }
                // 用「 ； 」做為前端分割的安全符號，並帶上詞性標記
                existing.def = `${existing.def} ； (${item.pos}) ${item.def}`;
            } else {
                // 第一次遇到的單字，先格式化定義外觀
                let formattedItem = {
                    word: item.word,
                    pos: item.pos,
                    def: `(${item.pos}) ${item.def}`
                };
                globalMergedMap.set(lowerWord, formattedItem);
            }
        });

        // 將此 Level 合併後的所有單字轉回陣列存檔
        allLevels[`level${level}`] = Array.from(globalMergedMap.values());
        // 清空 Map 讓下一個 Level 重新計算（或若要跨 Level 合併可不予清空，此處採各 Level 獨立）
        globalMergedMap.clear();
        console.log(`✅ ${fileName} 解析完畢，共計 ${allLevels[`level${level}`].length} 個不重複單字。`);
    }

    // 轉化為前端網頁可以直接透過 <script> 標籤載入的 Global 變數格式
    const outputContent = `// 🤖 本檔案由雲端 Docker 自動清洗生成，請勿手動修改\nconst ceec_words = ${JSON.stringify(allLevels, null, 2)};\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = ceec_words;\n}`;

    // 🟢 關鍵修正：將生成的 ceec_words.js 直接寫在根目錄下，方便 Dockerfile 拾取
    const outputFilePath = path.join(baseDir, 'ceec_words.js');
    fs.writeFileSync(outputFilePath, outputContent, 'utf8');
    
    console.log(`\n✨✨✨ 恭喜！全自動資料庫清洗完畢！✨✨✨`);
    console.log(`📝 已成功在根目錄輸出全新結構檔：${outputFilePath}\n`);
}

main();
