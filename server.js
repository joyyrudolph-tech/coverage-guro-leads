require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Airtable = require('airtable');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.json());

const {
  FB_VERIFY_TOKEN,
  FB_PAGE_ACCESS_TOKEN,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME,
  SENDGRID_API_KEY,
  EMAIL_FROM,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  ADMIN_SECRET,
  BOOKING_LINK
} = process.env;

sgMail.setApiKey(SENDGRID_API_KEY);
const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const twilioClient = TWILIO_ACCOUNT_SID ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

/**
 * Facebook webhook verification
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

/**
 * Facebook webhook receiver
 */
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        // Messenger messages
        if (entry.messaging) {
          for (const event of entry.messaging) {
            if (event.message && !event.message.is_echo) {
              await handleIncomingMessage(event);
            }
            if (event.postback) {
              await handlePostback(event);
            }
          }
        }

        // Lead Ads
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen') {
              await handleLeadgen(change.value);
            }
          }
        }
      }

      return res.status(200).send('EVENT_RECEIVED');
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Webhook error', err);
    res.sendStatus(500);
  }
});

/**
 * Handle incoming Messenger messages
 */
async function handleIncomingMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message.text || '';

  const profile = await getUserProfile(senderId);

  const lead = {
    source: 'facebook_message',
    fb_id: senderId,
    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    message: messageText,
    phone: null,
    email: null,
    booking_link: BOOKING_LINK,
    created_at: new Date().toISOString()
  };

  await saveLead(lead);
  await sendConfirmation(lead);

  await sendFBMessage(
    senderId,
    `Thanks ${profile.first_name || ''}! Book your 10-minute protection check here: ${BOOKING_LINK}`
  );
}

/**
 * Handle Facebook Lead Ads submissions
 */
async function handleLeadgen(value) {
  const fields = {};

  if (value.field_data && Array.isArray(value.field_data)) {
    value.field_data.forEach(f => {
      fields[f.name] = f.values ? f.values.join(', ') : '';
    });
  }

  const lead = {
    source: 'facebook_lead_ad',
    fb_leadgen_id: value.leadgen_id || '',
    name: fields.full_name || `${fields.first_name || ''} ${fields.last_name || ''}`.trim(),
    email: fields.email || '',
    phone: fields.phone_number || fields.mobile_number || '',
    message: fields.message || '',
    booking_link: BOOKING_LINK,
    created_at: new Date().toISOString()
  };

  await saveLead(lead);
  await sendConfirmation(lead);
}

/**
 * Save lead to Airtable
 */
async function saveLead(lead) {
  try {
    await airtableBase(AIRTABLE_TABLE_NAME).create([{ fields: lead }]);
    console.log('Lead saved:', lead);
  } catch (err) {
    console.error('Airtable error:', err);
  }
}

/**
 * Send confirmation email + optional SMS
 */
async function sendConfirmation(lead) {
  try {
    if (lead.email) {
      await sgMail.send({
        to: lead.email,
        from: EMAIL_FROM,
        subject: 'Your 10-minute protection check with The Coverage Guro',
        text: `Hi ${lead.name || 'there'}, book your 10-minute protection check here: ${BOOKING_LINK}`
      });
    }
  } catch (err) {
    console.error('SendGrid error:', err);
  }

  if (twilioClient && lead.phone) {
    try {
      await twilioClient.messages.create({
        body: `Thanks ${lead.name || ''}. Book your 10-min protection check: ${BOOKING_LINK}`,
        from: TWILIO_FROM_NUMBER,
        to: lead.phone
      });
    } catch (err) {
      console.error('Twilio error:', err);
    }
  }
}

/**
 * Get Messenger user profile
 */
async function getUserProfile(psid) {
  try {
    const url = `https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=${FB_PAGE_ACCESS_TOKEN}`;
    const r = await axios.get(url);
    return r.data || {};
  } catch {
    return {};
  }
}

/**
 * Send message back to user
 */
async function sendFBMessage(psid, text) {
  try {
    const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${FB_PAGE_ACCESS_TOKEN}`;
    await axios.post(url, {
      recipient: { id: psid },
      message: { text }
    });
  } catch (err) {
    console.error('Send API error:', err.response?.data || err.message);
  }
}

/**
 * Admin endpoint to view leads
 */
app.get('/admin/leads', async (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) return res.status(403).send('Forbidden');

  try {
    const records = await airtableBase(AIRTABLE_TABLE_NAME)
      .select({ maxRecords: 50, sort: [{ field: 'created_at', direction: 'desc' }] })
      .firstPage();

    res.json(records.map(r => r.fields));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead capture running on port ${PORT}`));
