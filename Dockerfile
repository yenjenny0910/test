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

# 1. 這裡會把你的所有檔案（包含最新的 Level 1~6 .txt 檔案與 parse.js）複製到容器內
COPY . .

# ==========================================================================
# 🚀 ✨ ✨ 【核心關鍵】在打包映像檔時，直接觸發單字清洗程式！
# ==========================================================================
RUN npm run clean-db

EXPOSE 3001

CMD ["npm", "start"]
