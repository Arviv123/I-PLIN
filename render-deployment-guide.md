# פריסה ב-Render.com

## שלב 1: העלאה לגיטהאב (אם עדיין לא עשית)
1. כנס ל-GitHub.com
2. צור repository חדש: `iplan-mcp-server`
3. העלה את הקוד:
```bash
git remote add origin https://github.com/YOUR_USERNAME/iplan-mcp-server.git
git branch -M main
git push -u origin main
```

## שלב 2: פריסה ב-Render
1. כנס ל-https://render.com
2. התחבר עם GitHub
3. לחץ "New +" ובחר "Web Service"
4. בחר את repository: `iplan-mcp-server`
5. הגדרות:
   - **Name**: iplan-mcp-server
   - **Environment**: Node
   - **Region**: Oregon (US West) או Frankfurt (Europe)
   - **Branch**: main
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

6. לחץ "Create Web Service"

Render יפרוס אוטומטית ותקבל URL כמו:
`https://iplan-mcp-server.onrender.com`

## נקודות קצה שיהיו זמינות:
- `https://iplan-mcp-server.onrender.com/` - בדיקת בריאות
- `https://iplan-mcp-server.onrender.com/sse` - MCP endpoint

## הערה חשובה:
בתוכנית החינמית של Render, השרת נכנס למצב שינה אחרי 15 דקות של אי-שימוש ויתעורר כשמישהו ניגש אליו (עשוי לקחת 30-60 שניות).