import requests
import time

BASE = "http://localhost:3000"
SIG = "<p>Best,<br>Nick Panyard<br>Infrastructure Networks<br>nick.panyard@inetconnected.it.com<br>(432) 894-3083</p>"

emails = [
    {
        "leadId": "water-31e0cf20",
        "leadName": "Kevin Burton",
        "company": "Irvine Ranch Water District",
        "email": "burton@irwd.com",
        "subject": "Starlink for Remote Water Infrastructure - Irvine Ranch",
        "body": f"<p>Hi Kevin,</p><p>Water districts like Irvine Ranch are using Starlink to connect remote reservoirs, pump stations, and gauging sites where traditional cellular doesn't reach - giving ops teams reliable SCADA backhaul at every asset. We pair Starlink with HydraGauge IoT water level sensors for real-time monitoring, flood warning, and compliance data across the entire system.</p><p>Would you have 20 minutes to see how other districts are deploying this?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "water-7407fdde",
        "leadName": "Cesar Baptista",
        "company": "North Texas Municipal Water District",
        "email": "cbaptista@ntmwd.com",
        "subject": "Starlink + IoT Water Monitoring for NTMWD",
        "body": f"<p>Hi Cesar,</p><p>Managing capital infrastructure across a regional water district means keeping remote assets connected - and public carriers don't always cover the full network. We help districts like NTMWD deploy Starlink for reliable backhaul at remote pump stations and storage facilities, then layer in HydraGauge IoT sensors for real-time water level monitoring and compliance reporting.</p><p>Would you have 20 minutes to see how this works in practice?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "water-e9b1395b",
        "leadName": "Jacob Walsh",
        "company": "San Jose Water",
        "email": "jake_walsh@sjwater.com",
        "subject": "Starlink + Real-Time Water Monitoring for San Jose Water",
        "body": f"<p>Hi Jake,</p><p>Engineering teams at water utilities are using Starlink to connect remote reservoirs and pump stations where cellular coverage falls short - giving field teams and SCADA systems reliable backhaul regardless of location. We pair that with HydraGauge IoT water level sensors for real-time visibility, flood warning, and regulatory compliance.</p><p>Worth a 20-minute call to see how other utilities are running this?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "water-210d06c1",
        "leadName": "Peter Jauch",
        "company": "Las Vegas Valley Water District",
        "email": "peter.jauch@lvvwd.com",
        "subject": "Starlink Connectivity for LVVWD Remote Infrastructure",
        "body": f"<p>Hi Peter,</p><p>In a service area like Las Vegas Valley, connecting remote wellfields, pump stations, and storage sites is a real challenge. Starlink is solving it for water utilities across the Southwest - we combine Starlink backhaul with HydraGauge IoT sensors to give your engineering team real-time water level data and SCADA connectivity at every remote asset.</p><p>Would you have 20 minutes to connect?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "water-7b1e01a8",
        "leadName": "Dean Powell",
        "company": "South Florida Water Management District",
        "email": "dpowell@sfwmd.gov",
        "subject": "Starlink + Flood Monitoring for South Florida Water Management",
        "body": f"<p>Hi Dean,</p><p>Managing watershed assets across South Florida means staying ahead of water levels in real time - especially during storm events. We help water management districts deploy Starlink to connect remote gauging sites and control structures, paired with HydraGauge IoT sensors for real-time flood monitoring and compliance reporting across the network.</p><p>Would you have 20 minutes to see how this works?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "retail-682c3549",
        "leadName": "Matthew Rubin",
        "company": "Tractor Supply Co",
        "email": "mrubin@tractorsupply.com",
        "subject": "Starlink + Private LTE for Tractor Supply Stores and DCs",
        "body": f"<p>Hi Matthew,</p><p>With 2,300+ stores and distribution centers - many in rural areas - Tractor Supply faces connectivity challenges that public carriers can't solve at scale. We deploy Starlink as the first step, giving every location reliable connectivity, then build out private LTE for full campus coverage at larger DCs and hub facilities.</p><p>Worth a 20-minute call to walk through how other retailers are running this?</p>{SIG}",
        "status": "pending"
    },
    {
        "leadId": "retail-f8530e02",
        "leadName": "Adam Sand",
        "company": "Best Buy",
        "email": "adam.sand@bestbuy.com",
        "subject": "Private LTE and Starlink for Best Buy Retail and Distribution",
        "body": f"<p>Hi Adam,</p><p>As CTO at Best Buy, you're managing connectivity across hundreds of high-traffic retail locations and distribution centers where reliability directly impacts operations and digital transformation. We deploy private LTE and Starlink that give retailers owned, reliable connectivity at every store and DC - with full network control.</p><p>Would you have 20 minutes to explore this?</p>{SIG}",
        "status": "pending"
    },
]

queued = 0
for e in emails:
    try:
        r = requests.post(f"{BASE}/api/mike/queue", json=e, timeout=10)
        if r.status_code in (200, 201):
            print(f"✓ Queued: {e['leadName']} - {e['company']}")
            queued += 1
        else:
            print(f"✗ Failed ({r.status_code}): {e['leadName']} - {r.text[:100]}")
    except Exception as ex:
        print(f"✗ Error: {e['leadName']} - {ex}")
    time.sleep(0.5)

print(f"\nDone. {queued}/{len(emails)} emails queued.")
