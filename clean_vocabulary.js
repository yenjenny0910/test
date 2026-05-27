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
/**
 * 終極解析單行單字：解決詞性黏連、詞性後置、無空格等所有排版大魔王
 */
function parseCleanedLine(line) {
    line = line.trim();
    if (!line) return [];

    // 嚴格定義詞性關鍵字（依長度排序）
    const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];
    
    let foundPosInLine = [];
    
    // 1. 全域搜尋行內所有符合的詞性標籤（包含黏在一起的情況）
    posList.forEach(pos => {
        let idx = -1;
        while ((idx = line.indexOf(pos, idx + 1)) !== -1) {
            // 為了防禦 general 裡面的 n.，我們要確保這個 pos 不是被英文字母夾在中間
            const beforeChar = idx > 0 ? line[idx - 1] : ' ';
            const afterChar = idx + pos.length < line.length ? line[idx + pos.length] : ' ';
            
            // 只要詞性的前後不是標準的英文字母，就認定它是詞性標籤
            if (!/[a-zA-Z]/.test(beforeChar) || !/[a-zA-Z]/.test(afterChar)) {
                foundPosInLine.push({ pos: pos, index: idx });
            }
        }
    });

    // 依出現在行中的先後順序排序
    foundPosInLine.sort((a, b) => a.index - b.index);

    let word = "";
    let def = "";
    let finalPosList = [];

    // 2. 根據是否偵測到詞性，切換不同的解析大腦
    if (foundPosInLine.length > 0) {
        // 標準化所有找到的詞性
        foundPosInLine.forEach(item => {
            let p = item.pos;
            if (p === 'a.') p = 'adj.';
            if (p === 'ad.') p = 'adv.';
            if (!finalPosList.includes(p)) finalPosList.push(p);
        });

        const firstPos = foundPosInLine[0];
        const lastPos = foundPosInLine[foundPosInLine.length - 1];

        if (firstPos.index === 0) {
            // 【型態 A】詞性在最前面：例如 "vt., vi. fly 飛"
            // 單字在最後一個詞性後面，直到遇到中文為止
            let remain = line.slice(lastPos.index + lastPos.pos.length).trim();
            const matchChinese = remain.match(/([\u4e00-\u9fff].*)$/);
            if (matchChinese) {
                def = matchChinese[1];
                word = remain.slice(0, remain.indexOf(def)).trim();
            } else {
                word = remain;
            }
        } else {
            // 【型態 B】詞性在中間或後面：例如 "apple n. 蘋果" 或 "abstractadj.抽象的" 或 "abandon 拋棄 v."
            // 第一個詞性左邊的一定是英文單字（或者是單字+一部分中文）
            let leftPart = line.slice(0, firstPos.index).trim();
            
            // 檢查左邊是不是純英文。如果是，代表詞性在中間 (apple n. 蘋果)
            if (/^[a-zA-Z\s\-'\.\/,1-9\(\)]+$/.test(leftPart)) {
                word = leftPart;
                // 右邊就是中文定義（把其他詞性標籤拿掉）
                let rightPart = line.slice(firstPos.index).trim();
                foundPosInLine.forEach(item => {
                    rightPart = rightPart.replace(item.pos, ' ');
                });
                def = rightPart;
            } else {
                // 如果左邊包含中文，代表詞性後置了 (abandon 拋棄 v.)
                const matchEnglish = leftPart.match(/^([a-zA-Z\s\-'\.\/,1-9\(\)]+)/);
                if (matchEnglish) {
                    word = matchEnglish[1];
                    def = leftPart.slice(word.length);
                }
            }
        }
    } else {
        // 【型態 C】完全沒有詞性標記：例如 "pencil 鉛筆"
        // 直接用第一個中文字元把英文和中文切開
        const matchSplit = line.match(/^([a-zA-Z\s\-'\.\/,1-9\(\)]+)([\u4e00-\u9fff].*)$/);
        if (matchSplit) {
            word = matchSplit[1];
/**
 * 終極解析單行單字：完美防禦 Jun. 等月份縮寫誤判、強效剝離全半形殘留括號
 */
function parseCleanedLine(line) {
    line = line.trim();
    if (!line) return [];

    // 1. 【新增：前置括號大掃除】直接把英文部分的補充括號（不論全半形、內含什麼字）先清掉
    // 例如： "absorb (vt.) 吸收" -> "absorb 吸收"
    // 例如： "apple [C] 蘋果" -> "apple 蘋果"
    line = line.replace(/[\(\[\uff08][a-zA-Z\s\.\,\/\uff0c]*[\)\]\uff09]/g, ' ');
    // 再清一次可能連續產生的空格
    line = line.replace(/\s+/g, ' ').trim();

    // 嚴格定義詞性關鍵字（依長度排序）
    const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];
    
    let foundPosInLine = [];
    
    // 2. 全域搜尋行內所有符合的詞性標籤
    posList.forEach(pos => {
        let idx = -1;
        while ((idx = line.indexOf(pos, idx + 1)) !== -1) {
            const beforeChar = idx > 0 ? line[idx - 1] : ' ';
            const afterChar = idx + pos.length < line.length ? line[idx + pos.length] : ' ';
            
            // 🛑 【重大修正：嚴格詞性邊界】
            // 詞性的前面不能是小寫英文字母（防 general 裡的 n.），
            // 且「前面絕對不能是大寫字母」（防 Jun. 裡面的 un. 被誤判為詞性！）
            // 詞性後面必須是空格、標點符號或中文
            if (!/[a-zA-Z]/.test(beforeChar) && !/[a-zA-Z]/.test(afterChar)) {
                foundPosInLine.push({ pos: pos, index: idx });
            }
        }
    });

    // 依出現在行中的先後順序排序
    foundPosInLine.sort((a, b) => a.index - b.index);

    let word = "";
    let def = "";
    let finalPosList = [];

    // 3. 根據是否偵測到詞性，切換不同的解析大腦
    if (foundPosInLine.length > 0) {
        // 標準化所有找到的詞性
        foundPosInLine.forEach(item => {
            let p = item.pos;
            if (p === 'a.') p = 'adj.';
            if (p === 'ad.') p = 'adv.';
            if (!finalPosList.includes(p)) finalPosList.push(p);
        });

        const firstPos = foundPosInLine[0];
        const lastPos = foundPosInLine[foundPosInLine.length - 1];

        if (firstPos.index === 0) {
            // 【型態 A】詞性在最前面：例如 "vt., vi. fly 飛"
            let remain = line.slice(lastPos.index + lastPos.pos.length).trim();
            const matchChinese = remain.match(/([\u4e00-\u9fff].*)$/);
            if (matchChinese) {
                def = matchChinese[1];
                word = remain.slice(0, remain.indexOf(def)).trim();
            } else {
                word = remain;
            }
        } else {
            // 【型態 B】詞性在中間或後面：例如 "apple n. 蘋果"
            let leftPart = line.slice(0, firstPos.index).trim();
            
            // 判斷左邊是否為純英文區（允許標點與空格）
            if (/^[a-zA-Z\s\-'\.\/,1-9\(\)\[\]\uff08\uff09]+$/.test(leftPart)) {
                word = leftPart;
                let rightPart = line.slice(firstPos.index).trim();
                foundPosInLine.forEach(item => {
                    rightPart = rightPart.replace(item.pos, ' ');
                });
                def = rightPart;
            } else {
                // 詞性後置 (abandon 拋棄 v.)
                const matchEnglish = leftPart.match(/^([a-zA-Z\s\-'\.\/,1-9\(\)\[\]\uff08\uff09]+)/);
                if (matchEnglish) {
                    word = matchEnglish[1];
                    def = leftPart.slice(word.length);
                }
            }
        }
    } else {
        // 【型態 C】完全沒有詞性標記：例如 "pencil 鉛筆"
        const matchSplit = line.match(/^([a-zA-Z\s\-'\.\/,1-9\(\)\[\]\uff08\uff09]+)([\u4e00-\u9fff].*)$/);
        if (matchSplit) {
            word = matchSplit[1];
            def = matchSplit[2];
        } else {
            word = line;
        }
    }

    // 4. 【後置終極雜質剝離】收尾冷酷清理
    // 清理單字首尾所有可能殘留的各式括號與標點符號
    word = word.replace(/[()（）\[\]\/,;\s\.\-]+$/, '').replace(/^[()（）\[\]\/,;\s\.\-]+/, '').trim();
    // 拔除大考中心的重複序號（如 apple1 -> apple）
    word = word.replace(/([^a-zA-Z0-9])\d+$/, '$1').replace(/[1-9]$/, '').trim();
    
    // 清理中文首尾雜質
    def = def.replace(/^[\s\/,\uff0c\u3001;；:：)]+|[\s\/,\uff0c\u3001;；:：(]+$/g, '').trim();

    if (!word) return [];

    const finalPosStr = finalPosList.length > 0 ? finalPosList.join(', ') : 'u.';

    return [{
        word: word,
        pos: finalPosStr,
        def: def
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
            const line = mergedLines[i].trim();
            
            // =========================================================================
            // 🛑 【新增：標題與雜質過濾器】 🛑
            // =========================================================================
            // 1. 過濾掉純數字（頁碼）
            if (/^\d+$/.test(line)) continue;
            
            // 2. 過濾掉大考中心的標題、級數宣告、頁面標籤
            const lowerLine = line.toLowerCase();
            if (
                lowerLine.includes('level') || 
                lowerLine.includes('page') || 
                lowerLine.includes('大考') || 
                lowerLine.includes('單字') || 
                lowerLine.includes('字表') || 
                lowerLine.includes('版權所有') ||
                line.length <= 1 // 過濾掉單個莫名其妙的英文字母或雜訊
            ) {
                console.log(`🗑️ 已自動過濾標題或雜訊行 -> "${line}"`);
                continue;
                }
            
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
