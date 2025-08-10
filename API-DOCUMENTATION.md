# תיעוד API שרת I-PLIN - מינהל התכנון

## כתובת השרת
```
https://i-plin.onrender.com
```

## נקודות קצה זמינות

### 1. בדיקת בריאות השרת
```
GET https://i-plin.onrender.com/
```
**תגובה:**
```json
{
  "status": "running",
  "server": "Iplan MCP Server", 
  "version": "1.0.0",
  "endpoints": {
    "health": "/",
    "mcp": "/sse",
    "test": "/test-iplan"
  }
}
```

### 2. בדיקת חיבור למינהל התכנון
```
GET https://i-plin.onrender.com/test-iplan
```
**תגובה:**
```json
{
  "status": "testing",
  "message": "Testing multiple Iplan endpoints...",
  "base_url": "https://mavat.iplan.gov.il/rest",
  "endpoints_to_test": [...],
  "note": "This is a safe test that won't crash the server"
}
```

### 3. REST API לקבלת רשימת כלים
```
GET https://i-plin.onrender.com/api/tools
```
**תגובה אמורה להיות:**
```json
{
  "tools": [
    {
      "name": "search_plans",
      "description": "חיפוש תכניות במינהל התכנון הישראלי עם פילטרים מתקדמים",
      "inputSchema": {
        "type": "object",
        "properties": {
          "searchTerm": {
            "type": "string",
            "description": "שם או מספר תכנית לחיפוש"
          },
          "district": {
            "type": "string", 
            "description": "מחוז (תל אביב, ירושלים, חיפה, מחוז הצפון, מחוז המרכז, מחוז הדרום)"
          }
        }
      }
    },
    {
      "name": "get_plan_details",
      "description": "קבלת פרטי תכנית ספציפית לפי מספר תכנית",
      "inputSchema": {
        "type": "object",
        "properties": {
          "planNumber": {
            "type": "string",
            "description": "מספר התכנית"
          }
        },
        "required": ["planNumber"]
      }
    },
    {
      "name": "search_by_location",
      "description": "חיפוש תכניות לפי מיקום גיאוגרפי",
      "inputSchema": {
        "type": "object",
        "properties": {
          "x": {"type": "number", "description": "קואורדינטת X (longitude)"},
          "y": {"type": "number", "description": "קואורדינטת Y (latitude)"},
          "radius": {"type": "number", "description": "רדיוס חיפוש במטרים"}
        },
        "required": ["x", "y"]
      }
    }
  ]
}
```

### 4. REST API להפעלת כלי
```
POST https://i-plin.onrender.com/api/call
Content-Type: application/json

{
  "name": "search_plans",
  "arguments": {
    "searchTerm": "תל אביב",
    "district": "תל אביב"
  }
}
```

**תגובה:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "חיפוש תכניות עבור: {\"searchTerm\":\"תל אביב\",\"district\":\"תל אביב\"}\n\nהשירות זמין אך מחובר לגרסת בדיקה."
    }
  ]
}
```

### 5. MCP Endpoint (עבור Claude וכלים תואמי MCP)
```
GET/POST https://i-plin.onrender.com/sse
```
זהו endpoint של Server-Sent Events לפרוטוקול MCP.

## איך להתחבר מצד לקוח (AI System)

### שלב 1: גילוי כלים
```bash
curl -X GET https://i-plin.onrender.com/api/tools
```

### שלב 2: הפעלת כלי
```bash
curl -X POST https://i-plin.onrender.com/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_plans", 
    "arguments": {
      "searchTerm": "תל אביב"
    }
  }'
```

### שלב 3: עיבוד תגובה
השרת מחזיר אובייקט עם `content` array שמכיל `text` עם התוצאה.

## דוגמאות קוד

### JavaScript/Node.js
```javascript
// קבלת כלים זמינים
const toolsResponse = await fetch('https://i-plin.onrender.com/api/tools');
const tools = await toolsResponse.json();
console.log('Available tools:', tools.tools);

// הפעלת כלי
const callResponse = await fetch('https://i-plin.onrender.com/api/call', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    name: 'search_plans',
    arguments: {searchTerm: 'תל אביב'}
  })
});
const result = await callResponse.json();
console.log('Result:', result);
```

### Python
```python
import requests

# קבלת כלים זמינים  
tools_response = requests.get('https://i-plin.onrender.com/api/tools')
tools = tools_response.json()
print('Available tools:', tools['tools'])

# הפעלת כלי
call_response = requests.post('https://i-plin.onrender.com/api/call', 
  json={
    'name': 'search_plans',
    'arguments': {'searchTerm': 'תל אביב'}
  })
result = call_response.json() 
print('Result:', result)
```

## פורמט תגובות

כל הכלים מחזירים תגובה בפורמט:
```json
{
  "content": [
    {
      "type": "text",
      "text": "תוכן התגובה בעברית..."
    }
  ]
}
```

## שגיאות אפשריות

### 400 - Bad Request
```json
{"error": "Tool name is required"}
```

### 500 - Internal Server Error  
```json
{"error": "Tool 'unknown_tool' not found"}
```

## הערות חשובות

1. **שרת Proxy מתקדם** - השרת כולל יכולות Proxy אמיתיות למינהל התכנון
2. **מצבי הפעלה** - תומך במצב DEMO ומצב REAL עם fallback אוטומטי  
3. **CORS מופעל** - ניתן לגשת מכל דומיין
4. **השרת רץ 24/7** אך עשוי להיכנס לשינה אחרי 15 דקות ללא שימוש (Render free tier)
5. **כל הכלים זמינים** - אין צורך באימות או API key
6. **אינטגרציה עם Base44** - נקודות קצה מיוחדות לחיבור ישיר עם Base44 AI

## נקודות קצה נוספות

### Proxy למינהל התכנון (עבור Base44)
```
POST /api/search-plans
GET /api/check-iplan-connection  
POST /api/toggle-real-mode
GET /api/current-mode
```

לפרטים מלאים על השרת המתקדם, ראה: [PROXY-SERVER-DOCS.md](./PROXY-SERVER-DOCS.md)

## בדיקה מהירה
```bash
curl https://i-plin.onrender.com/api/tools | jq .
```
אמור להחזיר 3 כלים: search_plans, get_plan_details, search_by_location