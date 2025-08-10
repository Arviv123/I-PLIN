# הוראות חיבור שרת I-PLIN ל-Claude Desktop

## בעיה עם Claude Desktop
Claude Desktop **לא תומך בשרתי SSE מרוחקים** דרך קובץ JSON רגיל.
השרת שלנו רץ ב-https://i-plin.onrender.com/sse וזה שרת מרוחק.

## פתרונות אפשריים:

### 1. Claude Code (המומלץ)
במקום Claude Desktop, השתמש ב-**Claude Code**:
```bash
claude mcp add --transport sse iplan-server https://i-plin.onrender.com/sse
```

### 2. Claude Desktop - דרך Settings
1. פתח Claude Desktop
2. לך ל-**Settings** > **Connectors**
3. הוסף **Custom Connector**:
   - Name: I-PLIN Planning
   - URL: https://i-plin.onrender.com/sse
   - Type: SSE

### 3. בדיקה ידנית
תוכל לבדוק אם השרת עובד:

**בדיקת כלים:**
```bash
curl https://i-plin.onrender.com/api/tools
```

**הפעלת כלי:**
```bash
curl -X POST https://i-plin.onrender.com/api/call \
  -H "Content-Type: application/json" \
  -d '{"name": "search_plans", "arguments": {"searchTerm": "תל אביב"}}'
```

## למה Claude Desktop לא עובד?
- Claude Desktop נועד לשרתי MCP **מקומיים** (stdio)
- שרתים **מרוחקים** (SSE/HTTP) דורשים הגדרה מיוחדת
- רק משתמשי Pro/Team/Enterprise יכולים להוסיף connectors מרוחקים

## המלצה - Claude Code
השתמש ב-**Claude Code** עם הפקודה:
```bash
claude mcp add --transport sse iplan-server https://i-plin.onrender.com/sse
```

## שרת מוכן ופועל ✅
- **השרת רץ כרגע בכתובת**: https://i-plin.onrender.com
- **בדיקת בריאות**: https://i-plin.onrender.com/
- **API זמין**: https://i-plin.onrender.com/api/tools
- **נתונים**: שרת הדגמה עם נתוני דוגמה איכותיים
- **כלים זמינים**: search_plans, get_plan_details, search_by_location

## בדיקה מהירה
```bash
# בדיקת כלים זמינים
curl https://i-plin.onrender.com/api/tools

# חיפוש תכניות
curl -X POST https://i-plin.onrender.com/api/call \
  -H "Content-Type: application/json" \
  -d '{"name": "search_plans", "arguments": {"searchTerm": "test"}}'

# פרטי תכנית
curl -X POST https://i-plin.onrender.com/api/call \
  -H "Content-Type: application/json" \
  -d '{"name": "get_plan_details", "arguments": {"planNumber": "123"}}'

# חיפוש לפי מיקום (תל אביב)
curl -X POST https://i-plin.onrender.com/api/call \
  -H "Content-Type: application/json" \
  -d '{"name": "search_by_location", "arguments": {"x": 34.7818, "y": 32.0853, "radius": 2000}}'
```