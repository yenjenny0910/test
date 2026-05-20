# ==========================================
# 階段一：單字清洗中心 (極速、輕量)
# ==========================================
FROM node:20-alpine AS cleaner
WORKDIR /tmp-build

COPY package*.json ./
RUN npm install --omit=dev

# 複製包括 clean_vacabulary.js 和所有 txt 在內的檔案
COPY . .

# 執行清洗
RUN npm run clean-db

# ==========================================
# 階段二：正式運行的主伺服器
# ==========================================
FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-pip \
       tesseract-ocr \
       tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY requirements.txt ./
RUN npm install
RUN pip3 install --no-cache-dir -r requirements.txt

# 複製原始碼
COPY . .

# 🌟 只拿最重要的精華：把洗好的 ceec_words.js 偷渡過來即可！
COPY --from=cleaner /tmp-build/ceec_words.js ./ceec_words.js

EXPOSE 3001

CMD ["npm", "start"]
