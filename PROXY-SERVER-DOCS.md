# תיעוד שרת Proxy למינהל התכנון - Base44 Integration

## כתובת השרת
```
https://i-plin.onrender.com
```

## תכונות השרת המעודכן

### 🔄 מצבי הפעלה
השרת תומך בשני מצבים:
- **DEMO MODE** - נתוני דוגמה לבדיקות
- **REAL MODE** - קריאות אמיתיות למינהל התכנון עם fallback

### 🌉 אינטגרציה עם Base44 - mcpBridge
השרת משתמש בפונקציית **mcpBridge** של Base44 לחיבור יציב ומאובטח:
- **נקודת קצה אחידה** - פונקציה אחת שמטפלת בכל המורכבות הפנימית
- **אימות אוטומטי** - אין צורך בטיפול בפרטי אימות
- **יציבות** - לא תלוי בשינויים פנימיים במבנה Base44

### 🌐 נקודות קצה חדשות

#### 1. חיפוש Proxy ישיר (עבור Base44)
```http
POST /api/search-plans
Content-Type: application/json

{
  "where": "district_name LIKE '%תל אביב%' AND pl_area_dunam >= 100",
  "resultRecordCount": 50,
  "orderByFields": "pl_date_8 DESC"
}
```

**תגובה מצופה:**
```json
{
  "success": true,
  "data": [
    {
      "attributes": {
        "pl_name": "שם התכנית",
        "pl_number": "מספר התכנית", 
        "district_name": "המחוז",
        "plan_area_name": "אזור התכנית",
        "pl_area_dunam": 150.5,
        "pl_date_8": "20231201",
        "pl_url": "https://ags.iplan.gov.il/...",
        "jurstiction_area_name": "עיריית...",
        "pl_landuse_string": "מגורים",
        "pl_housing_units": 120
      }
    }
  ],
  "total": 25,
  "execution_time": "1.2s",
  "endpoint_used": "https://ags.iplan.gov.il/..."
}
```

#### 2. בדיקת סטטוס מינהל התכנון
```http
GET /api/check-iplan-connection
```

**תגובה:**
```json
{
  "overall_status": "online|partial|offline",
  "endpoints": [
    {
      "name": "XPlan Layer 0",
      "status": "online|offline|error",
      "responseTime": "250ms",
      "url": "https://ags.iplan.gov.il/...",
      "data": "15000 records"
    }
  ],
  "timestamp": "2023-01-01T12:00:00.000Z",
  "summary": "2/3 endpoints online"
}
```

#### 3. החלפת מצב API
```http
POST /api/toggle-real-mode
Content-Type: application/json

{
  "enabled": true
}
```

**תגובה:**
```json
{
  "success": true,
  "message": "API mode switched to REAL DATA",
  "current_mode": "real",
  "USE_REAL_API": true
}
```

#### 4. בדיקת מצב נוכחי
```http
GET /api/current-mode
```

**תגובה:**
```json
{
  "mode": "real",
  "USE_REAL_API": true,
  "description": "Server is using REAL API calls to Israel Planning Administration"
}
```

## איך להשתמש עם Base44

### אפשרות 1: אינטגרציה עם mcpBridge (מומלץ)

**שלב 1: הגדרת משתנה סביבה**
```bash
# הגדר את כתובת האפליקציה שלך
export BASE44_APP_URL=https://your-base44-app.com
```

**שלב 2: השרת יתחבר אוטומטית**
השרת יבצע polling אוטומטי לפונקציית mcpBridge:
- **GET** `https://your-base44-app.com/functions/mcpBridge?action=getConversations`
- **POST** `https://your-base44-app.com/functions/mcpBridge?action=sendResponse`

### אפשרות 2: שימוש ב-Webhook (גיבוי)

**שיחה ישירה עם השרת:**
```javascript
// שליחת שאלה ישירה
const queryResult = await fetch('https://i-plin.onrender.com/api/base44/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "חפש לי תכניות מגורים בתל אביב",
    parameters: { district: "תל אביב" }
  })
});
```

**שליחת webhook מלא:**
```javascript
const webhookResult = await fetch('https://i-plin.onrender.com/api/base44/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: "conv_123",
    user_query: "חפש תכניות בירושלים",
    tool_request: {
      tool_name: "search_plans",
      parameters: { searchTerm: "ירושלים" }
    }
  })
});
```

### אפשרות 3: REST API רגיל (לבדיקות)

