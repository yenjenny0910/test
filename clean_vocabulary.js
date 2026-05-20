const fs = require('fs');
const path = require('path');

function cleanLine(line) {
    line = line.trim();
    if (!line) return "";

    // Safely remove all individual square bracket blocks [ ... ]
    line = line.replace(/\[[^\]]*\]/g, ' ');

    // Remove leftover slashes and spaces
    line = line.replace(/[\s\/]+$/, '');
    line = line.replace(/^[\s\/]+/, '');

    // Clean up multiple spaces
    line = line.replace(/\s+/g, ' ').trim();
    return line;
}

// 🛠️ 完美取代：支援多重詞性、片語、嚴格中英文分流的終極解析器
function parseSingleWord(line) {
    line = line.trim();
    if (!line) return null;

    // 常見詞性清單（依照長度由長到短排序，防止 vi. 被 v. 提早切斷）
    const posList = ['prep.', 'conj.', 'pron.', 'aux.', 'adj.', 'adv.', 'num.', 'int.', 'art.', 'vi.', 'vt.', 'n.', 'v.', 'a.', 'ad.'];
    
    // 步驟 1：找出這一行裡面「所有」出現過的詞性標記與位置
    let posMatches = [];
    posList.forEach(pos => {
        let idx = -1;
        // 循環尋找所有重複出現的詞性（例如一行裡面有兩個 n.）
        while ((idx = line.indexOf(pos, idx + 1)) !== -1) {
            // 確保詞性前後是邊界或空格，不是單字的一部分 (例如 separate 包含 prep)
            const before = idx === 0 ? ' ' : line[idx - 1];
            const after = idx + pos.length >= line.length ? ' ' : line[idx + pos.length];
            if (/[\s\/]/.test(before) && /[\s\u4e00-\u9fff]/.test(after)) {
                posMatches.push({ pos: pos, index: idx });
            }
        }
    });

    // 將找到的詞性依畫面的先後順序排序
    posMatches.sort((a, b) => a.index - b.index);

    let word = "";
    let finalPosArray = [];
    let finalDefArray = [];

    if (posMatches.length > 0) {
        // 🌟 有詞性的情況：第一個詞性左邊絕對是「純英文單字或片語」
        word = line.slice(0, posMatches[0].index).trim();

        // 遞迴解析後面所有的「詞性 + 中文」組合
        for (let i = 0; i < posMatches.length; i++) {
            let currentPos = posMatches[i].pos;
            // 轉換標準詞性
            if (currentPos === 'a.') currentPos = 'adj.';
            if (currentPos === 'ad.') currentPos = 'adv.';
            if (!finalPosArray.includes(currentPos)) finalPosArray.push(currentPos);

            // 找出當前詞性對應的中文字邊界（到下一個詞性之前，或者到行尾）
            let startIdx = posMatches[i].index + posMatches[i].pos.length;
            let endIdx = (i + 1 < posMatches.length) ? posMatches[i + 1].index : line.length;
            let chunkDef = line.slice(startIdx, endIdx).trim();
            
            // 清理前後雜質符號
            chunkDef = chunkDef.replace(/^[:：\s\/、]+|[:：\s\/、]+$/g, '');
            if (chunkDef) {
                finalDefArray.push(`(${currentPos}) ${chunkDef}`);
            }
        }
    } else {
        // 🌟 沒詞性的情況：利用第一個漢字（中文）硬性切開英文與中文
        let chineseStart = -1;
        for (let i = 0; i < line.length; i++) {
            if (line.charCodeAt(i) >= 0x4e00 && line.charCodeAt(i) <= 0x9fff) {
                chineseStart = i;
                break;
            }
        }

        if (chineseStart !== -1) {
            word = line.slice(0, chineseStart).trim();
            finalDefArray.push(line.slice(chineseStart).trim());
            finalPosArray.push("n."); // 沒寫詞性通常預設為名詞
        } else {
            word = line.trim();
        }
    }

    // 額外清理單字本體殘留的數字或括號（例如 account (1) -> account）
    word = word.replace(/\s*\(\d+\)\s*$/, '').replace(/\d+$/, '').trim();
    // 防呆：如果英文單字不小心噴進中文字，強制把中文字剝離
    word = word.replace(/[\u4e00-\u9fff].*$/, '').trim();

    // 組合出最乾淨的格式
    return {
        word: word,
        pos: finalPosArray.join(', '),
        def: finalDefArray.join('；')
    };
}

function parseCleanedLine(line) {
    const parsed = parseSingleWord(line);
    return parsed && parsed.word ? [parsed] : [];
}

