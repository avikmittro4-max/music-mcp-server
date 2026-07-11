# Music Search MCP Server (for XiaoZhi ESP32 Robot)

এই সার্ভারটা YouTube থেকে গান/মিউজিক search করে link/info দেয়। XiaoZhi robot এটাকে
MCP tool হিসেবে ব্যবহার করে "গান বাজাও" বললে গান খুঁজে দেবে।

## Tools এতে আছে
- **search_music** — গানের নাম দিয়ে search, top 5 result দেখাবে
- **play_music** — গানের নাম দিয়ে সবচেয়ে ভালো match খুঁজে সরাসরি playable URL দেবে

## দেশে (Local) টেস্ট করার নিয়ম

```bash
npm install
npm start
```

সার্ভার চালু হবে `http://localhost:3000/mcp` এ।

## ফ্রি hosting-এ Deploy করার নিয়ম (Render.com দিয়ে, সবচেয়ে সহজ)

1. এই পুরো ফোল্ডারটা একটা GitHub repo-তে push করুন (GitHub account লাগবে, ফ্রি)।
2. https://render.com এ গিয়ে ফ্রি account বানান।
3. **New +** → **Web Service** সিলেক্ট করুন।
4. আপনার GitHub repo connect করুন।
5. Settings এ:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. **Deploy** চাপুন। ২-৩ মিনিট পর একটা URL পাবেন, যেমন:
   `https://music-search-mcp.onrender.com`

আপনার MCP endpoint হবে:
```
https://music-search-mcp.onrender.com/mcp
```

## Railway.app দিয়ে Deploy (বিকল্প, আরেকটু দ্রুত)

1. https://railway.app এ account বানান (GitHub দিয়ে login করা যায়)
2. **New Project** → **Deploy from GitHub repo**
3. এই repo সিলেক্ট করুন — Railway automatic build/start করে নেবে
4. **Settings → Networking → Generate Domain** চেপে public URL নিন
5. MCP endpoint: `https://<আপনার-app>.up.railway.app/mcp`

## XiaoZhi Console-এ যোগ করার নিয়ম

1. xiaozhi.me → Console → আপনার Agent এ যান
2. **Custom Services** সেকশনে **"Get MCP Endpoint"** বাটনে ক্লিক করুন
3. উপরে যে URL পেয়েছেন (যেমন `https://music-search-mcp.onrender.com/mcp`) সেটা বসান
4. **Save** চাপুন
5. Robot restart করুন — এখন "একটা গান বাজাও" বললে robot search_music/play_music tool ব্যবহার করে গান খুঁজে বলবে

## গুরুত্বপূর্ণ নোট

- এই সার্ভার শুধু **গান খুঁজে URL/info দেয়** — আসল audio playback ESP32 নিজে করতে হবে
  (যদি ESP32-এ speaker/audio decode করার ক্ষমতা থাকে) অথবা XiaoZhi platform নিজে থেকে
  সেই লিংক থেকে audio stream করে ESP32-তে পাঠাবে (এটা XiaoZhi-এর firmware/agent কনফিগের উপর নির্ভর করে)।
- Render-এর ফ্রি tier কিছুক্ষণ inactive থাকলে "sleep" করে, প্রথম request-এ কয়েক সেকেন্ড দেরি হতে পারে —
  এটা সমস্যা না, স্বাভাবিক।
- চাইলে আমি Spotify-ভিত্তিক সংস্করণও বানিয়ে দিতে পারি, কিন্তু তাতে Spotify Developer App +
  OAuth setup লাগবে, যেটা একটু বেশি ধাপের।
