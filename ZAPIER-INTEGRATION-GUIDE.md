# מדריך אינטגרציה עם Zapier - I-PLIN Planning Server

## 🔗 כתובות השרת

**שרת I-PLIN:** `https://i-plin.onrender.com`
**נקודות קצה ל-Zapier:**
- **POST** `/api/zapier/query` - עיבוד שאלות
- **GET** `/api/zapier/test` - בדיקת חיבור

## 🚀 שלבי ההגדרה ב-Zapier

### שלב 1: יצירת Zap ראשון - שליחת שאלות לשרת
1. **Trigger:** Webhook by Zapier "Catch Hook" 
   - זה יקבל webhooks מהאפליקציה שלך
2. **Action:** Webhooks by Zapier "POST" 
   - URL: `https://i-plin.onrender.com/api/zapier/query`
   - Method: POST
   - Data: 
     ```json
     {
       "conversation_id": "{{trigger_body__conversation_id}}",
       "user_query": "{{trigger_body__user_query}}",
       "user_name": "{{trigger_body__user_name}}",
       "parameters": "{{trigger_body__parameters}}"
     }
     ```

### שלב 2: יצירת Zap שני - החזרת תשובות לאפליקציה
1. **Trigger:** Webhooks by Zapier "Catch Hook"
   - זה יקבל תשובות מהשרת שלי
2. **Action:** Webhooks by Zapier "POST"
   - URL: `https://real-estate-ai-advisor-fca13530.base44.app/functions/handleResponse`
   - או כל endpoint אחר שתיצור באפליקציה שלך
   - Data:
     ```json
     {
       "conversation_id": "{{trigger_body__conversation_id}}",
       "answer": "{{trigger_body__answer}}",
       "tool_used": "{{trigger_body__tool_used}}",
       "success": "{{trigger_body__success}}"
     }
     ```

## 📨 פורמט הנתונים

### מהאפליקציה שלך ל-Zapier:
```json
{
  "conversation_id": "conv_abc123",
  "user_query": "חפש תכניות מגורים בתל אביב",
  "user_name": "יוסי כהן",
  "parameters": {
    "district": "תל אביב",
    "landuse": "מגורים"
  }
}
```

### מהשרת שלי ל-Zapier (תגובה):
```json
{
  "success": true,
  "conversation_id": "conv_abc123",
  "user_query": "חפש תכניות מגורים בתל אביב",
  "tool_used": "search_plans",
  "answer": "נמצאו 15 תכניות מגורים בתל אביב. הנה הפרטים:\n\n1. תכנית מס' 12345 - רחוב דיזנגוף...",
  "timestamp": "2025-01-10T20:00:00.000Z",
  "processing_time": "1.2s"
}
```

## 🧪 בדיקות

### בדיקת חיבור:
```bash
curl https://i-plin.onrender.com/api/zapier/test
```

### בדיקת עיבוד שאלה:
```bash
curl -X POST https://i-plin.onrender.com/api/zapier/query \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test_123",
    "user_query": "חפש תכניות בירושלים",
    "user_name": "בדיקה"
  }'
```

## 🔧 התאמות נוספות באפליקציה שלך

### 1. יצירת webhook outgoing
צור פונקציה באפליקציה שלך ששולחת webhook ל-Zapier כשמשתמש שולח הודעה:

```javascript
// באפליקציה שלך - שליחת שאלה ל-Zapier
async function sendToZapier(conversationId, userQuery, userName) {
  const zapierWebhookUrl = 'YOUR_ZAPIER_WEBHOOK_URL_HERE';
  
  await fetch(zapierWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      user_query: userQuery,
      user_name: userName,
      parameters: {} // פרמטרים נוספים אם נדרש
    })
  });
}
```

### 2. יצירת endpoint לקבלת תשובות
צור endpoint באפליקציה שלך לקבלת תשובות מ-Zapier:

```javascript
// functions/handleResponse.js (או שם דומה)
export default async function handleResponse(req) {
  const { conversation_id, answer, tool_used, success } = req.body;
  
  if (success) {
    // עדכן את השיחה עם התשובה
    await ChatConversation.update(conversation_id, {
      messages: [...existing_messages, {
        role: 'assistant',
        content: answer,
        tool_used: tool_used,
        timestamp: new Date().toISOString()
      }]
    });
  }
  
  return { success: true };
}
```

## ⚡ יתרונות הפתרון

✅ **פשוט לתחזוקה** - אין קוד מורכב
✅ **אמין** - Zapier מטפל בשגיאות ועומסים  
✅ **גמיש** - קל לשנות ולהתאים
✅ **ללא תלות** - כל מערכת עובדת בנפרד
✅ **סקלבילי** - Zapier מטפל בעומסים גבוהים

## 🎯 השלבים הבאים

1. **צור את שני ה-Zaps ב-Zapier**
2. **קבל את webhook URLs מ-Zapier**  
3. **הוסף את הפונקציות באפליקציה שלך**
4. **בדוק את כל התהליך**

הכל מוכן מהצד שלי! השרת שלי מחכה ל-webhooks מ-Zapier 🚀