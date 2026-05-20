# ==========================================
# 階段一：單字清洗中心 (極速、輕量)
# ==========================================
FROM node:20-alpine AS cleaner
WORKDIR /tmp-build

COPY package*.json ./
# 這裡允許安裝所有套件以順利執行清洗
RUN npm install

COPY . .
RUN npm run clean-db


# ==========================================
# 階段二：正式運行的主伺服器 (包含你的 Python 與 OCR 核心)
# ==========================================
FROM node:20-bullseye

WORKDIR /app

# 安裝 Linux 系統重型環境套件
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-pip \
       tesseract-ocr \
       tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

# 🚨 先複製最新的 package.json，並強制重新安裝正式環境所需套件 (如 express)
COPY package*.json ./
COPY requirements.txt ./
RUN npm cache clean --force \
    && npm install \
    && pip3 install --no-cache-dir -r requirements.txt

# 複製其餘所有原始碼
COPY . .

# 🌟 核心關鍵：將第一階段洗好的結晶直接偷渡過來覆蓋
COPY --from=cleaner /tmp-build/ceec_words.js ./ceec_words.js

EXPOSE 3001

# 正式開機！此時 express 和 ceec_words.js 都已各就各位
CMD ["npm", "start"]
