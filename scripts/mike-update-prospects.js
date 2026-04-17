/**
 * Mike - Merge & Update Prospects
 * Merges ZoomInfo and LinkedIn results into the master prospects file.
 * Updates name and linkedinUrl fields. Flags any still unresolved.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'mission-control-app', 'data');
const PROSPECTS_FILE = path.join(DATA_DIR, 'prospects_2026-03-21.json');
const ZOOMINFO_RESULTS = path.join(__dirname, 'zoominfo-results.json');
const LINKEDIN_RESULTS = path.join(__dirname, 'linkedin-results.json');

function main() {
  const prospectsData = JSON.parse(fs.readFileSync(PROSPECTS_FILE, 'utf8'));

  // Load results
  let zoomResults = [];
  if (fs.existsSync(ZOOMINFO_RESULTS)) {
    const zoomData = JSON.parse(fs.readFileSync(ZOOMINFO_RESULTS, 'utf8'));
    zoomResults = zoomData.results || [];
    console.log(`Loaded ${zoomResults.length} ZoomInfo results (${zoomResults.filter(r => r.found).length} found)`);
  } else {
    console.log('No ZoomInfo results file found.');
  }

  let linkedinResults = [];
  if (fs.existsSync(LINKEDIN_RESULTS)) {
    const liData = JSON.parse(fs.readFileSync(LINKEDIN_RESULTS, 'utf8'));
    linkedinResults = liData.results || [];
    console.log(`Loaded ${linkedinResults.length} LinkedIn results (${linkedinResults.filter(r => r.found).length} found)`);
  } else {
    console.log('No LinkedIn results file found.');
  }

  let updated = 0;
  let stillUnresolved = 0;
  const unresolvedList = [];

  for (const prospect of prospectsData.prospects) {
    const zoom = zoomResults.find(z => z.id === prospect.id);
    const linkedin = linkedinResults.find(l => l.id === prospect.id);

    let changed = false;

    // Update name: prefer ZoomInfo name, fallback to LinkedIn
    if (prospect.name === 'LOOKUP_NEEDED') {
      if (zoom?.name) {
        prospect.name = zoom.name;
        prospect.nameSource = 'ZoomInfo';
        changed = true;
      } else if (linkedin?.linkedinName) {
        prospect.name = linkedin.linkedinName;
        prospect.nameSource = 'LinkedIn';
        changed = true;
      }
    }

    // Update title if we got something more specific
    if (zoom?.title) {
      prospect.confirmedTitle = zoom.title;
      prospect.titleSource = 'ZoomInfo';
    }

    // Update email from ZoomInfo
    if (zoom?.email) {
      prospect.email = zoom.email;
      prospect.emailSource = 'ZoomInfo';
      changed = true;
    }

    // Update LinkedIn URL: prefer ZoomInfo's LinkedIn, fallback to LinkedIn search
    if (prospect.linkedinUrl === 'LOOKUP_NEEDED') {
      if (zoom?.linkedinUrl) {
        prospect.linkedinUrl = zoom.linkedinUrl;
        prospect.linkedinSource = 'ZoomInfo';
        changed = true;
      } else if (linkedin?.linkedinUrl) {
        prospect.linkedinUrl = linkedin.linkedinUrl;
        prospect.linkedinSource = 'LinkedIn';
        changed = true;
      }
    }

    if (changed) {
      updated++;
      console.log(`  Updated ${prospect.id}: ${prospect.name} @ ${prospect.company}`);
    }

    // Flag unresolved
    if (prospect.name === 'LOOKUP_NEEDED' || prospect.linkedinUrl === 'LOOKUP_NEEDED') {
      stillUnresolved++;
      prospect.status = 'UNRESOLVED';
      const missing = [];
      if (prospect.name === 'LOOKUP_NEEDED') missing.push('name');
      if (prospect.linkedinUrl === 'LOOKUP_NEEDED') missing.push('linkedinUrl');
      prospect.unresolvedFields = missing;
      unresolvedList.push({ id: prospect.id, company: prospect.company, missing });
    } else {
      prospect.status = 'READY';
    }
  }

  // Update metadata
  prospectsData.lastUpdated = new Date().toISOString();
  prospectsData.lookupStatus = {
    totalProspects: prospectsData.prospects.length,
    resolved: prospectsData.prospects.length - stillUnresolved,
    unresolved: stillUnresolved,
    unresolvedList
  };

  // Save updated prospects
  fs.writeFileSync(PROSPECTS_FILE, JSON.stringify(prospectsData, null, 2));
  console.log(`\nProspects file updated.`);
  console.log(`  Total: ${prospectsData.prospects.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Resolved: ${prospectsData.prospects.length - stillUnresolved}`);
  console.log(`  Still unresolved: ${stillUnresolved}`);

  if (unresolvedList.length > 0) {
    console.log('\nUnresolved prospects:');
    for (const u of unresolvedList) {
      console.log(`  ${u.id} - ${u.company} (missing: ${u.missing.join(', ')})`);
    }
  }
}

main();