function processFile(filePath) {
    console.log(`Processing ${filePath}...`);
    if (!fs.existsSync(filePath)) {
        console.error(`Error: ${filePath} not found!`);
        return { cleanedLines: [], structuredWords: [] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l);

    const posList = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'art.', 'aux.', 'vi.', 'vt.', 'a.', 'ad.', 'int.', 'num.'];

    const mergedLines = [];
    let idx = 0;
    while (idx < rawLines.length) {
        let line = rawLines[idx].trim();
        if (!line || line.includes("大考中心字彙表") || line.includes("LEVEL")) {
            idx++;
            continue;
        }

        line = cleanLine(line);

        while (idx + 1 < rawLines.length) {
            const nextRaw = rawLines[idx + 1].trim();
            if (!nextRaw) {
                idx++;
                continue;
            }
            const nextClean = cleanLine(nextRaw);
            
            const endsWithEnglish = /[a-zA-Z\/-]+$/.test(line);
            
            let nextIsContinuation = false;
            for (const pos of posList) {
                const regex = new RegExp(`^${pos.replace('.', '\\.')}(?:[^a-zA-Z]|$)`);
                if (regex.test(nextClean)) {
                    nextIsContinuation = true;
                    break;
                }
            }
            if (!nextIsContinuation) {
                const hasEnglishLetters = /[a-zA-Z]{2,}/.test(nextClean);
                if (!hasEnglishLetters) {
                    nextIsContinuation = true;
                }
            }
            
            if (endsWithEnglish && nextIsContinuation) {
                line = line + " " + nextClean;
                idx++;
            } else {
                break;
            }
        }
        
        mergedLines.push(line);
        idx++;
    }

    const structuredWords = [];
    let currentWord = null;

    for (let i = 0; i < mergedLines.length; i++) {
        const line = mergedLines[i];
        if (!line) continue;

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

        if (isContinuation && currentWord) {
            if (posFound) {
                const newDef = line.slice(posFound.length).trim();
                let standardPos = posFound;
                if (standardPos === 'a.') standardPos = 'adj.';
                else if (standardPos === 'ad.') standardPos = 'adv.';

                if (!currentWord.pos.includes(standardPos)) {
                    currentWord.pos = currentWord.pos ? `${currentWord.pos}, ${standardPos}` : standardPos;
                }
                currentWord.def = currentWord.def ? `${currentWord.def}；${newDef}` : newDef;
            } else {
                currentWord.def = currentWord.def ? `${currentWord.def}；${line}` : line;
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
    }

    // Post-cleaning step
    structuredWords.forEach(item => {
        const posRegex = /\s+(art\.|adj\.|adv\.|prep\.|conj\.|pron\.|n\.|vi\.|vt\.|aux\.|v\.|a\.)\s*$/i;
        let match;
        while (match = item.word.match(posRegex)) {
            const foundPos = match[1];
            item.word = item.word.replace(posRegex, '').trim();
            if (!item.pos.includes(foundPos)) {
                item.pos = item.pos ? `${item.pos}, ${foundPos}` : foundPos;
            }
        }

        item.word = item.word.replace(/\s*\(\d+\)\s*/g, ' ').replace(/\s+\d+\s*$/g, '').trim();
        item.word = item.word.replace(/\/+$/, '').trim();
        item.word = item.word.replace(/\s*vt\.\s*\(\s*$/, '').trim();
        item.def = item.def.replace(/^[；;；]+|[；;；]+$/g, '').replace(/[；;；]+/g, '；').trim();
    });

    // ==========================================================================
    // 🔄 智慧合併晶片：把去掉數字後名字相同的單字（如 pop1, pop2）合併為同一個單字
    // ==========================================================================
    const mergedMap = new Map();

    structuredWords.forEach(item => {
        const cleanWordName = item.word.replace(/\d+$/, '').trim();
        
        if (mergedMap.has(cleanWordName)) {
            const existingWord = mergedMap.get(cleanWordName);
            
            const posSet = new Set([
                ...existingWord.pos.split(',').map(p => p.trim()), 
                ...item.pos.split(',').map(p => p.trim())
            ].filter(p => p));
            existingWord.pos = Array.from(posSet).join(', ');
            
            existingWord.def = `${existingWord.def} ； ${item.def}`;
        } else {
            item.word = cleanWordName;
            mergedMap.set(cleanWordName, item);
        }
    });

    const finalStructuredWords = Array.from(mergedMap.values());

    // ✨ 修正點 1：使用合併後的 finalStructuredWords 來產生清潔後的純文字記錄
    const cleanedLines = finalStructuredWords.map(item => {
        const posStr = item.pos ? `${item.pos} ` : '';
        return `${item.word} ${posStr}${item.def}`;
    });

    // ✨ 修正點 2：回傳智慧合併後的 finalStructuredWords 變數
    return { cleanedLines, structuredWords: finalStructuredWords };
}

function main() {
    // 📁 升級為雲端與本機通用的「相對路徑」（假設 .txt 檔都放在專案資料夾下的 data 目錄）
    const baseDir = path.join(__dirname, 'data');
    const allLevels = {};

    for (let lvl = 1; lvl <= 6; lvl++) {
        const fileName = `Level${lvl}.txt`;
        const filePath = path.join(baseDir, fileName);

        const { cleanedLines, structuredWords } = processFile(filePath);

        if (structuredWords.length === 0) continue;

        // Save cleaned file
        const cleanedFileName = `Level${lvl}_clean.txt`;
        const cleanedFilePath = path.join(baseDir, cleanedFileName);
        
        let cleanedContent = `大考中心字彙表 LEVEL ${lvl} (整理後，無KK音標)\n\n`;
        cleanedContent += cleanedLines.join('\n');
        
        fs.writeFileSync(cleanedFilePath, cleanedContent, 'utf-8');
        console.log(`Saved cleaned file to ${cleanedFilePath}`);

        allLevels[lvl] = structuredWords;
        console.log(`Level ${lvl} parsed ${structuredWords.length} words.`);
    }

    // Generate ceec_words.js (存在與 parse.js 同一個根目錄下)
    const jsPath = path.join(__dirname, "ceec_words.js");
    let jsContent = "// 大考中心 7000 單字表 (Level 1-6) - 整理後無KK音標\n";
    jsContent += "const CEEC_WORDS = " + JSON.stringify(allLevels, null, 2) + ";\n";
    fs.writeFileSync(jsPath, jsContent, 'utf-8');
    console.log(`Saved combined JS data to ${jsPath}`);
}

main();
