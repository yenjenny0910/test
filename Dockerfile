# ==========================================
# 階段一：單字清洗中心 (極速、輕量)
# ==========================================
FROM node:20-alpine AS cleaner
WORKDIR /tmp-build

# 複製清洗所需的基本檔案
COPY package*.json ./
RUN npm install --omit=dev

# 複製整個專案（此時 Level1.txt~Level6.txt 都在 /tmp-build 根目錄下）
COPY . .

# 開始清洗單字，此時會在 /tmp-build 目錄下生成 ceec_words.js 與 LevelX_clean.txt
RUN npm run clean-db


# ==========================================
# 階段二：正式運行的主伺服器 (包含你的 Python 與 OCR 核心)
# ==========================================
FROM node:20-bullseye

WORKDIR /app

# 安裝重型的環境套件（有快取，以後沒改這段就不會重新下載，速度極快）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-pip \
       tesseract-ocr \
       tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Node & Python 依賴
COPY package*.json ./
COPY requirements.txt ./
RUN npm install
RUN pip3 install --no-cache-dir -r requirements.txt

# 複製專案其餘檔案
COPY . .

# 🌟 核心關鍵：從第一個房間把剛剛洗好的結晶直接偷渡過來！
COPY --from=cleaner /tmp-build/ceec_words.js ./ceec_words.js

# ✨ 修正點：因為檔案在根目錄，我們直接把所有洗好的 _clean.txt 檔案複製到主程式的根目錄
COPY --from=cleaner /tmp-build/*_clean.txt ./

EXPOSE 3001

CMD ["npm", "start"]
