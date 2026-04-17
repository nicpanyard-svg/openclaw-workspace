import json
from datetime import datetime, timezone
import uuid

with open(r'C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\crm-leads.json') as f:
    data = json.load(f)

now = datetime.now(timezone.utc).isoformat()

# 1. Update Addie Javed - no longer with Indian River County
addie_id = 'pw-65854f46'
for l in data['leads']:
    if l['id'] == addie_id:
        l['status'] = 'Invalid Email'
        l['updatedAt'] = now
        l['activities'].append({
            'id': 'ooo-addie-1',
            'type': 'ooo_reply',
            'note': 'Addie Javed is no longer with Indian River County. Referred contacts: Luanne Clark (lclark@indianriver.gov), Danny Ooley - Asst PW Dir/Operations (dooley@indianriver.gov), David Schryver - Asst PW Dir/County Surveyor (dschryver@indianriver.gov), Nancy Bunt - Asst County Admin (nbunt@indianriver.gov). Adding Danny Ooley and David Schryver as new leads.',
            'date': now,
            'by': 'Mike'
        })
        break

# 2. Mark 4 bounced leads
bounced_map = {
    'pw-01d39b05': 'vikesh.desai@wichitafallstx.gov',
    'pw-550d8fb5': 'dhenslee@texarkanatexas.gov',
    'pw-fdbbcc4a': 'ErnestoDeLaGarza@CorpusChristiTX.gov',
    'pw-8ad4b01a': 'James.Harder@amarillo.gov'
}
for l in data['leads']:
    if l['id'] in bounced_map:
        l['status'] = 'Bounced'
        l['updatedAt'] = now
        l['activities'].append({
            'id': f"bounce-{l['id']}",
            'type': 'email_bounced',
            'note': f"Email bounced - {bounced_map[l['id']]} is not a valid address.",
            'date': now,
            'by': 'Mike'
        })

# 3. Add new leads from Indian River County OOO
new_leads = [
    {
        'id': f'pw-{uuid.uuid4().hex[:8]}',
        'name': 'Danny Ooley',
        'title': 'Assistant Public Works Director/Operations',
        'company': 'Indian River County Public Works',
        'vertical': 'public_works',
        'status': 'New',
        'email': 'dooley@indianriver.gov',
        'phone': '(772) 226-1379',
        'linkedinUrl': '',
        'fit_notes': 'Indian River County FL. Referred contact from Addie Javed OOO. Asst PW Dir for Operations - strong fit for Starlink + HydraGauge for rural county infrastructure.',
        'createdAt': now,
        'activities': [],
        'touchCount': 0,
        'lastContactedAt': None,
        'updatedAt': now
    },
    {
        'id': f'pw-{uuid.uuid4().hex[:8]}',
        'name': 'David Schryver',
        'title': 'Assistant County Public Works Director/County Surveyor',
        'company': 'Indian River County Public Works',
        'vertical': 'public_works',
        'status': 'New',
        'email': 'dschryver@indianriver.gov',
        'phone': '(772) 226-1379',
        'linkedinUrl': '',
        'fit_notes': 'Indian River County FL. Referred contact from Addie Javed OOO. Surveyor/infrastructure role - good fit for HydraGauge water monitoring.',
        'createdAt': now,
        'activities': [],
        'touchCount': 0,
        'lastContactedAt': None,
        'updatedAt': now
    }
]

existing_emails = {(l.get('email') or '').lower() for l in data['leads']}
added = []
for nl in new_leads:
    if nl['email'].lower() not in existing_emails:
        data['leads'].append(nl)
        added.append(nl['name'])
        print(f"Added: {nl['name']} ({nl['email']})")
    else:
        print(f"Skipped (exists): {nl['name']}")

with open(r'C:\Users\IkeFl\.openclaw\workspace\mission-control-app\data\crm-leads.json', 'w') as f:
    json.dump(data, f, indent=2)

print('Done. CRM updated.')
