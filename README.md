# Morning Briefing Bot

Node.js + Express 기반 아침 브리핑 봇입니다. iPhone 단축어에서 `GET /briefing`을 호출하면 한국어 `plain text` 브리핑을 반환합니다.

API 키가 없으면 mock 뉴스로 실행되고, 키가 있으면 Open-Meteo 날씨, 네이버 뉴스 후보, Gemini 요약을 사용합니다. Gemini 호출이 실패하면 GroqCloud 또는 xAI Grok fallback을 사용할 수 있습니다. 캘린더 연동은 `src/services/calendar.js`에 추후 추가할 수 있도록 분리했습니다.

## 요구사항

- Node.js 20 이상
- npm
- Oracle Cloud Ubuntu 24.04 무료 AMD 서버에서도 실행 가능한 가벼운 Express 앱

## 파일 구조

```text
src/server.js
src/briefing.js
src/services/weather.js
src/services/airQuality.js
src/services/news.js
src/services/calendar.js
src/services/llm.js
src/services/market.js
src/services/dayInfo.js
src/utils/date.js
src/utils/format.js
src/utils/text.js
.env.example
.gitignore
README.md
package.json
```

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

브라우저 또는 iPhone 단축어에서 아래 주소를 호출합니다.

```text
http://localhost:3000/briefing
```

기본 포트는 `3000`입니다. 변경하려면 `.env`의 `PORT` 값을 수정하세요.

## 환경 변수

```env
PORT=3000
HOST=127.0.0.1

NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite

GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
GROK_API_KEY=

XAI_API_KEY=
XAI_GROK_MODEL=grok-4.3
```

- 날씨와 대기질은 Open-Meteo를 사용하므로 별도 API 키가 필요 없습니다. 기본 위치는 `src/services/weather.js`의 `DEFAULT_LOCATION`에 있는 서울 도봉구입니다.
- 대기질은 Open-Meteo Air Quality API에서 PM10/PM2.5를 가져와 등급만 짧게 표시합니다.
- 날짜 정보는 `src/services/dayInfo.js`에서 당일 공휴일/대체공휴일/기념일/절기와 월요일 주간 항목을 짧게 표시합니다.
- 뉴스 후보는 네이버 뉴스 검색 API에서 가져옵니다. 경제/국제 중심 쿼리로 수집하고, 정치/지역기관 홍보/포토/행사성 기사는 Gemini에 넘기기 전에 제거합니다.
- Gemini는 정제된 후보 중 최대 3개를 id로 고르고 아침 브리핑용 문장으로 요약합니다.
- `GROQ_API_KEY`가 있으면 Gemini 쿼터 초과나 일시 장애 때 GroqCloud Chat Completions API로 한 번 더 시도합니다. `GROK_API_KEY` 값이 `gsk_`로 시작해도 GroqCloud 키로 인식합니다.
- GroqCloud fallback 기본 모델은 가벼운 `llama-3.1-8b-instant`입니다. 필요하면 `GROQ_MODEL`로 바꿀 수 있습니다.
- xAI Grok API 키를 쓰고 싶으면 `GROK_API_KEY` 또는 `XAI_API_KEY`에 `xai-` 키를 넣으면 됩니다. 기본 모델은 `grok-4.3`이고, 필요하면 `XAI_GROK_MODEL`로 바꿀 수 있습니다.
- 시장 체크는 `src/services/market.js`에 분리되어 있습니다. 아직 실제 환율, 증시, 유가, 비트코인, 이더리움 시세 API는 연결하지 않았으므로 기본 출력에서는 생략됩니다.
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `GEMINI_API_KEY`가 없거나 API 호출이 실패하면 fallback 브리핑을 반환합니다. GroqCloud 또는 xAI 키는 Gemini 실패 시 보조 LLM으로만 사용됩니다.

## API

### `GET /`

서버 상태 메시지를 `plain text`로 반환합니다.

### `GET /health`

상태 확인용 JSON을 반환합니다.

```json
{ "ok": true }
```

### `GET /briefing`

오늘 날짜 기준 브리핑을 `plain text`로 반환합니다. 날짜는 한국 시간대 기준입니다.

## Oracle Cloud Ubuntu 24.04 배포

서버에 접속한 뒤 프로젝트 폴더로 이동합니다.

```bash
cd ~/briefing-bot
npm install
cp .env.example .env
nano .env
```

운영 서버에서는 앱을 외부에 직접 공개하지 않고 `127.0.0.1:3000`에서만 실행합니다. 외부 접속은 Nginx가 `80 -> 127.0.0.1:3000`으로 프록시합니다.

```env
PORT=3000
HOST=127.0.0.1
```

Oracle Cloud Security List 또는 NSG에서는 TCP `80`만 열면 됩니다. `3000`은 외부에 열지 않습니다.

일회성 실행:

```bash
npm start
```

## PM2 상시 실행

PM2가 없다면 설치합니다.

```bash
npm install -g pm2
```

앱을 시작합니다.

```bash
pm2 start npm --name morning-briefing -- start
pm2 status
```

현재 PM2 프로세스 목록을 저장합니다.

```bash
pm2 save
```

서버 재부팅 후 자동 실행되도록 등록합니다.

```bash
pm2 startup
```

`pm2 startup` 실행 후 출력되는 `sudo env ... pm2 startup ...` 명령을 그대로 한 번 더 실행하세요. 그 뒤 다시 저장합니다.

```bash
pm2 save
```

로그 확인:

```bash
pm2 logs morning-briefing
```

재시작:

```bash
pm2 restart morning-briefing
```

중지:

```bash
pm2 stop morning-briefing
```

## Nginx 프록시

Nginx는 외부 HTTP 요청을 내부 앱 포트로 전달합니다.

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

설정 확인과 재시작:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

외부 호출 URL:

```text
http://168.107.7.60/briefing
```

## 실제 API 연동 위치

- 날씨: `src/services/weather.js`
- 대기질: `src/services/airQuality.js`
- 뉴스 후보 수집: `src/services/news.js`
- LLM 요약: `src/services/llm.js`
- 시장 체크: `src/services/market.js`
- 날짜 정보: `src/services/dayInfo.js`
- 캘린더: `src/services/calendar.js`

API 키와 클라이언트 시크릿은 코드에 직접 넣지 말고 `.env`에만 저장하세요. `.env.example`에는 필요한 변수 이름만 추가합니다.
