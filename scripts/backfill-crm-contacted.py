import json
from datetime import datetime

leads_path = r'C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\crm-leads.json'
queue_path = r'C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\mike-outreach-queue.json'

with open(leads_path,'r',encoding='utf-8') as f:
    crm = json.load(f)
with open(queue_path,'r',encoding='utf-8') as f:
    queue_data = json.load(f)

leads = crm['leads']
sent = [q for q in queue_data.get('queue',[]) if q.get('status') == 'sent']
sent_emails = {}
for q in sent:
    e = q.get('email','').lower().strip()
    if e and e not in sent_emails:
        sent_emails[e] = q

updated = 0
for l in leads:
    if not isinstance(l, dict):
        continue
    if l.get('status') != 'new':
        continue
    email = (l.get('email') or '').lower().strip()
    if email and email in sent_emails:
        q = sent_emails[email]
        ts = q.get('sentAt') or datetime.now().isoformat() + 'Z'
        l['status'] = 'Contacted'
        l['updatedAt'] = ts
        l['touchCount'] = (l.get('touchCount') or 0) + 1
        l['lastContactedAt'] = ts
        if not l.get('activities'):
            l['activities'] = []
        note = 'Email sent - Subject: ' + q.get('subject','')
        l['activities'].append({
            'id': 'backfill-' + str(updated),
            'type': 'email_sent',
            'note': note,
            'date': ts,
            'by': 'Mike'
        })
        updated += 1

crm['leads'] = leads
with open(leads_path,'w',encoding='utf-8') as f:
    json.dump(crm, f, indent=2)

still_new = len([l for l in leads if isinstance(l, dict) and l.get('status') == 'new' and l.get('email')])
contacted = len([l for l in leads if isinstance(l, dict) and l.get('status') == 'Contacted'])

print('Backfilled: ' + str(updated) + ' leads -> Contacted')
print('Still new (uncontacted): ' + str(still_new))
print('Total Contacted: ' + str(contacted))
