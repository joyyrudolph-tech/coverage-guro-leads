# Coverage Guro Lead Capture Service

This service captures:
- Facebook Page messages  
- Facebook Lead Ads submissions  

Then it:
- Saves leads into Airtable  
- Sends confirmation emails via SendGrid  
- Sends optional SMS via Twilio  
- Provides an admin endpoint to view recent leads  

---

## 📌 Endpoints

### **Webhook**
`/webhook`  
Used by Facebook Messenger + Lead Ads.

### **Admin Leads**
`/admin/leads?secret=ADMIN_SECRET`  
Returns the 50 most recent leads.

---

## 📌 Environment Variables

See `.env.example` for all required keys:

- Facebook tokens  
- Airtable API keys  
- SendGrid API key  
- Twilio (optional)  
- Admin secret  
- Booking link  

---

## 📌 Running Locally

Install dependencies:

    npm ci

Start the server:

    node server.js

---

## 📌 Deployment (Render)

Build command:

    npm ci

Start command:

    node server.js

Add all environment variables from `.env.example`.

Render will give you a URL like:

    https://your-service.onrender.com/webhook

Paste that into Meta Webhooks.

---

## 📌 Notes

- Messenger messages and Lead Ads both create leads.  
- Leads are saved to Airtable automatically.  
- Confirmation emails/SMS are optional depending on which keys you provide.  
