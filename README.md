# Morning Briefing Bot

Node.js + Express 기반 아침 브리핑 봇입니다. iPhone 단축어에서 `GET /briefing`을 호출하면 한국어 `plain text` 브리핑을 반환합니다.

초기 버전은 API 키 없이 mock 날씨와 mock 뉴스로 실행됩니다. 실제 기상청 API, 네이버 뉴스 API, 캘린더 연동은 `src/services/` 안의 서비스 함수만 교체해서 붙일 수 있도록 분리했습니다.

## 요구사항

- Node.js 20 이상
- npm
- Oracle Cloud Ubuntu 24.04 무료 AMD 서버에서도 실행 가능한 가벼운 Express 앱

## 파일 구조

```text
src/server.js
src/briefing.js
src/services/weather.js
src/services/news.js
src/services/calendar.js
src/utils/date.js
src/utils/format.js
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
cd ~/codex-workspaces/oracle
npm install
cp .env.example .env
nano .env
```

방화벽 또는 Oracle Cloud 보안 목록에서 사용할 포트가 열려 있어야 외부에서 접근할 수 있습니다. 기본 포트는 `3000`입니다.

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
pm2 start src/server.js --name morning-briefing
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

## 실제 API 연동 위치

- 날씨: `src/services/weather.js`
- 뉴스: `src/services/news.js`
- 캘린더: `src/services/calendar.js`

API 키와 클라이언트 시크릿은 코드에 직접 넣지 말고 `.env`에만 저장하세요. `.env.example`에는 필요한 변수 이름만 추가합니다.
