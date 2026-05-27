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
 * 萬能斷詞解析器：支援單行多單字、智慧剝離殘留中文、防止詞性錯位、徹底杜絕 Jun. 等月份縮寫誤判
 */
function parseCleanedLine(line) {
    try {
        line = line.trim();
        if (!line) return [];

        // 1. 強效全功能括號預清洗（避免括號內文字干擾斷詞）
        line = line.replace(/[\(\[\uff08].*?[\)\]\uff09]/g, ' ');
        line = line.replace(/\s+/g, ' ').trim();

        // 2. 如果整行完全沒有英文字母，但有中文，直接判定為純定義延伸
        if (!/[a-zA-Z]/.test(line) && /[\u4e00-\u9fff]/.test(line)) {
            return [{ type: 'append_to_last', def: line }];
        }

        const tokens = [];
        let lastIndex = 0;
        let match;
        
        // 核心 Regex：抓取 【英文與符號區】 ＋ 【緊鄰的中文字與結尾標點區】
        const pairRegex = /([a-zA-Z0-9\s.\-\/()（）\[\]_+=]+)([\u4e00-\u9fff][^a-zA-Z0-9_]*)/g;

        // 3. 開始進行全域掃描切片
        while ((match = pairRegex.exec(line)) !== null) {
            // 檢查兩個匹配之間，有沒有被漏掉的「純中文」（通常是上一個單字殘留下來的尾巴）
            if (match.index > lastIndex) {
                let skippedText = line.slice(lastIndex, match.index).trim();
                if (/[\u4e00-\u9fff]/.test(skippedText)) {
                    tokens.push({ type: 'append_to_last', def: skippedText });
                }
            }

            let eng = match[1].trim();
            let chi = match[2].trim();

            // 4. 在獨立的英文切片區內，精準抓取詞性 (POS)
            const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];
            let foundPos = [];
            
            posList.forEach(pos => {
                let idx = -1;
                while ((idx = eng.indexOf(pos, idx + 1)) !== -1) {
                    const before = idx > 0 ? eng[idx - 1] : ' ';
                    const after = idx + pos.length < eng.length ? eng[idx + pos.length] : ' ';
                    
                    // 嚴格邊界防禦：前後不能是常規字母，防 Jun. 或 general 誤判
                    if (!/[a-zA-Z]/.test(before) && !/[a-zA-Z]/.test(after)) {
                        foundPos.push({ pos: pos, index: idx });
                    }
                }
            });
            foundPos.sort((a, b) => a.index - b.index);

            let word = "";
            let posStr = "u.";

            if (foundPos.length > 0) {
                let standardPosArr = foundPos.map(item => {
                    let p = item.pos;
                    if (p === 'a.') return 'adj.';
                    if (p === 'ad.') return 'adv.';
                    return p;
                });
                standardPosArr = [...new Set(standardPosArr)]; // 去重
                posStr = standardPosArr.join(', ');

                // 根據詞性位置切出真正的單字
                if (foundPos[0].index <= 2) {
                    // 詞性在最前面，例如 "vt. fly"
                    word = eng.slice(foundPos[foundPos.length - 1].index + foundPos[foundPos.length - 1].pos.length).trim();
                } else {
                    // 詞性在中間或後面，例如 "apple n."
                    word = eng.slice(0, foundPos[0].index).trim();
                }
            } else {
                word = eng; // 無詞性
            }

            // 5. 收尾清理與格式化
            word = word.replace(/[()（）\[\]\/,;\s\.\-]+$/, '').replace(/^[()（）\[\]\/,;\s\.\-]+/, '').trim();
            word = word.replace(/([^a-zA-Z0-9])\d+$/, '$1').replace(/[1-9]$/, '').trim(); // 去除 apple1 類的尾端數字
            chi = chi.replace(/^[\s\/,\uff0c\u3001;；:：)]+|[\s\/,\uff0c\u3001;；:：(]+$/g, '').trim();

            // 智慧判定：如果切出來發現沒有英文單字，只有詞性和中文，代表它是上個單字的「多重詞性延伸換行」
            if (!word && posStr !== 'u.') {
                tokens.push({ type: 'pos_continuation', pos: posStr, def: chi });
            } else if (word) {
                tokens.push({ type: 'word', word: word, pos: posStr, def: chi });
            }

            lastIndex = pairRegex.lastIndex;
        }

        // 6. 處理整行結尾可能留下的殘渣
        if (lastIndex < line.length) {
            let leftover = line.slice(lastIndex).trim();
            if (leftover) {
                if (!/[a-zA-Z]/.test(leftover) && /[\u4e00-\u9fff]/.test(leftover)) {
                    tokens.push({ type: 'append_to_last', def: leftover });
                } else if (/[a-zA-Z]/.test(leftover)) {
                    tokens.push({ type: 'word', word: leftover.replace(/[1-9]$/, ''), pos: 'u.', def: '' });
                }
            }
        }

        return tokens;

    } catch (err) {
        console.warn(`⚠️ [解析忽略] 嚴重奇葩行已自動跳過 -> "${line}". 原因: ${err.message}`);
        return [];
    }
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

        // 每一個 Level 獨立宣告一個 Map，徹底杜絕跨關卡 Reference 記憶體遺失的 Bug
        const currentLevelMap = new Map();

        // 3. 解析每一行
        for (let i = 0; i < mergedLines.length; i++) {
            const line = mergedLines[i].trim();
            
            // 🛑 【標題與頁碼雜質過濾器】
            if (/^\d+$/.test(line)) continue; // 過濾純數字頁碼
            
            const lowerLine = line.toLowerCase();
            if (
                lowerLine.includes('level') || 
                lowerLine.includes('page') || 
                lowerLine.includes('大考') || 
                lowerLine.includes('單字') || 
                lowerLine.includes('字表') || 
                lowerLine.includes('版權所有') ||
                line.length <= 1 // 過濾單個英文字母雜訊
            ) {
                continue;
            }

            // 呼叫萬能斷詞器
            const parsedTokens = parseCleanedLine(line);
            
            // 根據 Token 類型各司其職
            parsedTokens.forEach(token => {
                if (token.type === 'append_to_last') {
                    // 【任務 A】純中文殘留：黏貼到上一個單字的中文後面
                    if (currentWord) {
                        currentWord.def = currentWord.def ? `${currentWord.def} ； ${token.def}` : token.def;
                    }
                } else if (token.type === 'pos_continuation') {
                    // 【任務 B】換行多重詞性延伸：幫上一個單字擴充詞性與定義
                    if (currentWord) {
                        if (!currentWord.pos.includes(token.pos)) {
                            currentWord.pos = `${currentWord.pos}, ${token.pos}`;
                        }
                        currentWord.def = `${currentWord.def} ； (${token.pos}) ${token.def}`;
                    }
                } else if (token.type === 'word') {
                    // 【任務 C】標準新單字：寫入結構陣列
                    structuredWords.push({
                        word: token.word,
                        pos: token.pos,
                        def: token.def
                    });
                    // 更新當前指標，讓後續的延伸內容可以正確黏附
                    currentWord = structuredWords[structuredWords.length - 1];
                }
            });
        }

        // 4. 在關卡內進行重複單字合併 (例如同個 Level 裡重複出現的單字)
        structuredWords.forEach(item => {
            const lowerWord = item.word.toLowerCase();
            let prefix = item.pos !== 'u.' ? `(${item.pos}) ` : '';
            
            if (currentLevelMap.has(lowerWord)) {
                let existing = currentLevelMap.get(lowerWord);
                if (!existing.pos.includes(item.pos)) {
                    existing.pos = `${existing.pos}, ${item.pos}`;
                }
                existing.def = `${existing.def} ； ${prefix}${item.def}`;
            } else {
                currentLevelMap.set(lowerWord, {
                    word: item.word,
                    pos: item.pos,
                    def: `${prefix}${item.def}`
                });
            }
        });

        // 轉成陣列存入對應關卡（直接賦予前端大寫 Level 屬性）
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