**ביצוע חיפוש רגיל:**
```javascript
const searchResult = await fetch('https://i-plin.onrender.com/api/search-plans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    where: "pl_landuse_string LIKE '%מגורים%'",
    resultRecordCount: 20,
    orderByFields: "pl_date_8 DESC"
  })
});

const data = await searchResult.json();
if (data.success) {
  console.log(`Found ${data.total} plans in ${data.execution_time}`);
  data.data.forEach(feature => {
    console.log(`- ${feature.attributes.pl_name} (${feature.attributes.pl_number})`);
  });
} else {
  console.error('Search failed:', data.error);
}
```

## דוגמאות WHERE clauses למינהל התכנון

### חיפוש לפי מחוז
```sql
district_name LIKE '%תל אביב%'
```

### חיפוש לפי שטח (בדונמים)
```sql
pl_area_dunam >= 100 AND pl_area_dunam <= 500
```

### חיפוש לפי ייעוד קרקע
```sql
pl_landuse_string LIKE '%מגורים%'
```

### חיפוש לפי תאריך אישור
```sql
pl_date_8 >= '20230101'
```

### חיפוש מורכב
```sql
district_name LIKE '%תל אביב%' AND pl_landuse_string LIKE '%מגורים%' AND pl_area_dunam >= 50
```

## שדות זמינים בתגובה

| שדה | תיאור |
|-----|--------|
| `pl_name` | שם התכנית |
| `pl_number` | מספר התכנית |
| `district_name` | שם המחוז |
| `plan_area_name` | שם אזור התכנית |
| `pl_area_dunam` | שטח בדונמים |
| `pl_date_8` | תאריך אישור |
| `pl_url` | קישור לתכנית |
| `jurstiction_area_name` | רשות התכנון |
| `pl_landuse_string` | ייעוד קרקע |
| `pq_authorised_quantity_105` | יחידות דיור |
| `pq_authorised_quantity_110` | שטח חדרים במ"ר |
| `pq_authorised_quantity_120` | שטח ציבורי במ"ר |

## מטפול בשגיאות

### שגיאות שרת
```json
{
  "success": false,
  "error": "Server error: connection timeout"
}
```

### שגיאות API מינהל התכנון
```json
{
  "success": false,
  "error": "All endpoints failed. Last error: HTTP 404: Not Found",
  "endpoints_tried": ["https://ags.iplan.gov.il/..."]
}
```

### שגיאות פרמטרים
```json
{
  "success": false,
  "error": "Missing required parameter: where"
}
```

## תכונות מתקדמות

### ⚡ מהירות תגובה
- זמן תגובה ממוצע: 1-3 שניות
- Timeout: 15 שניות
- Retry מטופל אוטומטית

### 🔄 Fallback אוטומטי
- במקרה של כשל בחיבור למינהל התכנון
- החזרת נתוני דוגמה עם הודעת שגיאה ברורה
- המשך פעילות השרת ללא הפסקה

### 🌍 תמיכה ב-CORS
- זמין לכל הדומיינים
- תמיכה ב-Preflight requests
- כותרות מותאמות לשילוב עם Base44

## הגדרות סביבה

```bash
# הפעלת מצב אמיתי בעת הרצת השרת
USE_REAL_API=true node iplan_http_server.js

# הגדרת Base44 mcpBridge (מומלץ)
BASE44_APP_URL=https://your-base44-app.com

# הגדרות אלטרנטיביות (לא נחוצות עם mcpBridge)
# BASE44_APP_ID=your_app_id_here  
# BASE44_API_KEY=your_api_key_here
```

## לוגים ודיבוג

השרת מציג לוגים מפורטים:
```
Received proxy request for /api/search-plans
Trying endpoint: https://ags.iplan.gov.il/...
Endpoint failed: HTTP 404: Not Found
API mode switched to: REAL DATA
```

## סטטוס השרת הנוכחי

✅ **פעיל ב-Render**: https://i-plin.onrender.com  
✅ **תומך ב-MCP Protocol**  
✅ **REST API מלא**  
✅ **Proxy למינהל התכנון**  
✅ **מצב Demo/Real**  
✅ **אינטגרציה עם Base44 mcpBridge**  
✅ **Webhook endpoints לגיבוי**  
⚠️ **שירותי מינהל התכנון**: לא זמינים כרגע (נפוץ)

## הוראות הפעלה סופיות עבור Base44

**השלב הבא שלך:**
1. הגדר את `BASE44_APP_URL` למבנה הנכון של האפליקציה שלך
2. השרת יתחיל אוטומטית לבצע polling לפונקציית mcpBridge שלך
3. תוכל לעקוב אחר הלוגים כדי לוודא שהחיבור פועל

השרת מוכן ומחכה רק לכתובת הנכונה של האפליקציה שלך!